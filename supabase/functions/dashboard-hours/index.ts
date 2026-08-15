// ─────────────────────────────────────────────────────────────────────────────
// dashboard-hours — per-person hours across PCO + monday for a week.
//
// PHASE 3 STUB. Returns an empty list so HoursStrip hides itself until the real
// aggregation lands. The intended implementation reuses Sunday Ops' crew-hours
// logic: sum classified PCO plan-time durations per assigned team member, plus
// monday task durations where an est. duration exists (approximate=true when
// durations are missing). See the project note, Phase 3.
// ─────────────────────────────────────────────────────────────────────────────
import { corsHeaders, json } from '../_shared/cors.ts'
import { requireStaff } from '../_shared/session.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const staff = await requireStaff(req)
  if (!staff) return json({ error: 'unauthorized' }, 401)
  return json({ people: [] })
})
