import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Verifies the PCO session token (same `user_sessions` table Sunday Ops writes)
// AND that the user is on the dashboard staff allow-list. Returns the user's
// pco_id + name, or null if unauthorized.
export interface StaffUser { pcoId: string; name: string }

export function serviceClient() {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY')!
  return createClient(Deno.env.get('SUPABASE_URL')!, key)
}

export async function requireStaff(req: Request): Promise<StaffUser | null> {
  const token = req.headers.get('x-session-token')
  if (!token) return null

  const db = serviceClient()

  // Two-step (no reliance on PostgREST FK inference): session → user_id, then
  // users → pco_id/name. Same shared tables Sunday Ops' pco-auth writes.
  const { data: session } = await db
    .from('user_sessions')
    .select('user_id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!session) return null
  if (session.expires_at && new Date(session.expires_at) <= new Date()) return null

  const { data: u } = await db
    .from('users')
    .select('pco_id, name')
    .eq('id', session.user_id)
    .maybeSingle()

  if (!u?.pco_id) return null

  const { data: staff } = await db
    .from('dashboard_staff')
    .select('pco_id')
    .eq('pco_id', u.pco_id)
    .maybeSingle()

  if (!staff) return null
  return { pcoId: u.pco_id, name: u.name ?? '' }
}
