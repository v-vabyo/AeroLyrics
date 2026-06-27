import { useState, useEffect, useCallback, useRef } from 'react'
import type { SpotifyTrack, SpotifyTokens } from '../types'
import { fetchCurrentlyPlaying } from '../services/spotifyApi'

const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || ''
const POLL_INTERVAL = 1000 // 1 second — fast detection for track changes

interface UseSpotifyPlayerReturn {
  track: SpotifyTrack | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  currentTimeMs: number
  login: () => void
}

export function useSpotifyPlayer(): UseSpotifyPlayerReturn {
  const [track, setTrack] = useState<SpotifyTrack | null>(null)
  const [tokens, setTokens] = useState<SpotifyTokens | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // For interpolating progress between polls
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const lastPollTimeRef = useRef<number>(0)
  const lastProgressRef = useRef<number>(0)
  const isPlayingRef = useRef<boolean>(false)
  const animFrameRef = useRef<number>(0)
  const lastApiTimestampRef = useRef<number>(0)
  const isRefreshingRef = useRef<boolean>(false)

  // Load saved tokens on mount
  useEffect(() => {
    async function loadTokens() {
      try {
        const savedTokens = await window.electronAPI.getSpotifyTokens()
        if (savedTokens) {
          setTokens(savedTokens)
        }
      } catch {
        console.error('Failed to load tokens')
      } finally {
        setIsLoading(false)
      }
    }
    loadTokens()

    // Listen for token updates from OAuth flow
    const unsubscribe = window.electronAPI.onTokensUpdated((newTokens: SpotifyTokens) => {
      setTokens(newTokens)
      setError(null)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // Poll Spotify for currently playing track
  const pollCurrentlyPlaying = useCallback(async () => {
    if (!tokens) return

    // Check if token needs refresh
    if (Date.now() >= tokens.expiresAt - 60000) {
      if (isRefreshingRef.current) return // Prevent concurrent refreshes
      
      isRefreshingRef.current = true
      try {
        const refreshed = await window.electronAPI.refreshToken(SPOTIFY_CLIENT_ID, tokens.refreshToken)
        if (refreshed) {
          setTokens(refreshed)
          return // Will poll again on next interval with new tokens
        } else {
          // If refresh completely fails, logout
          setError('Session expired. Please reconnect.')
          setTokens(null)
          window.electronAPI.clearTokens()
          return
        }
      } finally {
        isRefreshingRef.current = false
      }
    }

    const fetchStart = Date.now()
    const currentTrack = await fetchCurrentlyPlaying(tokens)
    const fetchEnd = Date.now()
    const networkLatency = Math.floor((fetchEnd - fetchStart) / 2)

    if (currentTrack) {
      setTrack((prev) => {
        // Only update if track changed
        if (!prev || prev.id !== currentTrack.id) {
          return currentTrack
        }
        // Update progress and playing state
        return {
          ...prev,
          progressMs: currentTrack.progressMs,
          isPlaying: currentTrack.isPlaying
        }
      })

      // Reject stale cached responses that would cause the lyrics to jump backwards.
      // Spotify's API often returns cached results for 2-3 seconds after a seek.
      if (!currentTrack.timestamp || currentTrack.timestamp >= lastApiTimestampRef.current) {
        if (currentTrack.timestamp) {
          lastApiTimestampRef.current = currentTrack.timestamp
        }
        
        // Update interpolation refs
        lastPollTimeRef.current = fetchEnd
        // Compensate for network latency: track kept playing while response traveled to us
        lastProgressRef.current = currentTrack.progressMs + (currentTrack.isPlaying ? networkLatency : 0)
        isPlayingRef.current = currentTrack.isPlaying
      }

      setError(null)
    } else {
      // Nothing playing or error
      setTrack((prev) => {
        if (prev) {
          return { ...prev, isPlaying: false }
        }
        return prev
      })
      isPlayingRef.current = false
    }
  }, [tokens])

  // Set up polling interval
  useEffect(() => {
    if (!tokens) return

    // Initial poll
    pollCurrentlyPlaying()

    const intervalId = setInterval(pollCurrentlyPlaying, POLL_INTERVAL)

    return () => clearInterval(intervalId)
  }, [tokens, pollCurrentlyPlaying])

  // Interpolate progress using requestAnimationFrame for smooth sync
  useEffect(() => {
    function updateProgress() {
      if (isPlayingRef.current && lastPollTimeRef.current > 0) {
        const elapsed = Date.now() - lastPollTimeRef.current
        const interpolated = lastProgressRef.current + elapsed
        setCurrentTimeMs(interpolated)
      } else if (lastPollTimeRef.current > 0) {
        setCurrentTimeMs(lastProgressRef.current)
      }
      animFrameRef.current = requestAnimationFrame(updateProgress)
    }

    animFrameRef.current = requestAnimationFrame(updateProgress)

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [])

  const login = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.startSpotifyAuth()
      if (result && !result.success && result.error) {
        setError(result.error)
      }
    } catch (err) {
      setError('Failed to start Spotify authentication.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    track,
    isAuthenticated: !!tokens,
    isLoading,
    error,
    currentTimeMs,
    login
  }
}
