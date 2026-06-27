import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http'
import { shell } from 'electron'
import { randomBytes, createHash } from 'node:crypto'
import { URL } from 'node:url'

const REDIRECT_URI = 'http://127.0.0.1:8888/callback'
const SCOPES = 'user-read-currently-playing user-read-playback-state'

let oauthServer: Server | null = null

interface SpotifyTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

/**
 * Generate PKCE code verifier and challenge.
 */
function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(64)
    .toString('base64url')
    .substring(0, 128)

  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64url')

  return { verifier, challenge }
}

/**
 * Start a temporary HTTP server to capture the OAuth callback,
 * then exchange the code for tokens.
 */
export function startOAuthServer(clientId: string): Promise<SpotifyTokens | null> {
  return new Promise((resolve) => {
    stopOAuthServer()

    const { verifier, challenge } = generatePKCE()
    const state = randomBytes(16).toString('hex')

    oauthServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (!req.url) {
        res.writeHead(400)
        res.end('Bad request')
        return
      }

      const url = new URL(req.url, `http://127.0.0.1:8888`)

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code')
        const returnedState = url.searchParams.get('state')
        const error = url.searchParams.get('error')

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getErrorHTML(error))
          stopOAuthServer()
          resolve(null)
          return
        }

        if (!code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getErrorHTML('Invalid state or missing code'))
          stopOAuthServer()
          resolve(null)
          return
        }

        try {
          const tokens = await exchangeCodeForTokens(clientId, code, verifier)
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getSuccessHTML())
          stopOAuthServer()
          resolve(tokens)
        } catch (err) {
          console.error('[OAuth] Token exchange failed:', err)
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getErrorHTML('Token exchange failed'))
          stopOAuthServer()
          resolve(null)
        }
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    oauthServer.on('error', (err: any) => {
      console.error('[OAuth] Server error:', err)
      stopOAuthServer()
      resolve(null)
    })

    oauthServer.listen(8888, '127.0.0.1', () => {
      const authUrl = new URL('https://accounts.spotify.com/authorize')
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('scope', SCOPES)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      authUrl.searchParams.set('code_challenge', challenge)
      authUrl.searchParams.set('state', state)

      shell.openExternal(authUrl.toString())
    })

    setTimeout(() => {
      if (oauthServer) {
        stopOAuthServer()
        resolve(null)
      }
    }, 5 * 60 * 1000)
  })
}

/**
 * Exchange authorization code for access and refresh tokens.
 */
async function exchangeCodeForTokens(
  clientId: string,
  code: string,
  codeVerifier: string
): Promise<SpotifyTokens> {
  return new Promise((resolve, reject) => {
    const { request } = require('https')
    const postData = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier
    }).toString()

    const req = request(
      'https://accounts.spotify.com/api/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res: IncomingMessage) => {
        let body = ''
        res.on('data', (chunk: Buffer) => (body += chunk))
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`Token exchange failed: ${res.statusCode} ${body}`))
            return
          }
          try {
            const data = JSON.parse(body)
            resolve({
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              expiresAt: Date.now() + data.expires_in * 1000
            })
          } catch (e) {
            reject(new Error('Invalid JSON from Spotify'))
          }
        })
      }
    )

    req.on('error', (e: Error) => reject(e))
    req.write(postData)
    req.end()
  })
}

/**
 * Refresh the Spotify access token using the refresh token.
 */
export async function refreshSpotifyToken(
  clientId: string,
  refreshToken: string
): Promise<SpotifyTokens> {
  return new Promise((resolve, reject) => {
    const { request } = require('https')
    const postData = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString()

    const req = request(
      'https://accounts.spotify.com/api/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res: IncomingMessage) => {
        let body = ''
        res.on('data', (chunk: Buffer) => (body += chunk))
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`Token refresh failed: ${res.statusCode} ${body}`))
            return
          }
          try {
            const data = JSON.parse(body)
            resolve({
              accessToken: data.access_token,
              refreshToken: data.refresh_token || refreshToken,
              expiresAt: Date.now() + data.expires_in * 1000
            })
          } catch (e) {
            reject(new Error('Invalid JSON from Spotify during refresh'))
          }
        })
      }
    )

    req.on('error', (e: Error) => reject(e))
    req.write(postData)
    req.end()
  })
}

/**
 * Stop the OAuth callback server.
 */
export function stopOAuthServer(): void {
  if (oauthServer) {
    oauthServer.close()
    oauthServer = null
  }
}

function getSuccessHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AeroLyrics — Connected!</title>
  <style>
    body {
      background: #0a0616;
      color: #fff;
      font-family: 'Segoe UI', system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      text-align: center;
    }
    .container {
      max-width: 400px;
    }
    h1 {
      color: #a78bfa;
      font-size: 28px;
      margin-bottom: 12px;
    }
    p {
      color: rgba(255,255,255,0.6);
      font-size: 16px;
      line-height: 1.5;
    }
    .check {
      font-size: 64px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="check">✅</div>
    <h1>Connected to Spotify!</h1>
    <p>You can close this tab and return to AeroLyrics.</p>
  </div>
  <script>setTimeout(() => window.close(), 3000);</script>
</body>
</html>`
}

function getErrorHTML(error: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AeroLyrics — Error</title>
  <style>
    body {
      background: #0a0616;
      color: #fff;
      font-family: 'Segoe UI', system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      text-align: center;
    }
    h1 { color: #ef4444; font-size: 24px; }
    p { color: rgba(255,255,255,0.6); font-size: 14px; }
  </style>
</head>
<body>
  <div>
    <h1>Connection Failed</h1>
    <p>${error}</p>
    <p>Please try again from AeroLyrics.</p>
  </div>
</body>
</html>`
}
