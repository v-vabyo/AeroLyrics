import type { LRCLibResponse } from '../types'

/**
 * Fetch synced lyrics using the fast Node.js fetch in the main process (via IPC).
 */
export async function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSeconds: number
): Promise<LRCLibResponse | null> {
  return await window.electronAPI.fetchLyrics(trackName, artistName, albumName, durationSeconds)
}
