import { useState, useEffect, useRef, useMemo } from "react";
import type { SpotifyTrack, LyricLine } from "../types";
import { fetchLyrics } from "../services/lrclibApi";
import { parseLRC, findActiveLyricIndex } from "../services/lrcParser";

interface CachedLyrics {
  lines: LyricLine[];
  offset: number;
}

const lyricsCache = new Map<string, CachedLyrics>();

interface UseLyricSyncReturn {
  lyrics: LyricLine[];
  activeIndex: number;
  isLoading: boolean;
  hasLyrics: boolean;
  error: string | null;
  offset: number;
}

export function useLyricSync(
  track: SpotifyTrack | null,
  currentTimeMs: number,
  refetchTrigger: number = 0,
): UseLyricSyncReturn {
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [initialOffset, setInitialOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTrackIdRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const lastRefetchRef = useRef<number>(0);

  useEffect(() => {
    const isNewTrack = track?.id !== lastTrackIdRef.current;
    const isForcedRefetch = refetchTrigger !== lastRefetchRef.current;

    if (!track) return;
    if (!isNewTrack && !isForcedRefetch) return;

    if (isForcedRefetch && track.id) {
      lyricsCache.delete(track.id);
    }

    lastTrackIdRef.current = track.id;
    lastRefetchRef.current = refetchTrigger;

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const cached = lyricsCache.get(track.id);
    if (cached) {
      console.log(
        `[LyricSync] Cache HIT for "${track.name}" (${cached.lines.length} lines, offset: ${cached.offset})`,
      );
      setLyrics(cached.lines);
      setInitialOffset(cached.offset);
      setIsLoading(false);
      setError(null);
      return;
    }

    console.log(`[LyricSync] Cache MISS for "${track.name}", fetching...`);
    setIsLoading(true);
    setError(null);
    setLyrics([]);
    setInitialOffset(0);

    const controller = new AbortController();
    abortRef.current = controller;

    const durationSeconds = track.durationMs / 1000;
    const trackId = track.id;

    fetchLyrics(track.name, track.artist, track.album, durationSeconds)
      .then((response) => {
        if (controller.signal.aborted) return;

        if (response?.syncedLyrics) {
          const parsed = parseLRC(response.syncedLyrics);
          const offset = response.offset || 0;
          lyricsCache.set(trackId, { lines: parsed, offset });
          setLyrics(parsed);
          setInitialOffset(offset);
        } else if (response?.plainLyrics) {
          const lines = response.plainLyrics
            .split("\n")
            .filter((l) => l.trim());
          const parsed = lines.map((text, i) => ({ time: i * 5, text }));
          const offset = response.offset || 0;
          lyricsCache.set(trackId, { lines: parsed, offset });
          setLyrics(parsed);
          setInitialOffset(offset);
        } else {
          setLyrics([]);
          setInitialOffset(0);
          setError("No lyrics found");
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError("Failed to load lyrics");
        setLyrics([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [track?.id, track?.name, track?.artist, track?.album, track?.durationMs]);

  const currentTimeSec = currentTimeMs / 1000;
  const activeIndex = useMemo(
    () => findActiveLyricIndex(lyrics, currentTimeSec),
    [lyrics, currentTimeSec],
  );

  return {
    lyrics,
    activeIndex,
    isLoading,
    hasLyrics: lyrics.length > 0,
    error,
    offset: initialOffset,
  };
}
