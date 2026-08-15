import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// The `is_staff` gate for THIS app.
//
// Resolved by a lookup against the `dashboard_staff` table (see migration 001),
// keyed by the user's PCO id. Kept deliberately separate from Sunday Ops'
// user/manager/admin tiers: being paid crew ≠ being an app admin, and this
// flag only ADDS access to this app's front door.
//
// An Admin manages the staff list (Sunday Ops People & Access is the intended
// home for the toggle in a later phase).
// ─────────────────────────────────────────────────────────────────────────────
export async function checkStaffAccess(pcoId: string | undefined): Promise<boolean> {
  if (!pcoId) return false
  const { data, error } = await supabase
    .from('dashboard_staff')
    .select('pco_id')
    .eq('pco_id', pcoId)
    .maybeSingle()
  if (error) {
    console.error('staff access check failed:', error.message)
    return false
  }
  return !!data
}
