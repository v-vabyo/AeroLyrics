import { contextBridge, ipcRenderer } from 'electron'

// Type for tokens
interface SpotifyTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

contextBridge.exposeInMainWorld('electronAPI', {

  /**
   * Toggle click-through mode on/off.
   */
  toggleClickThrough: (enable: boolean): void => {
    ipcRenderer.send('toggle-click-through', enable)
  },
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }): void => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options)
  },
  minimizeWindow: (): void => {
    ipcRenderer.send('minimize-window')
  },
  closeWindow: (): void => {
    ipcRenderer.send('close-window')
  },
  onWindowRestored: (callback: () => void): (() => void) => {
    const subscription = (_event: any) => callback()
    ipcRenderer.on('window-restored', subscription)
    return () => ipcRenderer.removeListener('window-restored', subscription)
  },

  /**
   * Start the Spotify OAuth flow.
   */
  startSpotifyAuth: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('start-spotify-auth')
  },
  getClickThroughState: (): Promise<boolean> => {
    return ipcRenderer.invoke('get-click-through-state')
  },
  onClickThroughChanged: (callback: (state: boolean) => void): void => {
    ipcRenderer.on('click-through-changed', (_event, value) => callback(value))
  },
  sendOpacityToMain: (opacity: number): void => {
    ipcRenderer.send('opacity-initialized', opacity)
  },
  onOpacityChange: (callback: (opacity: number) => void): void => {
    ipcRenderer.on('opacity-change', (_event, opacity) => callback(opacity))
  },

  /**
   * Get saved Spotify tokens.
   */
  getSpotifyTokens: (): Promise<SpotifyTokens | null> => {
    return ipcRenderer.invoke('get-spotify-tokens')
  },

  /**
   * Listen for token updates from the main process.
   * Returns an unsubscribe function.
   */
  onTokensUpdated: (callback: (tokens: SpotifyTokens) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, tokens: SpotifyTokens): void => {
      callback(tokens)
    }
    ipcRenderer.on('tokens-updated', handler)
    return () => {
      ipcRenderer.removeListener('tokens-updated', handler)
    }
  },

  /**
   * Set the window position.
   */
  setWindowPosition: (x: number, y: number): void => {
    ipcRenderer.send('set-window-position', x, y)
  },

  /**
   * Fetch lyrics from the main process (fast, no CORS).
   */
  fetchLyrics: (trackName: string, artistName: string, albumName: string, durationSeconds: number) => ipcRenderer.invoke('fetch-lyrics', trackName, artistName, albumName, durationSeconds),
  refreshToken: (clientId: string, refreshToken: string) => ipcRenderer.invoke('refresh-token', clientId, refreshToken),
  setClickThrough: (ignore: boolean) => ipcRenderer.send('set-click-through', ignore)
})
