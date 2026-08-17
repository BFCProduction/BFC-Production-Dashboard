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
    const text = await fetchIcalCached(link.ical_url)
    if (!text) return [] as CalEvent[]
    return parseICal(text, rangeStart, rangeEnd).map((ev) => ({
      ...ev,
      personName: link.label ? `${link.person_name} · ${link.label}` : link.person_name,
      calendarId: String(link.id),
    }))
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

  // Phase 1: plan_times for all upcoming plans (light), keep only plans with a
  // time in the requested week.
  // deno-lint-ignore no-explicit-any
  const timed = await Promise.all(plans.map(async (plan): Promise<{ plan: typeof plans[number]; times: any[] }> => {
    const r = await fetch(`${PCO_BASE}/service_types/${plan.st}/plans/${plan.id}/plan_times`, { headers: h })
    if (!r.ok) return { plan, times: [] }
    const j = await r.json()
    // deno-lint-ignore no-explicit-any
    const times = (j.data ?? []).filter((t: any) => {
      const at = t.attributes?.starts_at; if (!at) return false
      const s = new Date(at); return s >= rangeStart && s <= rangeEnd
    })
    return { plan, times }
  }))
  const relevant = timed.filter(x => x.times.length > 0)

  // Phase 2: crew assignments ONLY for in-window plans.
  const assigneesByPlan = new Map<string, Assignee[]>()
  await Promise.all(relevant.map(async ({ plan }) => {
    const r = await fetch(`${PCO_BASE}/service_types/${plan.st}/plans/${plan.id}/team_members?per_page=100`, { headers: h })
    const list: Assignee[] = []
    if (r.ok) {
      const tj = await r.json()
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
      for (const e of byPerson.values()) list.push({ name: e.name, position: [...e.positions].join(', ') || null, status: e.status })
    }
    assigneesByPlan.set(plan.id, list)
  }))

  const out: CalEvent[] = []
  for (const { plan, times } of relevant) {
    const assignees = assigneesByPlan.get(plan.id) ?? []
    const context = ST_LABEL[plan.st] ?? (plan.title || 'Special Event')
    // deno-lint-ignore no-explicit-any
    for (const t of times as any[]) {
      const a = t.attributes
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
}

// Cache the (large) iCal feeds server-side to avoid re-downloading on every
// load and to stay under Google's rate limiting. 5-minute TTL, with a fetch
// timeout so a slow/throttled feed never hangs the whole request.
const icalCache = new Map<string, { text: string; at: number }>()
async function fetchIcalCached(url: string): Promise<string> {
  const cached = icalCache.get(url)
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.text
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'Accept-Encoding': 'gzip, deflate, br' } })
    if (!res.ok) return cached?.text ?? ''
    const text = await res.text()
    // Ignore throttle/redirect stubs (real feeds are large).
    if (text.length < 5000 && !text.includes('BEGIN:VEVENT')) return cached?.text ?? ''
    icalCache.set(url, { text, at: Date.now() })
    return text
  } catch { return cached?.text ?? '' }
  finally { clearTimeout(timer) }
}

const CHURCH_TZ = 'America/Chicago'

interface DT { date: Date; y: number; mo: number; d: number; h: number; mi: number; s: number; tz: string; allDay: boolean }

function parseICal(ics: string, start: Date, end: Date): CalEvent[] {
  const out: CalEvent[] = []
  const unfolded = ics.replace(/\r?\n[ \t]/g, '') // unfold wrapped lines
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1)

  const parsed = blocks.map(b => {
    const uid = b.match(/UID[^:\r\n]*:([^\r\n]+)/)?.[1]?.trim() ?? crypto.randomUUID()
    const rid = b.match(/RECURRENCE-ID[^:\r\n]*:([^\r\n]+)/)?.[1]?.match(/(\d{4})(\d{2})(\d{2})/)
    return { b, uid, ridKey: rid ? `${rid[1]}${rid[2]}${rid[3]}` : null }
  })
  // A modified instance (RECURRENCE-ID) replaces the master's occurrence on that date.
  const overridden = new Set<string>()
  for (const p of parsed) if (p.ridKey) overridden.add(`${p.uid}::${p.ridKey}`)

  const seen = new Set<string>() // final dedupe by title + start
  for (const p of parsed) {
    const b = p.b
    const dt = parseDTLine(b, 'DTSTART'); if (!dt) continue
    const et = parseDTLine(b, 'DTEND')
    const durationMs = et ? (et.date.getTime() - dt.date.getTime()) : (dt.allDay ? 86400000 : 0)
    const summary = b.match(/SUMMARY[^:\r\n]*:([^\r\n]+)/)?.[1]?.trim() ?? 'Busy'
    const rrule = !p.ridKey ? b.match(/\bRRULE:([^\r\n]+)/)?.[1] : undefined // overrides never expand

    const occurrences = rrule
      ? expandRecurrence(dt, durationMs, rrule, collectExdates(b), start, end, p.uid, overridden)
      : (dt.date >= start && dt.date <= end ? [{ start: dt.date, end: durationMs ? new Date(dt.date.getTime() + durationMs) : null }] : [])

    for (const occ of occurrences) {
      const key = `${summary}|${occ.start.toISOString()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        id: `ical-${p.uid}-${occ.start.getTime()}`, layer: 'personal',
        title: summary, start: occ.start.toISOString(), end: occ.end ? occ.end.toISOString() : null,
        allDay: dt.allDay,
      })
    }
  }
  return out
}

function collectExdates(block: string): Set<string> {
  const set = new Set<string>()
  for (const m of block.matchAll(/EXDATE[^:\r\n]*:([^\r\n]+)/g)) {
    for (const part of m[1].split(',')) {
      const dm = part.match(/(\d{4})(\d{2})(\d{2})/)
      if (dm) set.add(`${dm[1]}${dm[2]}${dm[3]}`)
    }
  }
  return set
}

function parseDTLine(block: string, key: string): DT | null {
  const m = block.match(new RegExp(`${key}([^:\\r\\n]*):([^\\r\\n]+)`))
  if (!m) return null
  const tzid = m[1].match(/TZID=([^;:]+)/)?.[1]
  const vm = m[2].trim().match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/)
  if (!vm) return null
  const [, ys, mos, ds, hs, mis, ss, z] = vm
  const allDay = !hs
  const tz = z ? 'UTC' : (tzid || CHURCH_TZ)
  const h = allDay ? 12 : +hs, mi = allDay ? 0 : +mis, s = allDay ? 0 : +ss // date-only → noon
  return { date: zonedToUtc(+ys, +mos - 1, +ds, h, mi, s, tz), y: +ys, mo: +mos, d: +ds, h, mi, s, tz, allDay }
}

// Expand an RRULE into occurrence instants within [rangeStart, rangeEnd].
// Handles FREQ DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, BYDAY (weekly), UNTIL,
// COUNT, and EXDATE. Each occurrence's wall time is re-anchored in its tz (DST-safe).
function expandRecurrence(dt: DT, durationMs: number, rrule: string, exdates: Set<string>, rangeStart: Date, rangeEnd: Date, uid: string, overridden: Set<string>): { start: Date; end: Date | null }[] {
  const parts: Record<string, string> = {}
  for (const kv of rrule.split(';')) { const [k, v] = kv.split('='); if (k) parts[k.toUpperCase()] = v }
  const freq = parts.FREQ
  const interval = Math.max(1, parseInt(parts.INTERVAL ?? '1', 10))
  const count = parts.COUNT ? parseInt(parts.COUNT, 10) : null
  const until = parts.UNTIL ? parseUntil(parts.UNTIL) : null
  const DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
  const byday = (parts.BYDAY ?? '').split(',').map(x => DOW[x.slice(-2)]).filter(x => x !== undefined)

  const results: { start: Date; end: Date | null }[] = []
  let emitted = 0
  const pushOcc = (oy: number, omIdx: number, od: number): boolean => {
    // returns false to stop (count/until exhausted)
    const startI = zonedToUtc(oy, omIdx, od, dt.h, dt.mi, dt.s, dt.tz)
    if (startI.getTime() < dt.date.getTime() - 1000) return true // before series start; keep scanning
    if (until && startI > until) return false
    if (count !== null && emitted >= count) return false
    emitted++
    const key = `${oy}${String(omIdx + 1).padStart(2, '0')}${String(od).padStart(2, '0')}`
    if (startI >= rangeStart && startI <= rangeEnd && !exdates.has(key) && !overridden.has(`${uid}::${key}`)) {
      results.push({ start: startI, end: durationMs ? new Date(startI.getTime() + durationMs) : null })
    }
    return true
  }

  const guard = 4000
  if (freq === 'WEEKLY') {
    const days = byday.length ? byday : [new Date(Date.UTC(dt.y, dt.mo - 1, dt.d)).getUTCDay()]
    // Monday of DTSTART's week (ICS default WKST=MO).
    const startDow = new Date(Date.UTC(dt.y, dt.mo - 1, dt.d)).getUTCDay()
    const firstWeek = Date.UTC(dt.y, dt.mo - 1, dt.d) - ((startDow + 6) % 7) * 86400000
    // Fast-forward to the interval-week nearest rangeStart (we only need this window).
    const weekMs = 7 * interval * 86400000
    let week = new Date(firstWeek)
    if (rangeStart.getTime() - 7 * 86400000 > firstWeek) {
      const jumps = Math.floor((rangeStart.getTime() - 7 * 86400000 - firstWeek) / weekMs)
      week = new Date(firstWeek + jumps * weekMs)
      emitted = jumps * days.length // approximate COUNT after fast-forward
    }
    for (let i = 0; i < guard; i++) {
      if (week.getTime() > rangeEnd.getTime() + 7 * 86400000) break
      for (const dow of [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) {
        const occ = new Date(week.getTime() + ((dow + 6) % 7) * 86400000)
        if (!pushOcc(occ.getUTCFullYear(), occ.getUTCMonth(), occ.getUTCDate())) return results
      }
      week = new Date(week.getTime() + 7 * interval * 86400000)
    }
    return results
  }

  // DAILY / MONTHLY / YEARLY: iterate calendar dates from DTSTART.
  let cy = dt.y, cm = dt.mo - 1, cd = dt.d
  // Fast-forward DAILY to near rangeStart to avoid long loops on old series.
  if (freq === 'DAILY') {
    const startMid = Date.UTC(dt.y, dt.mo - 1, dt.d)
    const targetMid = Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), rangeStart.getUTCDate())
    if (targetMid > startMid) {
      const k = Math.floor((targetMid - startMid) / 86400000 / interval)
      const jumped = new Date(startMid + k * interval * 86400000)
      cy = jumped.getUTCFullYear(); cm = jumped.getUTCMonth(); cd = jumped.getUTCDate()
      emitted = k // approximate COUNT accounting after fast-forward
    }
  }
  for (let i = 0; i < guard; i++) {
    const probe = zonedToUtc(cy, cm, cd, dt.h, dt.mi, dt.s, dt.tz)
    if (probe > rangeEnd) break
    if (!pushOcc(cy, cm, cd)) break
    if (freq === 'DAILY') { const n = new Date(Date.UTC(cy, cm, cd) + interval * 86400000); cy = n.getUTCFullYear(); cm = n.getUTCMonth(); cd = n.getUTCDate() }
    else if (freq === 'MONTHLY') { cm += interval; while (cm > 11) { cm -= 12; cy++ } }
    else if (freq === 'YEARLY') { cy += interval }
    else break
  }
  return results
}

function parseUntil(v: string): Date | null {
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  return new Date(Date.UTC(+y, +mo - 1, +d, h ? +h : 23, mi ? +mi : 59, s ? +s : 59))
}

// Wall-clock time in an IANA tz → correct UTC instant.
// Intl.DateTimeFormat is expensive to construct, so cache one per timezone —
// recurrence expansion calls this thousands of times.
const _dtfCache = new Map<string, Intl.DateTimeFormat>()
function dtfFor(tz: string): Intl.DateTimeFormat {
  let f = _dtfCache.get(tz)
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); _dtfCache.set(tz, f) }
  return f
}
function zonedToUtc(y: number, moIdx: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const utcGuess = Date.UTC(y, moIdx, d, h, mi, s)
  if (tz === 'UTC') return new Date(utcGuess)
  const map: Record<string, string> = {}
  for (const p of dtfFor(tz).formatToParts(new Date(utcGuess))) map[p.type] = p.value
  const asIfUtc = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second)
  return new Date(utcGuess - (asIfUtc - utcGuess))
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
    const parsed = parseDue(due)
    if (!parsed) continue
    if (parsed.date < start || parsed.date > end) continue
    out.push({
      id: `monday-${it.id}`, layer: 'monday', title: it.name,
      start: parsed.date.toISOString(), end: null, allDay: !parsed.hasTime,
      sourceUrl: `https://monday.com/boards/${board}/pulses/${it.id}`,
    })
  }
  return out
}

function parseDue(due: string | null | undefined): { date: Date; hasTime: boolean } | null {
  if (!due) return null
  const m = due.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const hasTime = h !== undefined && mi !== undefined
  return { date: new Date(+y, +mo - 1, +d, hasTime ? +h : 9, hasTime ? +mi : 0), hasTime }
}
