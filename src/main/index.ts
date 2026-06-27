import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, screen } from 'electron'
import { join } from 'node:path'
import { startOAuthServer, stopOAuthServer } from './services/spotifyAuth'
import { loadTokens, saveTokens } from './services/tokenStore'
import { loadSettings, saveSettings } from './services/settingsStore'
import { fetchLyricsFromMain } from './services/lrclibMain'

// Set app name and userData path explicitly to prevent development tools or other Electron apps from wiping the cache
app.setName('AeroLyrics')
app.setPath('userData', join(app.getPath('appData'), 'AeroLyrics'))

  // (Hardware acceleration is left enabled as disabling it can cause invisible windows on some systems)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isClickThrough = false // Will be initialized from settings
let currentOpacity = 0.78

function createWindow(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')
  mainWindow = new BrowserWindow({
    width: 450,
    height: 290,
    minWidth: 450,
    minHeight: 290,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: false,
    skipTaskbar: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    show: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false  // Allow cross-origin requests to LRCLIB & Spotify APIs
    }
  })

  // We no longer use setIgnoreMouseEvents for the lock feature, 
  // so the window always receives mouse events.
  mainWindow.setIgnoreMouseEvents(false)

  // Position at bottom-right of primary display
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize
  
  // Prevent default close to keep app running in tray (optional, but standard for widgets)
  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isMinimized()) {
      const bounds = mainWindow.getBounds()
      // Only save if the bounds look sane (not minimized to -32000)
      if (bounds && bounds.x > -10000 && bounds.y > -10000) {
        saveSettings({ windowPosition: { x: bounds.x, y: bounds.y } })
      }
    }
  })

  // Prevent dragging outside of screen work area (respecting taskbar)
  const snapToEdges = () => {
    if (!mainWindow || !mainWindow.isVisible() || mainWindow.isMinimized()) return
    const display = screen.getPrimaryDisplay()
    const workArea = display.workArea
    const bounds = mainWindow.getBounds()

    let snapX = bounds.x
    let snapY = bounds.y
    let isOutOfBounds = false

    if (snapX < workArea.x) {
      snapX = workArea.x
      isOutOfBounds = true
    }
    if (snapY < workArea.y) {
      snapY = workArea.y
      isOutOfBounds = true
    }
    if (snapX + bounds.width > workArea.x + workArea.width) {
      snapX = workArea.x + workArea.width - bounds.width
      isOutOfBounds = true
    }
    if (snapY + bounds.height > workArea.y + workArea.height) {
      snapY = workArea.y + workArea.height - bounds.height
      isOutOfBounds = true
    }

    if (isOutOfBounds) {
      console.log(`[Snap] Moving from ${bounds.x},${bounds.y} to ${snapX},${snapY}`)
      mainWindow.setBounds({
        x: Math.round(snapX),
        y: Math.round(snapY),
        width: bounds.width,
        height: bounds.height
      })
    }
  }

  // Windows sometimes fails to fire 'moved' reliably for frameless windows.
  // We use a low-overhead interval to guarantee bounds are respected.
  setInterval(snapToEdges, 100)

  mainWindow.on('minimize', () => {
    // Normal minimize
  })

  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  
  // Set initial click-through state if needed
  if (isClickThrough) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true })
  }

  mainWindow.on('restore', () => {
    mainWindow?.webContents.send('window-restored')
  })
  
  const settings = loadSettings()
  
  if (settings.windowPosition && settings.windowPosition.x > -10000 && settings.windowPosition.y > -10000) {
    mainWindow.setPosition(settings.windowPosition.x, settings.windowPosition.y)
  } else {
    const startX = width - 450
    const startY = height - 290
    mainWindow.setPosition(startX, startY)
  }

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  
  // Force show
  mainWindow.show()

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')
  // Use the native image to preserve transparency and scale automatically
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })

  tray = new Tray(trayIcon)
  tray.setToolTip('AeroLyrics — Spotify Lyrics')

  updateTrayMenu()
}

function updateTrayMenu(): void {
  if (!tray) return

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'AeroLyrics',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Enable Click-Through',
      type: 'checkbox',
      checked: isClickThrough,
      click: (menuItem) => {
        isClickThrough = menuItem.checked
        if (mainWindow) {
          mainWindow.setIgnoreMouseEvents(isClickThrough, { forward: true })
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Background Transparency',
      submenu: [
        {
          label: 'Solid (100%)',
          type: 'radio',
          checked: currentOpacity === 1,
          click: () => {
            currentOpacity = 1
            mainWindow?.webContents.send('opacity-change', 1)
            updateTrayMenu()
          }
        },
        {
          label: 'Default (78%)',
          type: 'radio',
          checked: currentOpacity === 0.78,
          click: () => {
            currentOpacity = 0.78
            mainWindow?.webContents.send('opacity-change', 0.78)
            updateTrayMenu()
          }
        },
        {
          label: 'Medium (50%)',
          type: 'radio',
          checked: currentOpacity === 0.5,
          click: () => {
            currentOpacity = 0.5
            mainWindow?.webContents.send('opacity-change', 0.5)
            updateTrayMenu()
          }
        },
        {
          label: 'Low (20%)',
          type: 'radio',
          checked: currentOpacity === 0.2,
          click: () => {
            currentOpacity = 0.2
            mainWindow?.webContents.send('opacity-change', 0.2)
            updateTrayMenu()
          }
        },
        {
          label: 'Transparent (0%)',
          type: 'radio',
          checked: currentOpacity === 0,
          click: () => {
            currentOpacity = 0
            mainWindow?.webContents.send('opacity-change', 0)
            updateTrayMenu()
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: isClickThrough ? '🔓 Unlock Window (Draggable)' : '🔒 Lock Window (Disable Drag)',
      click: () => {
        isClickThrough = !isClickThrough
        saveSettings({ isLocked: isClickThrough })
        
        if (mainWindow) {
          // We no longer use setIgnoreMouseEvents(true) because we want buttons to remain clickable.
          // Lock state is handled purely by renderer CSS (-webkit-app-region: drag vs no-drag).
          mainWindow.setIgnoreMouseEvents(false)
          mainWindow.webContents.send('click-through-changed', isClickThrough)
        }
        updateTrayMenu()
      }
    },
    {
      label: '📌 Always on Top',
      type: 'checkbox',
      checked: true,
      click: (menuItem) => {
        mainWindow?.setAlwaysOnTop(menuItem.checked)
      }
    },
    { type: 'separator' },
    {
      label: '🔄 Reconnect Spotify',
      click: () => {
        startSpotifyOAuth()
      }
    },
    { type: 'separator' },
    {
      label: '❌ Quit AeroLyrics',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

async function startSpotifyOAuth(): Promise<{ success: boolean; error?: string }> {
  try {
    const clientId = (import.meta as any).env.MAIN_VITE_SPOTIFY_CLIENT_ID || ''

    if (!clientId) {
      console.error('MAIN_VITE_SPOTIFY_CLIENT_ID not set in .env!')
      return { success: false, error: 'Spotify Client ID not configured. Set MAIN_VITE_SPOTIFY_CLIENT_ID in .env file.' }
    }

    const tokens = await startOAuthServer(clientId)
    if (tokens) {
      saveTokens(tokens)
      mainWindow?.webContents.send('tokens-updated', tokens)
      
      // Don't enable click-through immediately so user can drag the window first
      isClickThrough = false
      mainWindow?.setIgnoreMouseEvents(false)
      mainWindow?.webContents.send('click-through-changed', false)
      updateTrayMenu()

      return { success: true }
    }
    return { success: false, error: 'Authorization was cancelled or timed out.' }
  } catch (error) {
    console.error('OAuth flow failed:', error)
    return { success: false, error: 'OAuth flow failed. Please try again.' }
  }
}

// ---- IPC Handlers ----

function setupIPC(): void {

  ipcMain.handle('get-click-through-state', () => {
    return isClickThrough
  })

  ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean, options?: { forward: boolean }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setIgnoreMouseEvents(ignore, options)
  })

  ipcMain.on('opacity-initialized', (_event, opacity: number) => {
    currentOpacity = opacity
    updateTrayMenu()
  })

  ipcMain.on('toggle-click-through', (_event, enable: boolean) => {
    isClickThrough = enable
    saveSettings({ isLocked: isClickThrough })
    
    if (mainWindow) {
      // We no longer use setIgnoreMouseEvents because the user wants buttons to be clickable.
      // Drag is disabled via CSS (-webkit-app-region: no-drag) in the renderer.
      mainWindow.setIgnoreMouseEvents(false)
      mainWindow.webContents.send('click-through-changed', isClickThrough)
    }
    updateTrayMenu()
  })

  ipcMain.on('close-window', () => {
    app.quit()
  })

  ipcMain.handle('get-spotify-tokens', async () => {
    return loadTokens()
  })

  ipcMain.handle('start-spotify-auth', async () => {
    return await startSpotifyOAuth()
  })

  ipcMain.on('set-window-position', (_event, x: number, y: number) => {
    mainWindow?.setPosition(Math.round(x), Math.round(y))
  })

  // Refresh token IPC
  ipcMain.handle('refresh-token', async (_, clientId, refreshToken) => {
    try {
      const { refreshSpotifyToken } = require('./services/spotifyAuth')
      const tokens = await refreshSpotifyToken(clientId, refreshToken)
      // Save tokens
      const { saveTokens } = require('./services/tokenStore')
      saveTokens(tokens)
      return tokens
    } catch (error) {
      console.error('[Main] Refresh token failed:', error)
      return null
    }
  })

  // Click-Through IPC
  ipcMain.on('set-click-through', (_, ignore) => {
    isClickThrough = ignore
    if (mainWindow) {
      mainWindow.setIgnoreMouseEvents(ignore, { forward: true })
    }
    updateTrayMenu()
  })

  // Fast lyrics fetching via Node.js main process (no CORS overhead)
  ipcMain.handle('fetch-lyrics', async (_event, trackName: string, artistName: string, albumName: string, durationSeconds: number) => {
    return await fetchLyricsFromMain(trackName, artistName, albumName, durationSeconds)
  })
}

// ---- App Lifecycle ----

app.whenReady().then(() => {
  const settings = loadSettings()
  isClickThrough = settings.isLocked

  setupIPC()
  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  stopOAuthServer()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', () => {
  stopOAuthServer()
})
