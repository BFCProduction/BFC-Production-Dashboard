// ─────────────────────────────────────────────────────────────────────────────
// pcoClassifier.ts — decide which PCO plan times are "production-related".
//
// Why name-based, not time_type-based: "Sunday Rehearsal/Sound Check" and
// "Choir Rehearsal" are BOTH time_type=rehearsal, but only the first is ours.
// So classification keys off the time NAME. Defaults below were confirmed with
// Alan on 2026-08-15 from real 9am / 11am / Special Events plan data.
//
// Unknown names default to 'unknown' → the UI shows them (show-until-filed) so
// nothing slips past. The keep/skip lists are intended to become editable in
// settings; the shape here matches what a `dashboard_pco_time_rules` table
// would store.
// ─────────────────────────────────────────────────────────────────────────────

export type Classification = 'keep' | 'skip' | 'unknown'

// Matched case-insensitively as substrings against the plan-time name.
export const KEEP_PATTERNS: string[] = [
  'production meeting',
  'sunday rehearsal',
  'sound check',           // production sound checks (see SKIP for choir-specific)
  'camera call',
  'load in',
  'load out',
  'service',               // "9:00 Service", "11:00 Service", event service
  'orchestra/band rehearsal',
  'orchestra rehearsal',
  'band rehearsal',
  'mid-week rehearsal',
  'rehearsal',             // special-event generic "Rehearsal" — KEEP per Alan
]

// SKIP wins over KEEP when both match (see classifyPlanTime). This lets a broad
// KEEP like "sound check" coexist with a specific SKIP like "choir sound check".
export const SKIP_PATTERNS: string[] = [
  'praise team vocal rehearsal',
  'vocal rehearsal',
  'choir rehearsal',
  'choir sound check',
  'closing song sound check',
  'choir and orchestra team meeting',
  'choir and orchestra',
  'churchwide prayer',
]

export interface PlanTimeInput {
  name: string | null
  timeType?: string | null   // service | rehearsal | other (informational only)
}

export function classifyPlanTime(t: PlanTimeInput): Classification {
  const name = (t.name ?? '').trim().toLowerCase()

  // A named service time is always kept even if unnamed variants exist.
  if (!name) {
    return t.timeType === 'service' ? 'keep' : 'unknown'
  }

  const skip = SKIP_PATTERNS.some(p => name.includes(p))
  if (skip) return 'skip'

  const keep = KEEP_PATTERNS.some(p => name.includes(p))
  if (keep) return 'keep'

  return 'unknown'
}

/** Convenience: should this plan time appear on the production calendar? */
export function isProductionTime(t: PlanTimeInput): boolean {
  const c = classifyPlanTime(t)
  return c === 'keep' || c === 'unknown' // show-until-filed
}
