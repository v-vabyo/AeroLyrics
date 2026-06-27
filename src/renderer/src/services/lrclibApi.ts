import type { LRCLibResponse } from '../types'


export async function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSeconds: number
): Promise<LRCLibResponse | null> {
  return await window.electronAPI.fetchLyrics(trackName, artistName, albumName, durationSeconds)
}
