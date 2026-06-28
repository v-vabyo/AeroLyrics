import { app } from "electron";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import * as https from "node:https";

const LRCLIB_BASE = "https://lrclib.net/api";
const USER_AGENT = "AeroLyrics/1.0.0 (https://github.com/aerolyrics)";

interface LRCLibResponse {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
  offset?: number;
}

const getCacheDir = () => join(app.getPath("userData"), "Lyrics");

const memoryCache: Record<string, LRCLibResponse> = {};

async function ensureCacheDir() {
  try {
    await fs.mkdir(getCacheDir(), { recursive: true });
  } catch (e) {}
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, "_").trim();
}

function getCachePath(trackName: string, artistName: string): string {
  const safeName = sanitizeFilename(`${trackName} - ${artistName}`);
  return join(getCacheDir(), `${safeName}.json`);
}

async function loadFromCache(
  trackName: string,
  artistName: string,
  expectedDuration: number,
): Promise<LRCLibResponse | null> {
  const cacheKey = `${trackName}|${artistName}`;
  const cached = memoryCache[cacheKey];
  
  if (cached) {
    if (Math.abs(cached.duration - expectedDuration) === 0) return cached;
    delete memoryCache[cacheKey]; // Invalid duration, clear memory cache
  }

  try {
    await ensureCacheDir();
    const filePath = getCachePath(trackName, artistName);
    const data = await fs.readFile(filePath, "utf-8");
    const result = JSON.parse(data) as LRCLibResponse;
    if (Math.abs(result.duration - expectedDuration) === 0) {
      memoryCache[cacheKey] = result;
      return result;
    } else {
      return null;
    }
  } catch (e) {
    return null;
  }
}

async function saveToCache(
  trackName: string,
  artistName: string,
  result: LRCLibResponse,
) {
  const cacheKey = `${trackName}|${artistName}`;
  memoryCache[cacheKey] = result;

  try {
    await ensureCacheDir();
    const filePath = getCachePath(trackName, artistName);
    await fs.writeFile(filePath, JSON.stringify(result, null, 2), "utf-8");
  } catch (e) {
    console.error("[LRCLIB-Main] Failed to save cache to disk:", e);
  }
}

export async function saveLyricsOffsetToCache(
  trackName: string,
  artistName: string,
  offset: number
) {
  // We don't have expectedDuration here, so we load blindly from file
  try {
    const filePath = getCachePath(trackName, artistName);
    const data = await fs.readFile(filePath, "utf-8");
    const cached = JSON.parse(data) as LRCLibResponse;
    if (cached) {
      cached.offset = offset;
      await saveToCache(trackName, artistName, cached);
    }
  } catch (e) {
    // Ignore error if cache doesn't exist
  }
}

export async function saveLyricOverride(
  trackName: string,
  artistName: string,
  lyricData: LRCLibResponse
) {
  // Save directly to cache, bypassing any strict duration checks
  await saveToCache(trackName, artistName, lyricData);
}

async function nodeFetch(
  url: string,
): Promise<{ ok: boolean; status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT,
        },
      },
      (res) => {
        res.setEncoding("utf8");
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            ok:
              res.statusCode !== undefined &&
              res.statusCode >= 200 &&
              res.statusCode < 300,
            status: res.statusCode || 500,
            data,
          });
        });
      },
    );

    req.on("error", (err) => {
      reject(err);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("The operation was aborted due to timeout"));
    });

    req.setTimeout(15000);
  });
}

export async function fetchLyricsFromMain(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSeconds: number,
): Promise<LRCLibResponse | null> {
  const startTime = Date.now();

  const expectedDuration = Math.round(durationSeconds);

  const cached = await loadFromCache(trackName, artistName, expectedDuration);
  if (cached) {
    console.log(
      `[LRCLIB-Main] ✓ Loaded lyrics from LOCAL CACHE for "${trackName}" (0ms)`,
    );
    return cached;
  }

  console.log(
    `[LRCLIB-Main] Fetching lyrics from network for "${trackName}" by "${artistName}"...`,
  );

  const TRACK_OVERRIDES: Record<string, number> = {
    "Sunset Di Tanah Anarki|Superman Is Dead": 34057882,
  };

  const overrideId = TRACK_OVERRIDES[`${trackName}|${artistName}`];
  if (overrideId) {
    const overrideUrl = `${LRCLIB_BASE}/get/${overrideId}`;
    const overrideResult = await fetchGet(overrideUrl);
    if (overrideResult && overrideResult.syncedLyrics) {
      console.log(
        `[LRCLIB-Main] ✓ Got synced lyrics via OVERRIDE in ${Date.now() - startTime}ms`,
      );
      await saveToCache(trackName, artistName, overrideResult);
      return overrideResult;
    }
  }

  const getParams = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName,
    album_name: albumName,
    duration: Math.round(durationSeconds).toString(),
  });

  const searchParams = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName,
  });

  const getUrl = `${LRCLIB_BASE}/get?${getParams.toString()}`;
  const searchUrl = `${LRCLIB_BASE}/search?${searchParams.toString()}`;

  try {
    const getPromise = fetchGet(getUrl);
    const searchPromise = fetchSearch(searchUrl, durationSeconds);

    const getResult = await getPromise;
    if (
      getResult &&
      getResult.syncedLyrics &&
      Math.abs(getResult.duration - expectedDuration) === 0
    ) {
      console.log(
        `[LRCLIB-Main] ✓ Got synced lyrics via /get in ${Date.now() - startTime}ms`,
      );
      await saveToCache(trackName, artistName, getResult);
      return getResult;
    }

    const searchResult = await searchPromise;
    if (
      searchResult &&
      searchResult.syncedLyrics &&
      Math.abs(searchResult.duration - expectedDuration) === 0
    ) {
      console.log(
        `[LRCLIB-Main] ✓ Got synced lyrics via /search in ${Date.now() - startTime}ms`,
      );
      await saveToCache(trackName, artistName, searchResult);
      return searchResult;
    }

    // If we reach here, neither get nor search had valid SYNCED lyrics matching the duration exactly.
    // We can fallback to plain lyrics, but we MUST strip syncedLyrics so we don't accidentally display poorly-synced lyrics!
    if (getResult && getResult.plainLyrics) {
      getResult.syncedLyrics = null;
      console.log(
        `[LRCLIB-Main] ✓ Got plain lyrics via /get (Synced lyrics discarded due to strict duration mismatch) in ${Date.now() - startTime}ms`,
      );
      await saveToCache(trackName, artistName, getResult);
      return getResult;
    }
    if (searchResult && searchResult.plainLyrics) {
      searchResult.syncedLyrics = null;
      console.log(
        `[LRCLIB-Main] ✓ Got plain lyrics via /search (Synced lyrics discarded due to strict duration mismatch) in ${Date.now() - startTime}ms`,
      );
      await saveToCache(trackName, artistName, searchResult);
      return searchResult;
    }

    console.log(
      `[LRCLIB-Main] ✗ No lyrics found (${Date.now() - startTime}ms)`,
    );
    return null;
  } catch (error) {
    console.error("[LRCLIB-Main] Error:", error);
    return null;
  }
}

async function fetchGet(url: string): Promise<LRCLibResponse | null> {
  try {
    console.log(`[LRCLIB-Get] Request: ${url}`);
    const res = await nodeFetch(url);
    console.log(`[LRCLIB-Get] Response: ${res.status} (ok=${res.ok})`);
    if (!res.ok) {
      console.log(`[LRCLIB-Get] Error body: ${res.data.slice(0, 100)}`);
      return null;
    }
    return JSON.parse(res.data) as LRCLibResponse;
  } catch (err: any) {
    console.error(`[LRCLIB-Get] Exception: ${err.message}`);
    return null;
  }
}

async function fetchSearch(
  url: string,
  expectedDuration: number,
): Promise<LRCLibResponse | null> {
  try {
    console.log(`[LRCLIB-Search] Request: ${url}`);
    const res = await nodeFetch(url);
    console.log(`[LRCLIB-Search] Response: ${res.status} (ok=${res.ok})`);
    if (!res.ok) {
      console.log(`[LRCLIB-Search] Error body: ${res.data.slice(0, 100)}`);
      return null;
    }
    const results = JSON.parse(res.data) as LRCLibResponse[];
    console.log(`[LRCLIB-Search] Found ${results.length} results`);

    const validResults = results
      .filter((r) => Math.abs(r.duration - expectedDuration) === 0)
      .sort(
        (a, b) =>
          Math.abs(a.duration - expectedDuration) -
          Math.abs(b.duration - expectedDuration),
      );

    if (validResults.length > 0) {
      return validResults.find((r) => r.syncedLyrics) || validResults[0];
    }

    results.sort(
      (a, b) =>
        Math.abs(a.duration - expectedDuration) -
        Math.abs(b.duration - expectedDuration),
    );
    const closest = results[0];
    if (closest) {
      closest.syncedLyrics = null;
      return closest;
    }
    return null;
  } catch (err: any) {
    console.error(`[LRCLIB-Search] Exception: ${err.message}`);
    return null;
  }
}

export async function searchAllLyrics(
  trackName: string,
  artistName: string
): Promise<LRCLibResponse[]> {
  const searchParams = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName,
  });
  const searchUrl = `${LRCLIB_BASE}/search?${searchParams.toString()}`;
  try {
    const res = await nodeFetch(searchUrl);
    if (!res.ok) return [];
    return JSON.parse(res.data) as LRCLibResponse[];
  } catch {
    return [];
  }
}
