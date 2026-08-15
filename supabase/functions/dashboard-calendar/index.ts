// ─────────────────────────────────────────────────────────────────────────────
// dashboard-calendar — merged week view: PCO plan times (classified) +
// crew Google calendars (iCal) + monday task due-dates.
//
// All credentials are read from Supabase project secrets — never the frontend.
// POST body: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
// ─────────────────────────────────────────────────────────────────────────────
import { corsHeaders, json } from '../_shared/cors.ts'
import { requireStaff, serviceClient } from '../_shared/session.ts'

const PCO_BASE = 'https://api.planningcenteronline.com/services/v2'
const SERVICE_TYPES = ['30897', '27010', '571895'] // 9am, 11am, Special Events

// Keep/skip defaults mirror src/lib/pcoClassifier.ts. DB overrides layered on top.
const KEEP = ['production meeting', 'sunday rehearsal', 'sound check', 'camera call', 'load in', 'load out', 'service', 'orchestra/band rehearsal', 'orchestra rehearsal', 'band rehearsal', 'mid-week rehearsal', 'rehearsal']
const SKIP = ['praise team vocal rehearsal', 'vocal rehearsal', 'choir rehearsal', 'choir sound check', 'closing song sound check', 'choir and orchestra team meeting', 'choir and orchestra', 'churchwide prayer']

type Disposition = 'keep' | 'skip' | 'unknown'

function classify(name: string, keep: string[], skip: string[]): Disposition {
  const n = name.trim().toLowerCase()
  if (!n) return 'unknown'
  if (skip.some(p => n.includes(p))) return 'skip'
  if (keep.some(p => n.includes(p))) return 'keep'
  return 'unknown'
}

interface CalEvent {
  id: string; layer: 'personal' | 'pco' | 'monday'; title: string
  start: string; end: string | null; allDay: boolean
  personName?: string; sourceUrl?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const staff = await requireStaff(req)
  if (!staff) return json({ error: 'unauthorized' }, 401)

  const { start, end } = await req.json() as { start: string; end: string }
  const rangeStart = new Date(start + 'T00:00:00')
  const rangeEnd = new Date(end + 'T23:59:59')

  const events: CalEvent[] = []
  const unknownNames = new Set<string>()

  // ── DB classifier overrides ────────────────────────────────────────────────
  const db = serviceClient()
  const { data: rules } = await db.from('dashboard_pco_time_rules').select('name_pattern, disposition')
  const keep = [...KEEP, ...(rules ?? []).filter(r => r.disposition === 'keep').map(r => r.name_pattern)]
  const skip = [...SKIP, ...(rules ?? []).filter(r => r.disposition === 'skip').map(r => r.name_pattern)]

  // ── PCO plan times ─────────────────────────────────────────────────────────
  const appId = Deno.env.get('PCO_APP_ID')!
  const secret = Deno.env.get('PCO_SECRET')!
  const pcoAuth = 'Basic ' + btoa(`${appId}:${secret}`)

  for (const st of SERVICE_TYPES) {
    const plansRes = await fetch(
      `${PCO_BASE}/service_types/${st}/plans?filter=future&per_page=6&order=sort_date`,
      { headers: { Authorization: pcoAuth } },
    )
    if (!plansRes.ok) continue
    const plans = await plansRes.json()
    for (const plan of plans.data ?? []) {
      const timesRes = await fetch(`${PCO_BASE}/service_types/${st}/plans/${plan.id}/plan_times`, { headers: { Authorization: pcoAuth } })
      if (!timesRes.ok) continue
      const times = await timesRes.json()
      for (const t of times.data ?? []) {
        const a = t.attributes
        if (!a.starts_at) continue
        const s = new Date(a.starts_at)
        if (s < rangeStart || s > rangeEnd) continue
        const name = a.name || (a.time_type === 'service' ? (plan.attributes.title ?? 'Service') : '')
        const disp = classify(name || '', keep, skip)
        if (disp === 'skip') continue
        if (disp === 'unknown' && name) unknownNames.add(name)
        events.push({
          id: `pco-${t.id}`, layer: 'pco',
          title: name || 'Service',
          start: a.starts_at, end: a.ends_at ?? null, allDay: false,
          sourceUrl: `https://services.planningcenteronline.com/plans/${plan.id}`,
        })
      }
    }
  }

  // ── Crew Google calendars (iCal) ───────────────────────────────────────────
  const { data: links } = await db.from('dashboard_calendar_links').select('person_name, ical_url, active').eq('active', true)
  for (const link of links ?? []) {
    try {
      const res = await fetch(link.ical_url)
      if (!res.ok) continue
      const text = await res.text()
      for (const ev of parseICal(text, rangeStart, rangeEnd)) {
        events.push({ ...ev, layer: 'personal', personName: link.person_name })
      }
    } catch (_e) { /* skip a broken calendar link silently */ }
  }

  // ── monday task due-dates ──────────────────────────────────────────────────
  try {
    for (const task of await fetchMondayDueTasks(rangeStart, rangeEnd)) events.push(task)
  } catch (_e) { /* monday optional in the calendar; tasks screen still works */ }

  return json({ events, unknownPcoTimeNames: [...unknownNames] })
})

// Minimal iCal parser: single (non-recurring) VEVENTs in range. RRULE skipped
// (out of scope for v1, matching the original dashboard's decision).
function parseICal(ics: string, start: Date, end: Date): CalEvent[] {
  const out: CalEvent[] = []
  const blocks = ics.split('BEGIN:VEVENT').slice(1)
  for (const b of blocks) {
    if (/\nRRULE:/.test(b) || /\rRRULE:/.test(b)) continue
    const get = (k: string) => b.match(new RegExp(`${k}[^:\\n]*:([^\\r\\n]+)`))?.[1]?.trim()
    const dtStart = get('DTSTART'); if (!dtStart) continue
    const s = icalDate(dtStart); if (!s || s < start || s > end) continue
    const dtEnd = get('DTEND'); const e = dtEnd ? icalDate(dtEnd) : null
    out.push({
      id: `ical-${get('UID') ?? crypto.randomUUID()}`,
      layer: 'personal',
      title: (get('SUMMARY') ?? 'Busy'),
      start: s.toISOString(), end: e ? e.toISOString() : null,
      allDay: dtStart.length === 8, // DATE form (no time) → all-day
    })
  }
  return out
}

function icalDate(v: string): Date | null {
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (!h) return new Date(Number(y), Number(mo) - 1, Number(d))
  return z
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    : new Date(+y, +mo - 1, +d, +h, +mi, +s)
}

async function fetchMondayDueTasks(start: Date, end: Date): Promise<CalEvent[]> {
  const token = Deno.env.get('MONDAY_API_TOKEN')
  const board = Deno.env.get('MONDAY_BOARD_ID')
  if (!token || !board) return []
  const query = `query { boards(ids: [${board}]) { items_page(limit: 100) { items { id name column_values { id text type } } } } }`
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': '2024-10' },
    body: JSON.stringify({ query }),
  })
  const data = await res.json()
  const items = data?.data?.boards?.[0]?.items_page?.items ?? []
  const out: CalEvent[] = []
  for (const it of items) {
    const due = it.column_values.find((c: { type: string }) => c.type === 'date')?.text
    if (!due) continue
    const d = new Date(due + 'T09:00:00')
    if (d < start || d > end) continue
    out.push({
      id: `monday-${it.id}`, layer: 'monday', title: it.name,
      start: d.toISOString(), end: null, allDay: true,
      sourceUrl: `https://monday.com/boards/${board}/pulses/${it.id}`,
    })
  }
  return out
}
