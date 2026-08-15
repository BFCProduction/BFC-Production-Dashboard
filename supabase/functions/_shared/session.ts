import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Verifies the PCO session token (same `user_sessions` table Sunday Ops writes)
// AND that the user is on the dashboard staff allow-list. Returns the user's
// pco_id + name, or null if unauthorized.
export interface StaffUser { pcoId: string; name: string }

export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_KEY')!,
  )
}

export async function requireStaff(req: Request): Promise<StaffUser | null> {
  const token = req.headers.get('x-session-token')
  if (!token) return null

  const db = serviceClient()

  const { data: session } = await db
    .from('user_sessions')
    .select('pco_id, name, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!session) return null
  if (session.expires_at && new Date(session.expires_at) <= new Date()) return null

  const { data: staff } = await db
    .from('dashboard_staff')
    .select('pco_id')
    .eq('pco_id', session.pco_id)
    .maybeSingle()

  if (!staff) return null
  return { pcoId: session.pco_id, name: session.name ?? '' }
}
