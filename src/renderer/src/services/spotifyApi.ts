import type { SpotifyTrack, SpotifyTokens } from '../types'

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'

/**
 * Fetch the currently playing track from Spotify.
 */
export async function fetchCurrentlyPlaying(
  tokens: SpotifyTokens
): Promise<SpotifyTrack | null> {
  try {
    if (Date.now() >= tokens.expiresAt) {
      return null // Signal that token refresh is needed
    }

    const requestStartTime = Date.now()
    const response = await fetch(`${SPOTIFY_API_BASE}/me/player/currently-playing`, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`
      }
    })
    const requestEndTime = Date.now()
    const latency = (requestEndTime - requestStartTime) / 2

    if (response.status === 204) {
      return null
    }

    if (response.status === 401) {
      return null
    }

    if (!response.ok) {
      console.error(`Spotify API error: ${response.status}`)
      return null
    }

    const data = await response.json()

    if (!data || data.currently_playing_type !== 'track' || !data.item) {
      return null
    }

    const track = data.item

    return {
      id: track.id,
      name: track.name,
      artist: track.artists.map((a: { name: string }) => a.name).join(', '),
      album: track.album.name,
      albumArt:
        track.album.images && track.album.images.length > 0
          ? track.album.images[track.album.images.length > 1 ? 1 : 0].url
          : '',
      durationMs: track.duration_ms,
      progressMs: (data.progress_ms || 0) + (data.is_playing ? latency : 0),
      isPlaying: data.is_playing || false,
      timestamp: data.timestamp // Export timestamp to detect stale cached responses
    }
  } catch (error) {
    console.error('Failed to fetch currently playing:', error)
    return null
  }
}

/**
 * Refresh the Spotify access token using the refresh token.
 */
export async function refreshAccessToken(
  clientId: string,
  refreshToken: string
): Promise<SpotifyTokens | null> {
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    })

    if (!response.ok) {
      console.error(`Token refresh error: ${response.status}`)
      return null
    }

    const data = await response.json()

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000
    }
  } catch (error) {
    console.error('Failed to refresh token:', error)
    return null
  }
}
