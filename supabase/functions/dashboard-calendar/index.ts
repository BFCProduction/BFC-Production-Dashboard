// ─────────────────────────────────────────────────────────────────────────────
// dashboard-calendar — merged week view: PCO plan times + crew Google calendars
// (iCal) + monday task due-dates. All creds server-side. Fetches parallelized.
//
// PCO events carry `context` (service label, or the plan title for Special
// Events) and `assignees` (paid staff scheduled on that plan).
// ─────────────────────────────────────────────────────────────────────────────
import { corsHeaders, json } from '../_shared/cors.ts'
import { requireStaff, serviceClient } from '../_shared/session.ts'

const PCO_BASE = 'https://api.planningcenteronline.com/services/v2'
// 9:00, 11:00, Special Events, Celebrate Recovery, BFC Students.
const SERVICE_TYPES = ['30897', '27010', '571895', '232033', '189466']
const ST_LABEL: Record<string, string> = {
  '30897': '9:00', '27010': '11:00', '232033': 'Celebrate Recovery', '189466': 'BFC Students',
}
const SPECIAL_ST = '571895'

interface Assignee { name: string; position: string | null; status: string | null }
interface CalEvent {
  id: string; layer: 'personal' | 'pco' | 'monday'; title: string
  start: string; end: string | null; allDay: boolean
  personName?: string; calendarId?: string; context?: string; assignees?: Assignee[]; sourceUrl?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const staff = await requireStaff(req)
  if (!staff) return json({ error: 'unauthorized' }, 401)

  const { start, end } = (await req.json()) as { start: string; end: string }
  const rangeStart = new Date(start + 'T00:00:00')
  const rangeEnd = new Date(end + 'T23:59:59')

  const events: CalEvent[] = []
  const db = serviceClient()

  const [links, staffRows, mondayEvents] = await Promise.all([
    db.from('dashboard_calendar_links').select('id, person_name, label, ical_url, active').eq('active', true),
    db.from('dashboard_staff').select('pco_id, name'),
    fetchMondayDueTasks(rangeStart, rangeEnd).catch(() => [] as CalEvent[]),
  ])
  const staffMap: Record<string, string> = {}
  for (const s of staffRows.data ?? []) staffMap[String(s.pco_id)] = s.name ?? ''

  const pcoEvents = await fetchPcoEvents(rangeStart, rangeEnd, staffMap)
  for (const ev of pcoEvents) events.push(ev)

  const icalResults = await Promise.all((links.data ?? []).map(async (link) => {
    try {
      const res = await fetch(link.ical_url)
      if (!res.ok) return [] as CalEvent[]
      return parseICal(await res.text(), rangeStart, rangeEnd).map((ev) => ({
        ...ev,
        personName: link.label ? `${link.person_name} · ${link.label}` : link.person_name,
        calendarId: String(link.id),
      }))
    } catch { return [] as CalEvent[] }
  }))
  for (const list of icalResults) for (const ev of list) events.push(ev)

  for (const ev of mondayEvents) events.push(ev)

  return json({ events, unknownPcoTimeNames: [] })
})

async function fetchPcoEvents(rangeStart: Date, rangeEnd: Date, staffMap: Record<string, string>): Promise<CalEvent[]> {
  const appId = Deno.env.get('PCO_APP_ID')
  const secret = Deno.env.get('PCO_SECRET')
  if (!appId || !secret) return []
  const h = { Authorization: 'Basic ' + btoa(`${appId}:${secret}`) }

  const planLists = await Promise.all(SERVICE_TYPES.map(async (st) => {
    const r = await fetch(`${PCO_BASE}/service_types/${st}/plans?filter=future&per_page=4&order=sort_date`, { headers: h })
    if (!r.ok) return [] as { st: string; id: string; title: string }[]
    const j = await r.json()
    // deno-lint-ignore no-explicit-any
    return (j.data ?? []).map((p: any) => ({ st, id: p.id, title: p.attributes.title ?? '' }))
  }))
  const plans = planLists.flat()

  const perPlan = await Promise.all(plans.map(async (plan) => {
    const [timesRes, tmRes] = await Promise.all([
      fetch(`${PCO_BASE}/service_types/${plan.st}/plans/${plan.id}/plan_times`, { headers: h }),
      fetch(`${PCO_BASE}/service_types/${plan.st}/plans/${plan.id}/team_members?per_page=100`, { headers: h }),
    ])

    // Paid staff scheduled on this plan (skip declined). Dedupe per person,
    // merging multiple positions into one entry.
    const assignees: Assignee[] = []
    if (tmRes.ok) {
      const tj = await tmRes.json()
      const byPerson = new Map<string, { name: string; positions: Set<string>; status: string | null }>()
      // deno-lint-ignore no-explicit-any
      for (const tm of (tj.data ?? []) as any[]) {
        const personId = tm.relationships?.person?.data?.id
        const name = personId ? staffMap[String(personId)] : undefined
        if (!name) continue
        const status = tm.attributes?.status ?? null
        if (typeof status === 'string' && status.toLowerCase() === 'declined') continue
        const entry = byPerson.get(String(personId)) ?? { name, positions: new Set<string>(), status }
        const pos = tm.attributes?.team_position_name
        if (pos) entry.positions.add(pos)
        byPerson.set(String(personId), entry)
      }
      for (const e of byPerson.values()) {
        assignees.push({ name: e.name, position: [...e.positions].join(', ') || null, status: e.status })
      }
    }

    const context = ST_LABEL[plan.st] ?? (plan.title || 'Special Event')
    const out: CalEvent[] = []
    if (timesRes.ok) {
      const j = await timesRes.json()
      // deno-lint-ignore no-explicit-any
      for (const t of (j.data ?? []) as any[]) {
        const a = t.attributes
        if (!a.starts_at) continue
        const s = new Date(a.starts_at)
        if (s < rangeStart || s > rangeEnd) continue
        const name = a.name || (a.time_type === 'service' ? (plan.title || 'Service') : (plan.title || 'Plan Time'))
        out.push({
          id: `pco-${t.id}`, layer: 'pco', title: name,
          start: a.starts_at, end: a.ends_at ?? null, allDay: false,
          context, assignees,
          sourceUrl: `https://services.planningcenteronline.com/plans/${plan.id}`,
        })
      }
    }
    return out
  }))
  return perPlan.flat()
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
  const token = Deno.env.get('MONDAY_API_TOKEN')
  const board = Deno.env.get('MONDAY_PRODUCTION_BOARD_ID') ?? Deno.env.get('MONDAY_BOARD_ID')
  if (!token || !board) return []
  const query = `query { boards(ids: [${board}]) { items_page(limit: 100) { items { id name column_values { id text type } } } } }`
  const res = await fetch('https://api.monday.com/v2', { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': '2024-10' }, body: JSON.stringify({ query }) })
  const data = await res.json()
  const items = data?.data?.boards?.[0]?.items_page?.items ?? []
  const out: CalEvent[] = []
  for (const it of items) {
    const due = it.column_values.find((c: { type: string }) => c.type === 'date')?.text
    const d = parseDue(due)
    if (!d) continue
    if (d < start || d > end) continue
    out.push({ id: `monday-${it.id}`, layer: 'monday', title: it.name, start: d.toISOString(), end: null, allDay: true, sourceUrl: `https://monday.com/boards/${board}/pulses/${it.id}` })
  }
  return out
}

function parseDue(due: string | null | undefined): Date | null {
  if (!due) return null
  const m = due.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  return new Date(+y, +mo - 1, +d, h ? +h : 9, mi ? +mi : 0)
}
