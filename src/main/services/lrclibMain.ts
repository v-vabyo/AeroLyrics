import { app } from 'electron'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import * as https from 'node:https'

const LRCLIB_BASE = 'https://lrclib.net/api'
const USER_AGENT = 'AeroLyrics/1.0.0 (https://github.com/aerolyrics)'

interface LRCLibResponse {
  id: number
  trackName: string
  artistName: string
  albumName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

const getCacheDir = () => join(app.getPath('userData'), 'Lyrics')

// In-memory cache for the main process to avoid constant disk reads
const memoryCache: Record<string, LRCLibResponse> = {}

// Make sure cache directory exists
async function ensureCacheDir() {
  try {
    await fs.mkdir(getCacheDir(), { recursive: true })
  } catch (e) {
    // ignore
  }
}

// Sanitize string to be a valid Windows filename
function sanitizeFilename(name: string): string {
  // Replace < > : " / \ | ? * with underscore
  return name.replace(/[<>:"/\\|?*]+/g, '_').trim()
}

function getCachePath(trackName: string, artistName: string): string {
  const safeName = sanitizeFilename(`${trackName} - ${artistName}`)
  return join(getCacheDir(), `${safeName}.json`)
}

async function loadFromCache(trackName: string, artistName: string): Promise<LRCLibResponse | null> {
  const cacheKey = `${trackName}|${artistName}`
  if (memoryCache[cacheKey]) return memoryCache[cacheKey]

  try {
    await ensureCacheDir()
    const filePath = getCachePath(trackName, artistName)
    const data = await fs.readFile(filePath, 'utf-8')
    const result = JSON.parse(data) as LRCLibResponse
    memoryCache[cacheKey] = result
    return result
  } catch (e) {
    return null
  }
}

async function saveToCache(trackName: string, artistName: string, result: LRCLibResponse) {
  const cacheKey = `${trackName}|${artistName}`
  memoryCache[cacheKey] = result
  
  try {
    await ensureCacheDir()
    const filePath = getCachePath(trackName, artistName)
    await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8')
  } catch (e) {
    console.error('[LRCLIB-Main] Failed to save cache to disk:', e)
  }
}

/**
 * Fast Node.js fetch using pure 'https' module (bypasses Chromium completely).
 */
async function nodeFetch(url: string): Promise<{ ok: boolean; status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': USER_AGENT
      }
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        resolve({
          ok: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode || 500,
          data
        })
      })
    })

    req.on('error', (err) => {
      reject(err)
    })
    
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('The operation was aborted due to timeout'))
    })
    
    // Some LRCLIB queries genuinely take 8-10 seconds! 
    // We must allow enough time for the first fetch, then cache will make it 0ms.
    req.setTimeout(15000)
  })
}

/**
 * Fetch synced lyrics from LRCLIB — runs in Node.js (main process).
 */
export async function fetchLyricsFromMain(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSeconds: number
): Promise<LRCLibResponse | null> {
  const startTime = Date.now()

  // 1. Check local file cache first (INSTANT)
  const cached = await loadFromCache(trackName, artistName)
  if (cached) {
    console.log(`[LRCLIB-Main] ✓ Loaded lyrics from LOCAL CACHE for "${trackName}" (0ms)`)
    return cached
  }

  console.log(`[LRCLIB-Main] Fetching lyrics from network for "${trackName}" by "${artistName}"...`)

  // Hardcoded overrides for tracks where LRCLIB has bad/inaccurate official data.
  // E.g., Sunset Di Tanah Anarki's default match is 14s off sync.
  const TRACK_OVERRIDES: Record<string, number> = {
    'Sunset Di Tanah Anarki|Superman Is Dead': 34057882
  }
  
  const overrideId = TRACK_OVERRIDES[`${trackName}|${artistName}`]
  if (overrideId) {
    const overrideUrl = `${LRCLIB_BASE}/get/${overrideId}`
    const overrideResult = await fetchGet(overrideUrl)
    if (overrideResult && overrideResult.syncedLyrics) {
      console.log(`[LRCLIB-Main] ✓ Got synced lyrics via OVERRIDE in ${Date.now() - startTime}ms`)
      await saveToCache(trackName, artistName, overrideResult)
      return overrideResult
    }
  }

  const getParams = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName,
    album_name: albumName,
    duration: Math.round(durationSeconds).toString()
  })

  const searchParams = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName
  })

  const getUrl = `${LRCLIB_BASE}/get?${getParams.toString()}`
  const searchUrl = `${LRCLIB_BASE}/search?${searchParams.toString()}`

  try {
    const getPromise = fetchGet(getUrl)
    const searchPromise = fetchSearch(searchUrl, durationSeconds)

    // Prefer /api/get because it does sophisticated exact matching on LRCLIB's end.
    // Racing it with /api/search often results in picking bad community-uploaded data.
    const getResult = await getPromise
    if (getResult && getResult.syncedLyrics && Math.abs(getResult.duration - durationSeconds) <= 1) {
      console.log(`[LRCLIB-Main] ✓ Got synced lyrics via /get in ${Date.now() - startTime}ms`)
      await saveToCache(trackName, artistName, getResult)
      return getResult
    }

    // Fallback to search if get fails or has no synced lyrics
    const searchResult = await searchPromise
    if (searchResult && searchResult.syncedLyrics && Math.abs(searchResult.duration - durationSeconds) <= 1) {
      console.log(`[LRCLIB-Main] ✓ Got synced lyrics via /search in ${Date.now() - startTime}ms`)
      await saveToCache(trackName, artistName, searchResult)
      return searchResult
    }

    // Both failed to provide synced lyrics. Fall back to plain lyrics.
    if (getResult && getResult.plainLyrics) {
      console.log(`[LRCLIB-Main] ✓ Got plain lyrics via /get in ${Date.now() - startTime}ms`)
      await saveToCache(trackName, artistName, getResult)
      return getResult
    }
    if (searchResult && searchResult.plainLyrics) {
      console.log(`[LRCLIB-Main] ✓ Got plain lyrics via /search in ${Date.now() - startTime}ms`)
      await saveToCache(trackName, artistName, searchResult)
      return searchResult
    }

    console.log(`[LRCLIB-Main] ✗ No lyrics found (${Date.now() - startTime}ms)`)
    return null
  } catch (error) {
    console.error('[LRCLIB-Main] Error:', error)
    return null
  }
}

async function fetchGet(url: string): Promise<LRCLibResponse | null> {
  try {
    console.log(`[LRCLIB-Get] Request: ${url}`)
    const res = await nodeFetch(url)
    console.log(`[LRCLIB-Get] Response: ${res.status} (ok=${res.ok})`)
    if (!res.ok) {
      console.log(`[LRCLIB-Get] Error body: ${res.data.slice(0, 100)}`)
      return null
    }
    return JSON.parse(res.data) as LRCLibResponse
  } catch (err: any) {
    console.error(`[LRCLIB-Get] Exception: ${err.message}`)
    return null
  }
}

async function fetchSearch(url: string, expectedDuration: number): Promise<LRCLibResponse | null> {
  try {
    console.log(`[LRCLIB-Search] Request: ${url}`)
    const res = await nodeFetch(url)
    console.log(`[LRCLIB-Search] Response: ${res.status} (ok=${res.ok})`)
    if (!res.ok) {
      console.log(`[LRCLIB-Search] Error body: ${res.data.slice(0, 100)}`)
      return null
    }
    const results = JSON.parse(res.data) as LRCLibResponse[]
    console.log(`[LRCLIB-Search] Found ${results.length} results`)
    
    // Filter results so that tracks with duration closest to expectedDuration come first
    // We strictly filter out any result that is more than 1 second off.
    // The user requested EXACT matching to prevent even slight lyric desyncs.
    const validResults = results
      .filter((r) => Math.abs(r.duration - expectedDuration) <= 1)
      .sort((a, b) => Math.abs(a.duration - expectedDuration) - Math.abs(b.duration - expectedDuration))
    
    if (validResults.length > 0) {
      return validResults.find((r) => r.syncedLyrics) || validResults[0]
    }

    // If no results are within 5 seconds, it's dangerous to use synced lyrics.
    // We fall back to the absolute closest match but strip the synced lyrics.
    results.sort((a, b) => Math.abs(a.duration - expectedDuration) - Math.abs(b.duration - expectedDuration))
    const closest = results[0]
    if (closest) {
      closest.syncedLyrics = null
      return closest
    }
    return null
  } catch (err: any) {
    console.error(`[LRCLIB-Search] Exception: ${err.message}`)
    return null
  }
}
