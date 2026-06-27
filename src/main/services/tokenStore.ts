import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

interface SpotifyTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

const CONFIG_DIR = join(app.getPath('userData'), 'config')
const TOKENS_PATH = join(CONFIG_DIR, 'spotify-tokens.json')

/**
 * Ensure the config directory exists.
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

/**
 * Load saved Spotify tokens from disk.
 */
export function loadTokens(): SpotifyTokens | null {
  try {
    ensureConfigDir()
    if (!existsSync(TOKENS_PATH)) return null

    const data = readFileSync(TOKENS_PATH, 'utf-8')
    const tokens = JSON.parse(data) as SpotifyTokens

    // Validate structure
    if (!tokens.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
      return null
    }

    return tokens
  } catch {
    console.error('Failed to load tokens')
    return null
  }
}

/**
 * Save Spotify tokens to disk.
 */
export function saveTokens(tokens: SpotifyTokens): void {
  try {
    ensureConfigDir()
    writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf-8')
  } catch {
    console.error('Failed to save tokens')
  }
}

/**
 * Delete saved tokens (logout).
 */
export function clearTokens(): void {
  try {
    if (existsSync(TOKENS_PATH)) {
      writeFileSync(TOKENS_PATH, '', 'utf-8')
    }
  } catch {
    console.error('Failed to clear tokens')
  }
}
