export interface LyricLine {
  time: number;
  text: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
  timestamp?: number;
}

export interface LRCLibResponse {
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

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface ElectronAPI {
  startSpotifyAuth: () => Promise<{ success: boolean; error?: string }>;
  toggleClickThrough: (enable: boolean) => void;
  setIgnoreMouseEvents?: (
    ignore: boolean,
    options?: { forward: boolean },
  ) => void;
  getClickThroughState: () => Promise<boolean>;
  onClickThroughChanged: (callback: (state: boolean) => void) => void;
  sendOpacityToMain: (opacity: number) => void;
  onOpacityChange: (callback: (opacity: number) => void) => void;
  getSpotifyTokens: () => Promise<SpotifyTokens | null>;
  onTokensUpdated: (callback: (tokens: SpotifyTokens) => void) => () => void;
  setWindowPosition: (x: number, y: number) => void;
  fetchLyrics: (
    trackName: string,
    artistName: string,
    albumName: string,
    durationSeconds: number,
  ) => Promise<LRCLibResponse | null>;
  closeWindow: () => void;
  refreshToken: (
    clientId: string,
    refreshToken: string,
  ) => Promise<SpotifyTokens | null>;
  clearTokens: () => void;
  saveLyricsOffset: (trackName: string, artistName: string, offset: number) => Promise<void>;
  onShortcutOffsetChange: (callback: (delta: number) => void) => () => void;
  searchLyrics: (trackName: string, artistName: string) => Promise<LRCLibResponse[]>;
  saveLyricOverride: (trackName: string, artistName: string, lyricData: LRCLibResponse) => Promise<boolean>;
  openLyricsPicker: (trackName: string, artistName: string, durationMs: number) => void;
  onForceLyricRefetch: (callback: () => void) => () => void;
  notifyLyricSelected: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
