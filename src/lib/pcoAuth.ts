// ─────────────────────────────────────────────────────────────────────────────
// pcoAuth.ts — Planning Center OAuth utilities (shared design with Sunday Ops)
//
// This app reuses Sunday Ops' `pco-auth` edge function AND its localStorage
// session key. Because both apps are served from the same bfcproduction.github.io
// origin, a session created in Sunday Ops is already present here (and vice
// versa) — signing into one signs you into both.
//
// Required env: VITE_PCO_CLIENT_ID (same OAuth app as Sunday Ops).
// The new app's redirect URI must be registered in the PCO developer app.
// ─────────────────────────────────────────────────────────────────────────────

import type { AppAccessLevel } from '../types'

const PCO_AUTHORIZE_URL = 'https://api.planningcenteronline.com/oauth/authorize'
const PCO_SCOPES = 'people services'

// Same key as Sunday Ops on purpose — one shared session across both apps.
const SESSION_KEY = 'bfc_ops_session'
const OAUTH_STATE_KEY = 'pco_oauth_state'

export interface PCOUser {
  id: string
  pco_id: string
  name: string
  email: string | null
  avatar_url: string | null
  access_level: AppAccessLevel
  is_admin: boolean
  is_staff?: boolean // gate for THIS app; resolved via checkStaffAccess()
}

export interface StoredSession {
  user: PCOUser
  token: string
  expires_at: string
}

export function getRedirectUri(): string {
  const { protocol, hostname, port } = window.location
  const origin = (hostname === '127.0.0.1' || hostname === '::1')
    ? `${protocol}//localhost${port ? `:${port}` : ''}`
    : window.location.origin
  const base = `${origin}${import.meta.env.BASE_URL}`
  return base.endsWith('/') ? base : base + '/'
}

export function initiatePCOLogin(options?: { switchAccount?: boolean }): void {
  const clientId = import.meta.env.VITE_PCO_CLIENT_ID as string
  if (!clientId) {
    console.error('VITE_PCO_CLIENT_ID is not set')
    return
  }
  const state = crypto.randomUUID()
  sessionStorage.setItem(OAUTH_STATE_KEY, state)
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: options?.switchAccount ? `openid ${PCO_SCOPES}` : PCO_SCOPES,
    state,
  })
  if (options?.switchAccount) params.set('prompt', 'select_account')
  window.location.href = `${PCO_AUTHORIZE_URL}?${params}`
}

export function extractOAuthCode(): string | null {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) return null
  const savedState = sessionStorage.getItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  if (state !== savedState) {
    console.error('OAuth state mismatch — ignoring callback')
    return null
  }
  window.history.replaceState({}, '', window.location.pathname + window.location.hash)
  return code
}

export async function exchangeCodeForSession(code: string): Promise<StoredSession> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const res = await fetch(`${supabaseUrl}/functions/v1/pco-auth`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code, redirect_uri: getRedirectUri() }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? 'Authentication failed')
  }
  return res.json() as Promise<StoredSession>
}

export function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as StoredSession
    if (!session.user.access_level) {
      session.user.access_level = session.user.is_admin ? 'admin' : 'user'
    }
    if (new Date(session.expires_at) <= new Date()) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

export function storeSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}
