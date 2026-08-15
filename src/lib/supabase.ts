import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const SUPABASE_URL = supabaseUrl
export const SUPABASE_ANON_KEY = supabaseAnonKey

/**
 * Thin helper to call a Supabase Edge Function with the current PCO session
 * token attached (protected functions verify it). Mirrors the Sunday Ops
 * convention of passing `x-session-token`.
 */
export async function callFunction<T>(
  name: string,
  body: unknown,
  sessionToken: string | null,
): Promise<T> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
    },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `${name} failed (${res.status})`)
  }
  return res.json() as Promise<T>
}
