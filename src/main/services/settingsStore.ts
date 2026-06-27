import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export interface AppSettings {
  isLocked: boolean
  windowPosition?: {
    x: number
    y: number
  }
}

const CONFIG_DIR = join(app.getPath('userData'), 'config')
const SETTINGS_PATH = join(CONFIG_DIR, 'settings.json')

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

const defaultSettings: AppSettings = {
  isLocked: false
}

export function loadSettings(): AppSettings {
  try {
    ensureConfigDir()
    if (!existsSync(SETTINGS_PATH)) return defaultSettings

    const data = readFileSync(SETTINGS_PATH, 'utf-8')
    const parsed = JSON.parse(data)
    
    return {
      ...defaultSettings,
      ...parsed
    }
  } catch {
    console.error('Failed to load settings')
    return defaultSettings
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  try {
    const current = loadSettings()
    const updated = { ...current, ...settings }
    ensureConfigDir()
    writeFileSync(SETTINGS_PATH, JSON.stringify(updated, null, 2), 'utf-8')
  } catch {
    console.error('Failed to save settings')
  }
}
