import { useState, useEffect, useRef, useMemo } from 'react'
import type { SpotifyTrack, LyricLine } from '../types'
import { fetchLyrics } from '../services/lrclibApi'
import { parseLRC, findActiveLyricIndex } from '../services/lrcParser'

// In-memory lyrics cache: trackId → parsed lyrics
// Persists across re-renders so replayed songs load instantly
const lyricsCache = new Map<string, LyricLine[]>()

interface UseLyricSyncReturn {
  lyrics: LyricLine[]
  activeIndex: number
  isLoading: boolean
  hasLyrics: boolean
  error: string | null
}

export function useLyricSync(
  track: SpotifyTrack | null,
  currentTimeMs: number
): UseLyricSyncReturn {
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastTrackIdRef = useRef<string>('')
  const abortRef = useRef<AbortController | null>(null)

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!track || track.id === lastTrackIdRef.current) return

    lastTrackIdRef.current = track.id

    // Cancel any in-flight fetch from previous track
    if (abortRef.current) {
      abortRef.current.abort()
    }

    // Check cache first — instant load!
    const cached = lyricsCache.get(track.id)
    if (cached) {
      console.log(`[LyricSync] Cache HIT for "${track.name}" (${cached.length} lines)`)
      setLyrics(cached)
      setIsLoading(false)
      setError(null)
      return
    }

    // Cache miss — fetch from LRCLIB
    console.log(`[LyricSync] Cache MISS for "${track.name}", fetching...`)
    setIsLoading(true)
    setError(null)
    setLyrics([])

    const controller = new AbortController()
    abortRef.current = controller

    const durationSeconds = track.durationMs / 1000
    const trackId = track.id

    fetchLyrics(track.name, track.artist, track.album, durationSeconds)
      .then((response) => {
        // Don't update if this track is no longer current
        if (controller.signal.aborted) return

        if (response?.syncedLyrics) {
          const parsed = parseLRC(response.syncedLyrics)
          lyricsCache.set(trackId, parsed) // Cache it
          setLyrics(parsed)
        } else if (response?.plainLyrics) {
          // Plain lyrics without timing — display as static text
          const lines = response.plainLyrics.split('\n').filter((l) => l.trim())
          const parsed = lines.map((text, i) => ({ time: i * 5, text }))
          lyricsCache.set(trackId, parsed) // Cache it
          setLyrics(parsed)
        } else {
          setLyrics([])
          setError('No lyrics found')
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError('Failed to load lyrics')
        setLyrics([])
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [track?.id, track?.name, track?.artist, track?.album, track?.durationMs])

  // Find active lyric index based on current time
  const currentTimeSec = currentTimeMs / 1000
  const activeIndex = useMemo(
    () => findActiveLyricIndex(lyrics, currentTimeSec),
    [lyrics, currentTimeSec]
  )

  return {
    lyrics,
    activeIndex,
    isLoading,
    hasLyrics: lyrics.length > 0,
    error
  }
}
