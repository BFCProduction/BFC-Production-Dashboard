// ─────────────────────────────────────────────────────────────────────────────
// dashboard-calendar — merged week view: PCO plan times (classified) +
// crew Google calendars (iCal) + monday task due-dates.
//
// POST { start:'YYYY-MM-DD', end:'YYYY-MM-DD' }. All creds are server-side.
// PCO fetches are parallelized (plans across service types, then all plan_times
// at once) to keep this fast.
// ─────────────────────────────────────────────────────────────────────────────
import { corsHeaders, json } from '../_shared/cors.ts'
import { requireStaff, serviceClient } from '../_shared/session.ts'

const PCO_BASE = 'https://api.planningcenteronline.com/services/v2'
const SERVICE_TYPES = ['30897', '27010', '571895']

const KEEP = ['production meeting', 'sunday rehearsal', 'sound check', 'camera call', 'load in', 'load out', 'service', 'orchestra/band rehearsal', 'orchestra rehearsal', 'band rehearsal', 'mid-week rehearsal', 'rehearsal']
const SKIP = ['praise team vocal rehearsal', 'vocal rehearsal', 'choir rehearsal', 'choir sound check', 'closing song sound check', 'choir and orchestra team meeting', 'choir and orchestra', 'churchwide prayer']

type Disposition = 'keep' | 'skip' | 'unknown'
function classify(name: string, keep: string[], skip: string[]): Disposition {
  const n = name.trim().toLowerCase()
  if (!n) return 'unknown'
  if (skip.some((p) => n.includes(p))) return 'skip'
  if (keep.some((p) => n.includes(p))) return 'keep'
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

  const { start, end } = (await req.json()) as { start: string; end: string }
  const rangeStart = new Date(start + 'T00:00:00')
  const rangeEnd = new Date(end + 'T23:59:59')

  const events: CalEvent[] = []
  const unknownNames = new Set<string>()

  const db = serviceClient()

  // Run the three independent data sources concurrently.
  const [rulesRes, links, pcoEvents, mondayEvents] = await Promise.all([
    db.from('dashboard_pco_time_rules').select('name_pattern, disposition'),
    db.from('dashboard_calendar_links').select('person_name, ical_url, active').eq('active', true),
    fetchPcoEvents(rangeStart, rangeEnd, unknownNames),
    fetchMondayDueTasks(rangeStart, rangeEnd).catch(() => [] as CalEvent[]),
  ])

  // Apply DB classifier overrides to the (already collected) PCO candidates.
  const rules = rulesRes.data ?? []
  const keep = [...KEEP, ...rules.filter((r) => r.disposition === 'keep').map((r) => r.name_pattern)]
  const skip = [...SKIP, ...rules.filter((r) => r.disposition === 'skip').map((r) => r.name_pattern)]
  for (const ev of pcoEvents) {
    const disp = classify(ev.title, keep, skip)
    if (disp === 'skip') continue
    if (disp === 'unknown' && ev.title) unknownNames.add(ev.title)
    events.push(ev)
  }

  // Crew Google calendars (parallel fetch of every opt-in iCal).
  const icalResults = await Promise.all((links.data ?? []).map(async (link) => {
    try {
      const res = await fetch(link.ical_url)
      if (!res.ok) return []
      return parseICal(await res.text(), rangeStart, rangeEnd).map((ev) => ({ ...ev, personName: link.person_name }))
    } catch { return [] }
  }))
  for (const list of icalResults) for (const ev of list) events.push(ev)

  for (const ev of mondayEvents) events.push(ev)

  return json({ events, unknownPcoTimeNames: [...unknownNames] })
})

// Returns UNCLASSIFIED pco candidates (title = plan-time name); caller classifies.
async function fetchPcoEvents(rangeStart: Date, rangeEnd: Date, _unknown: Set<string>): Promise<CalEvent[]> {
  const appId = Deno.env.get('PCO_APP_ID')
  const secret = Deno.env.get('PCO_SECRET')
  if (!appId || !secret) return []
  const auth = 'Basic ' + btoa(`${appId}:${secret}`)
  const h = { Authorization: auth }

  // 1) All service types' plans in parallel.
  const planLists = await Promise.all(SERVICE_TYPES.map(async (st) => {
    const r = await fetch(`${PCO_BASE}/service_types/${st}/plans?filter=future&per_page=4&order=sort_date`, { headers: h })
    if (!r.ok) return [] as { st: string; id: string; title: string }[]
    const j = await r.json()
    // deno-lint-ignore no-explicit-any
    return (j.data ?? []).map((p: any) => ({ st, id: p.id, title: p.attributes.title ?? '' }))
  }))
  const plans = planLists.flat()

  // 2) All plan_times in parallel.
  const timeLists = await Promise.all(plans.map(async (plan) => {
    const r = await fetch(`${PCO_BASE}/service_types/${plan.st}/plans/${plan.id}/plan_times`, { headers: h })
    if (!r.ok) return [] as CalEvent[]
    const j = await r.json()
    const out: CalEvent[] = []
    // deno-lint-ignore no-explicit-any
    for (const t of (j.data ?? []) as any[]) {
      const a = t.attributes
      if (!a.starts_at) continue
      const s = new Date(a.starts_at)
      if (s < rangeStart || s > rangeEnd) continue
      const name = a.name || (a.time_type === 'service' ? (plan.title || 'Service') : '')
      out.push({ id: `pco-${t.id}`, layer: 'pco', title: name || 'Service', start: a.starts_at, end: a.ends_at ?? null, allDay: false, sourceUrl: `https://services.planningcenteronline.com/plans/${plan.id}` })
    }
    return out
  }))
  return timeLists.flat()
}

function parseICal(ics: string, start: Date, end: Date): CalEvent[] {
  const out: CalEvent[] = []
  const blocks = ics.split('BEGIN:VEVENT').slice(1)
  for (const b of blocks) {
    if (/RRULE:/.test(b)) continue
    const get = (k: string) => b.match(new RegExp(`${k}[^:\\n]*:([^\\r\\n]+)`))?.[1]?.trim()
    const dtStart = get('DTSTART'); if (!dtStart) continue
    const s = icalDate(dtStart); if (!s || s < start || s > end) continue
    const dtEnd = get('DTEND'); const e = dtEnd ? icalDate(dtEnd) : null
    out.push({ id: `ical-${get('UID') ?? crypto.randomUUID()}`, layer: 'personal', title: get('SUMMARY') ?? 'Busy', start: s.toISOString(), end: e ? e.toISOString() : null, allDay: dtStart.length === 8 })
  }
  return out
}

function icalDate(v: string): Date | null {
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (!h) return new Date(Number(y), Number(mo) - 1, Number(d))
  return z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) : new Date(+y, +mo - 1, +d, +h, +mi, +s)
}

async function fetchMondayDueTasks(start: Date, end: Date): Promise<CalEvent[]> {
  const token = Deno.env.get('MONDAY_PRODUCTION_BOARD_ID') ? Deno.env.get('MONDAY_API_TOKEN') : Deno.env.get('MONDAY_API_TOKEN')
  const board = Deno.env.get('MONDAY_PRODUCTION_BOARD_ID') ?? Deno.env.get('MONDAY_BOARD_ID')
  if (!token || !board) return []
  const query = `query { boards(ids: [${board}]) { items_page(limit: 100) { items { id name column_values { id text type } } } } }`
  const res = await fetch('https://api.monday.com/v2', { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': '2024-10' }, body: JSON.stringify({ query }) })
  const data = await res.json()
  const items = data?.data?.boards?.[0]?.items_page?.items ?? []
  const out: CalEvent[] = []
  for (const it of items) {
    const due = it.column_values.find((c: { type: string }) => c.type === 'date')?.text
    if (!due) continue
    const d = new Date(due + 'T09:00:00')
    if (d < start || d > end) continue
    out.push({ id: `monday-${it.id}`, layer: 'monday', title: it.name, start: d.toISOString(), end: null, allDay: true, sourceUrl: `https://monday.com/boards/${board}/pulses/${it.id}` })
  }
  return out
}
