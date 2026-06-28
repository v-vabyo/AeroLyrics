import { useState, useEffect, useCallback, useRef } from "react";
import type { SpotifyTrack, SpotifyTokens } from "../types";
import { fetchCurrentlyPlaying } from "../services/spotifyApi";

const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || "";
const POLL_INTERVAL = 1000;

interface UseSpotifyPlayerReturn {
  track: SpotifyTrack | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  currentTimeMs: number;
  login: () => void;
}

export function useSpotifyPlayer(): UseSpotifyPlayerReturn {
  const [track, setTrack] = useState<SpotifyTrack | null>(null);
  const [tokens, setTokens] = useState<SpotifyTokens | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const lastPollTimeRef = useRef<number>(0);
  const lastProgressRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const animFrameRef = useRef<number>(0);
  const lastApiTimestampRef = useRef<number>(0);
  const isRefreshingRef = useRef<boolean>(false);

  useEffect(() => {
    async function loadTokens() {
      try {
        const savedTokens = await window.electronAPI.getSpotifyTokens();
        if (savedTokens) {
          setTokens(savedTokens);
        }
      } catch {
        console.error("Failed to load tokens");
      } finally {
        setIsLoading(false);
      }
    }
    loadTokens();

    const unsubscribe = window.electronAPI.onTokensUpdated(
      (newTokens: SpotifyTokens) => {
        setTokens(newTokens);
        setError(null);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (tokens) {
      isRefreshingRef.current = false;
    }
  }, [tokens]);

  const pollCurrentlyPlaying = useCallback(async () => {
    if (!tokens) return;

    if (Date.now() >= tokens.expiresAt - 60000) {
      if (isRefreshingRef.current) return;

      isRefreshingRef.current = true;
      try {
        const refreshed = await window.electronAPI.refreshToken(
          SPOTIFY_CLIENT_ID,
          tokens.refreshToken,
        );
        if (refreshed) {
          setTokens(refreshed);
          // isRefreshingRef will be reset by the useEffect when tokens change
          return;
        } else {
          setError("Session expired. Please reconnect.");
          setTokens(null);
          window.electronAPI.clearTokens();
          isRefreshingRef.current = false;
          return;
        }
      } catch (err) {
        console.error("Refresh token error:", err);
        isRefreshingRef.current = false;
      }
    }

    const fetchStart = Date.now();
    const currentTrack = await fetchCurrentlyPlaying(tokens);
    const fetchEnd = Date.now();
    const networkLatency = Math.floor((fetchEnd - fetchStart) / 2);

    if (currentTrack) {
      setTrack((prev) => {
        if (!prev || prev.id !== currentTrack.id) {
          return currentTrack;
        }
        return {
          ...prev,
          progressMs: currentTrack.progressMs,
          isPlaying: currentTrack.isPlaying,
        };
      });

      if (
        !currentTrack.timestamp ||
        currentTrack.timestamp >= lastApiTimestampRef.current
      ) {
        if (currentTrack.timestamp) {
          lastApiTimestampRef.current = currentTrack.timestamp;
        }

        lastPollTimeRef.current = fetchEnd;
        lastProgressRef.current =
          currentTrack.progressMs +
          (currentTrack.isPlaying ? networkLatency : 0);
        isPlayingRef.current = currentTrack.isPlaying;
      }

      setError(null);
    } else {
      setTrack((prev) => {
        if (prev) {
          return { ...prev, isPlaying: false };
        }
        return prev;
      });
      isPlayingRef.current = false;
    }
  }, [tokens]);

  useEffect(() => {
    if (!tokens) return;

    pollCurrentlyPlaying();

    const intervalId = setInterval(pollCurrentlyPlaying, POLL_INTERVAL);

    return () => clearInterval(intervalId);
  }, [tokens, pollCurrentlyPlaying]);

  useEffect(() => {
    function updateProgress() {
      if (isPlayingRef.current && lastPollTimeRef.current > 0) {
        const elapsed = Date.now() - lastPollTimeRef.current;
        const interpolated = lastProgressRef.current + elapsed;
        setCurrentTimeMs(interpolated);
      } else if (lastPollTimeRef.current > 0) {
        setCurrentTimeMs(lastProgressRef.current);
      }
      animFrameRef.current = requestAnimationFrame(updateProgress);
    }

    animFrameRef.current = requestAnimationFrame(updateProgress);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  const login = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.startSpotifyAuth();
      if (result && !result.success && result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError("Failed to start Spotify authentication.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    track,
    isAuthenticated: !!tokens,
    isLoading,
    error,
    currentTimeMs,
    login,
  };
}
