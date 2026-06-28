import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  shell,
  screen,
  globalShortcut,
} from "electron";
import { join } from "node:path";
import {
  startOAuthServer,
  stopOAuthServer,
  refreshSpotifyToken,
} from "./services/spotifyAuth";
import { loadTokens, saveTokens, clearTokens } from "./services/tokenStore";
import { loadSettings, saveSettings } from "./services/settingsStore";
import {
  fetchLyricsFromMain,
  saveLyricsOffsetToCache,
  searchAllLyrics,
  saveLyricOverride,
} from "./services/lrclibMain";

app.setName("AeroLyrics");
app.setPath("userData", join(app.getPath("appData"), "AeroLyrics"));

let mainWindow: BrowserWindow | null = null;
let lyricsPickerWindow: BrowserWindow | null = null;

function openLyricsPickerWindow(trackName: string, artistName: string, durationMs: number): void {
  if (lyricsPickerWindow) {
    lyricsPickerWindow.focus();
    return;
  }
  lyricsPickerWindow = new BrowserWindow({
    width: 600,
    height: 500,
    title: "Select Lyrics",
    autoHideMenuBar: true,
    backgroundColor: "#18181b",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  lyricsPickerWindow.on("closed", () => {
    lyricsPickerWindow = null;
  });

  const query = `window=picker&trackName=${encodeURIComponent(trackName)}&artistName=${encodeURIComponent(artistName)}&durationMs=${durationMs}`;
  if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
    lyricsPickerWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}?${query}`);
  } else {
    lyricsPickerWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      search: query,
    });
  }
}
let tray: Tray | null = null;
let isClickThrough = false;
let currentOpacity = 0.78;

function createWindow(): void {
  const iconPath = join(__dirname, "../../resources/icon.png");
  mainWindow = new BrowserWindow({
    width: 450,
    height: 290,
    minWidth: 450,
    minHeight: 290,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
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
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  mainWindow.setIgnoreMouseEvents(false);

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow.on("close", () => {
    if (mainWindow && !mainWindow.isMinimized()) {
      const bounds = mainWindow.getBounds();
      if (bounds && bounds.x > -10000 && bounds.y > -10000) {
        saveSettings({ windowPosition: { x: bounds.x, y: bounds.y } });
      }
    }
  });

  const snapToEdges = () => {
    if (!mainWindow || !mainWindow.isVisible() || mainWindow.isMinimized())
      return;
    const display = screen.getPrimaryDisplay();
    const workArea = display.workArea;
    const bounds = mainWindow.getBounds();

    let snapX = bounds.x;
    let snapY = bounds.y;
    let isOutOfBounds = false;

    if (snapX < workArea.x) {
      snapX = workArea.x;
      isOutOfBounds = true;
    }
    if (snapY < workArea.y) {
      snapY = workArea.y;
      isOutOfBounds = true;
    }
    if (snapX + bounds.width > workArea.x + workArea.width) {
      snapX = workArea.x + workArea.width - bounds.width;
      isOutOfBounds = true;
    }
    if (snapY + bounds.height > workArea.y + workArea.height) {
      snapY = workArea.y + workArea.height - bounds.height;
      isOutOfBounds = true;
    }

    if (isOutOfBounds) {
      console.log(
        `[Snap] Moving from ${bounds.x},${bounds.y} to ${snapX},${snapY}`,
      );
      mainWindow.setBounds({
        x: Math.round(snapX),
        y: Math.round(snapY),
        width: bounds.width,
        height: bounds.height,
      });
    }
  };

  setInterval(snapToEdges, 100);

  mainWindow.on("minimize", () => {});

  mainWindow.setAlwaysOnTop(true, "screen-saver");

  if (isClickThrough) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }

  mainWindow.on("restore", () => {
    mainWindow?.webContents.send("window-restored");
  });

  const settings = loadSettings();

  if (
    settings.windowPosition &&
    settings.windowPosition.x > -10000 &&
    settings.windowPosition.y > -10000
  ) {
    mainWindow.setPosition(
      settings.windowPosition.x,
      settings.windowPosition.y,
    );
  } else {
    const startX = width - 450;
    const startY = height - 290;
    mainWindow.setPosition(startX, startY);
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.show();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const iconPath = join(__dirname, "../../resources/icon.png");
  const trayIcon = nativeImage
    .createFromPath(iconPath)
    .resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip("AeroLyrics — Spotify Lyrics");

  updateTrayMenu();
}

function updateTrayMenu(): void {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "AeroLyrics",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Enable Click-Through",
      type: "checkbox",
      checked: isClickThrough,
      click: (menuItem) => {
        isClickThrough = menuItem.checked;
        if (mainWindow) {
          mainWindow.setIgnoreMouseEvents(isClickThrough, { forward: true });
        }
      },
    },
    { type: "separator" },
    {
      label: "Background Transparency",
      submenu: [
        {
          label: "Solid (100%)",
          type: "radio",
          checked: currentOpacity === 1,
          click: () => {
            currentOpacity = 1;
            mainWindow?.webContents.send("opacity-change", 1);
            updateTrayMenu();
          },
        },
        {
          label: "Default (78%)",
          type: "radio",
          checked: currentOpacity === 0.78,
          click: () => {
            currentOpacity = 0.78;
            mainWindow?.webContents.send("opacity-change", 0.78);
            updateTrayMenu();
          },
        },
        {
          label: "Medium (50%)",
          type: "radio",
          checked: currentOpacity === 0.5,
          click: () => {
            currentOpacity = 0.5;
            mainWindow?.webContents.send("opacity-change", 0.5);
            updateTrayMenu();
          },
        },
        {
          label: "Low (20%)",
          type: "radio",
          checked: currentOpacity === 0.2,
          click: () => {
            currentOpacity = 0.2;
            mainWindow?.webContents.send("opacity-change", 0.2);
            updateTrayMenu();
          },
        },
        {
          label: "Transparent (0%)",
          type: "radio",
          checked: currentOpacity === 0,
          click: () => {
            currentOpacity = 0;
            mainWindow?.webContents.send("opacity-change", 0);
            updateTrayMenu();
          },
        },
      ],
    },
    { type: "separator" },
    {
      label: isClickThrough
        ? "🔓 Unlock Window (Draggable)"
        : "🔒 Lock Window (Disable Drag)",
      click: () => {
        isClickThrough = !isClickThrough;
        saveSettings({ isLocked: isClickThrough });

        if (mainWindow) {
          mainWindow.setIgnoreMouseEvents(false);
          mainWindow.webContents.send("click-through-changed", isClickThrough);
        }
        updateTrayMenu();
      },
    },
    {
      label: "📌 Always on Top",
      type: "checkbox",
      checked: true,
      click: (menuItem) => {
        mainWindow?.setAlwaysOnTop(menuItem.checked);
      },
    },
    { type: "separator" },
    {
      label: "🔄 Reconnect Spotify",
      click: () => {
        startSpotifyOAuth();
      },
    },
    { type: "separator" },
    {
      label: "❌ Quit AeroLyrics",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

async function startSpotifyOAuth(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const clientId = (import.meta as any).env.VITE_SPOTIFY_CLIENT_ID || "";

    if (!clientId) {
      console.error("VITE_SPOTIFY_CLIENT_ID not set in .env!");
      return {
        success: false,
        error:
          "Spotify Client ID not configured. Set VITE_SPOTIFY_CLIENT_ID in .env file.",
      };
    }

    const tokens = await startOAuthServer(clientId);
    if (tokens) {
      saveTokens(tokens);
      mainWindow?.webContents.send("tokens-updated", tokens);

      isClickThrough = false;
      mainWindow?.setIgnoreMouseEvents(false);
      mainWindow?.webContents.send("click-through-changed", false);
      updateTrayMenu();

      return { success: true };
    }
    return {
      success: false,
      error: "Authorization was cancelled or timed out.",
    };
  } catch (error) {
    console.error("OAuth flow failed:", error);
    return { success: false, error: "OAuth flow failed. Please try again." };
  }
}

function setupIPC(): void {
  ipcMain.handle("get-click-through-state", () => {
    return isClickThrough;
  });

  ipcMain.on(
    "set-ignore-mouse-events",
    (event, ignore: boolean, options?: { forward: boolean }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      win?.setIgnoreMouseEvents(ignore, options);
    },
  );

  ipcMain.on("opacity-initialized", (_event, opacity: number) => {
    currentOpacity = opacity;
    updateTrayMenu();
  });

  ipcMain.on("toggle-click-through", (_event, enable: boolean) => {
    isClickThrough = enable;
    saveSettings({ isLocked: isClickThrough });

    if (mainWindow) {
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.webContents.send("click-through-changed", isClickThrough);
    }
    updateTrayMenu();
  });

  ipcMain.on("close-window", () => {
    app.quit();
  });

  ipcMain.handle("get-spotify-tokens", async () => {
    return loadTokens();
  });

  ipcMain.handle("start-spotify-auth", async () => {
    return await startSpotifyOAuth();
  });

  ipcMain.on("set-window-position", (_event, x: number, y: number) => {
    mainWindow?.setPosition(Math.round(x), Math.round(y));
  });

  ipcMain.handle("refresh-token", async (_, __, refreshToken) => {
    try {
      const clientId =
        (import.meta as any).env.VITE_SPOTIFY_CLIENT_ID || "";
      if (!clientId) throw new Error("Client ID missing");
      const tokens = await refreshSpotifyToken(clientId, refreshToken);
      if (tokens) {
        saveTokens(tokens);
      }
      return tokens;
    } catch (error) {
      console.error("[Main] Refresh token failed:", error);
      return null;
    }
  });

  ipcMain.on("logout", () => {
    clearTokens();
  });

  ipcMain.on("set-click-through", (_, ignore) => {
    isClickThrough = ignore;
    if (mainWindow) {
      mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
    updateTrayMenu();
  });

  ipcMain.handle(
    "fetch-lyrics",
    async (_, trackName, artistName, albumName, durationSeconds) => {
      try {
        return await fetchLyricsFromMain(
          trackName,
          artistName,
          albumName,
          durationSeconds,
        );
      } catch (error) {
        console.error("[Main] Fetch lyrics failed:", error);
        return null;
      }
    },
  );

  ipcMain.handle("search-lyrics", async (_, trackName, artistName) => {
    try {
      return await searchAllLyrics(trackName, artistName);
    } catch (error) {
      console.error("[Main] Search lyrics failed:", error);
      return [];
    }
  });

  ipcMain.handle("save-lyric-override", async (_, trackName, artistName, lyricData) => {
    try {
      await saveLyricOverride(trackName, artistName, lyricData);
      return true;
    } catch (error) {
      console.error("[Main] Save lyric override failed:", error);
      return false;
    }
  });

  ipcMain.on("open-lyrics-picker", (_, trackName, artistName, durationMs) => {
    openLyricsPickerWindow(trackName, artistName, durationMs);
  });

  ipcMain.on("lyric-selected", () => {
    if (mainWindow) {
      mainWindow.webContents.send("force-lyric-refetch");
    }
    if (lyricsPickerWindow) {
      lyricsPickerWindow.close();
    }
  });

  ipcMain.handle(
    "save-lyrics-offset",
    async (
      _event,
      trackName: string,
      artistName: string,
      offset: number,
    ) => {
      await saveLyricsOffsetToCache(trackName, artistName, offset);
    },
  );
}

app.whenReady().then(() => {
  const settings = loadSettings();
  isClickThrough = settings.isLocked;

  setupIPC();
  createWindow();
  createTray();

  globalShortcut.register("CommandOrControl+Alt+Left", () => {
    if (mainWindow) {
      mainWindow.webContents.send("shortcut-offset-change", -500);
    }
  });

  globalShortcut.register("CommandOrControl+Alt+Right", () => {
    if (mainWindow) {
      mainWindow.webContents.send("shortcut-offset-change", 500);
    }
  });
});

app.on("window-all-closed", () => {
  stopOAuthServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  stopOAuthServer();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
