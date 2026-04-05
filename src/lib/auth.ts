// ── PKCE Auth helpers (no Amplify — plain fetch + Web Crypto API) ──────────────
//
// Flow:
//   1. initiateLogin()  →  redirect to Cognito Hosted UI with PKCE challenge
//   2. User signs in; Cognito redirects to /auth/callback?code=...
//   3. handleCallback(code)  →  exchange code for tokens, store in localStorage
//   4. All API calls use getAccessToken() which auto-refreshes when near expiry
//   5. logout()  →  clear storage, redirect to Cognito logout

const STORAGE_KEY = 'seating_chart_auth'

interface StoredTokens {
  accessToken: string
  refreshToken: string
  idToken: string
  expiresAt: number   // epoch ms
}

// ── Token storage ──────────────────────────────────────────────────────────────

function storeTokens(tokens: StoredTokens): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
}

function loadTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredTokens) : null
  } catch {
    return null
  }
}

function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem('pkce_verifier')
  localStorage.removeItem('pkce_state')
}

// ── Auth state ─────────────────────────────────────────────────────────────────

export function isAuthenticated(): boolean {
  const tokens = loadTokens()
  if (!tokens) return false
  // Consider authenticated if access token hasn't expired yet
  return Date.now() < tokens.expiresAt - 10_000
}

// ── PKCE helpers ───────────────────────────────────────────────────────────────

function generateRandomBase64url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

async function sha256Base64url(plain: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// ── Login ──────────────────────────────────────────────────────────────────────

export async function initiateLogin(): Promise<void> {
  const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN as string
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string
  const redirectUri = import.meta.env.VITE_REDIRECT_URI as string

  const verifier = generateRandomBase64url(32)
  const state = generateRandomBase64url(16)
  const challenge = await sha256Base64url(verifier)

  localStorage.setItem('pkce_verifier', verifier)
  localStorage.setItem('pkce_state', state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'email openid profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  window.location.href = `${cognitoDomain}/oauth2/authorize?${params}`
}

// ── Callback ───────────────────────────────────────────────────────────────────

interface CognitoTokenResponse {
  access_token: string
  refresh_token: string
  id_token: string
  expires_in: number
  token_type: string
}

export async function handleCallback(code: string, returnedState: string): Promise<void> {
  const storedState = localStorage.getItem('pkce_state')
  if (returnedState !== storedState) {
    throw new Error('OAuth state mismatch — possible CSRF attack')
  }

  const verifier = localStorage.getItem('pkce_verifier')
  if (!verifier) {
    throw new Error('Missing PKCE verifier')
  }

  const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN as string
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string
  const redirectUri = import.meta.env.VITE_REDIRECT_URI as string

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  })

  const res = await fetch(`${cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${text}`)
  }

  const data = (await res.json()) as CognitoTokenResponse

  storeTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  })

  // Clean up PKCE state
  localStorage.removeItem('pkce_verifier')
  localStorage.removeItem('pkce_state')
}

// ── Token refresh ──────────────────────────────────────────────────────────────

async function refreshTokens(): Promise<StoredTokens> {
  const tokens = loadTokens()
  if (!tokens?.refreshToken) throw new Error('No refresh token available')

  const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN as string
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: tokens.refreshToken,
  })

  const res = await fetch(`${cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    clearTokens()
    throw new Error('Refresh token expired — user must sign in again')
  }

  const data = (await res.json()) as Omit<CognitoTokenResponse, 'refresh_token'> & { refresh_token?: string }

  const refreshed: StoredTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    idToken: data.id_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }

  storeTokens(refreshed)
  return refreshed
}

// ── Get access token (auto-refresh) ───────────────────────────────────────────

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000  // refresh if within 5 minutes of expiry

export async function getAccessToken(): Promise<string> {
  let tokens = loadTokens()
  if (!tokens) throw new Error('Not authenticated')

  if (Date.now() > tokens.expiresAt - REFRESH_THRESHOLD_MS) {
    tokens = await refreshTokens()
  }

  return tokens.accessToken
}

// ── Logout ─────────────────────────────────────────────────────────────────────

export function logout(): void {
  const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN as string
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string
  const redirectUri = import.meta.env.VITE_REDIRECT_URI as string
  // Redirect to home after logout
  const logoutUri = redirectUri.replace('/auth/callback', '')

  clearTokens()

  const params = new URLSearchParams({
    client_id: clientId,
    logout_uri: logoutUri,
  })

  window.location.href = `${cognitoDomain}/logout?${params}`
}
