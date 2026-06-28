import { contextBridge, ipcRenderer } from "electron";

interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

contextBridge.exposeInMainWorld("electronAPI", {
  toggleClickThrough: (enable: boolean): void => {
    ipcRenderer.send("toggle-click-through", enable);
  },
  setIgnoreMouseEvents: (
    ignore: boolean,
    options?: { forward: boolean },
  ): void => {
    ipcRenderer.send("set-ignore-mouse-events", ignore, options);
  },
  minimizeWindow: (): void => {
    ipcRenderer.send("minimize-window");
  },
  closeWindow: (): void => {
    ipcRenderer.send("close-window");
  },
  onWindowRestored: (callback: () => void): (() => void) => {
    const subscription = (_event: any) => callback();
    ipcRenderer.on("window-restored", subscription);
    return () => ipcRenderer.removeListener("window-restored", subscription);
  },

  startSpotifyAuth: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke("start-spotify-auth");
  },
  getClickThroughState: (): Promise<boolean> => {
    return ipcRenderer.invoke("get-click-through-state");
  },
  onClickThroughChanged: (callback: (state: boolean) => void): void => {
    ipcRenderer.on("click-through-changed", (_event, value) => callback(value));
  },
  sendOpacityToMain: (opacity: number): void => {
    ipcRenderer.send("opacity-initialized", opacity);
  },
  onOpacityChange: (callback: (opacity: number) => void): void => {
    ipcRenderer.on("opacity-change", (_event, opacity) => callback(opacity));
  },

  getSpotifyTokens: (): Promise<SpotifyTokens | null> => {
    return ipcRenderer.invoke("get-spotify-tokens");
  },

  onTokensUpdated: (
    callback: (tokens: SpotifyTokens) => void,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      tokens: SpotifyTokens,
    ): void => {
      callback(tokens);
    };
    ipcRenderer.on("tokens-updated", handler);
    return () => {
      ipcRenderer.removeListener("tokens-updated", handler);
    };
  },

  setWindowPosition: (x: number, y: number): void => {
    ipcRenderer.send("set-window-position", x, y);
  },

  fetchLyrics: (
    trackName: string,
    artistName: string,
    albumName: string,
    durationSeconds: number,
  ) =>
    ipcRenderer.invoke(
      "fetch-lyrics",
      trackName,
      artistName,
      albumName,
      durationSeconds,
    ),
  refreshToken: (clientId: string, refreshToken: string) =>
    ipcRenderer.invoke("refresh-token", clientId, refreshToken),
  setClickThrough: (ignore: boolean) =>
    ipcRenderer.send("set-click-through", ignore),
  clearTokens: () => ipcRenderer.send("logout"),
  saveLyricsOffset: (trackName: string, artistName: string, offset: number) =>
    ipcRenderer.invoke("save-lyrics-offset", trackName, artistName, offset),
  onShortcutOffsetChange: (callback: (delta: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, delta: number) =>
      callback(delta);
    ipcRenderer.on("shortcut-offset-change", listener);
    return () => {
      ipcRenderer.removeListener("shortcut-offset-change", listener);
    };
  },
  searchLyrics: (trackName: string, artistName: string) =>
    ipcRenderer.invoke("search-lyrics", trackName, artistName),
  saveLyricOverride: (trackName: string, artistName: string, lyricData: any) =>
    ipcRenderer.invoke("save-lyric-override", trackName, artistName, lyricData),
  openLyricsPicker: (trackName: string, artistName: string, durationMs: number) =>
    ipcRenderer.send("open-lyrics-picker", trackName, artistName, durationMs),
  onForceLyricRefetch: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("force-lyric-refetch", listener);
    return () => ipcRenderer.removeListener("force-lyric-refetch", listener);
  },
  notifyLyricSelected: () => ipcRenderer.send("lyric-selected"),
  previewLyric: (lyricData: any) => ipcRenderer.send("preview-lyric", lyricData),
  clearPreview: () => ipcRenderer.send("clear-preview"),
  onPreviewLyric: (callback: (lyricData: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on("preview-lyric-data", listener);
    return () => ipcRenderer.removeListener("preview-lyric-data", listener);
  },
  onClearPreview: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("clear-preview", listener);
    return () => ipcRenderer.removeListener("clear-preview", listener);
  },
});
