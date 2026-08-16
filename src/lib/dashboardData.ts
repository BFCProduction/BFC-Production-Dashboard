import { supabase, callFunction } from './supabase'
import type {
  CalendarEvent, MondayTask, MondayUpdate, ClipboardItem, PersonHours,
} from '../types'
import { getWeekRange, isoDate } from './week'

// ─────────────────────────────────────────────────────────────────────────────
// All live external reads go through Supabase Edge Functions on the shared
// project (credentials stay server-side — never in this bundle). The functions
// themselves live in supabase/functions/ and are deployed to the shared project.
// Until they are deployed, these calls throw and the UI shows an honest empty
// state rather than fake data.
// ─────────────────────────────────────────────────────────────────────────────

export interface WeekPayload {
  events: CalendarEvent[]
  unknownPcoTimeNames: string[] // surfaced so Alan can file them into keep/skip
}

/** Merged calendar for a given week offset (0 = this week). */
export async function loadWeek(offsetWeeks: number, sessionToken: string | null): Promise<WeekPayload> {
  const { start, end } = getWeekRange(new Date(), offsetWeeks)
  return callFunction<WeekPayload>('dashboard-calendar', {
    start: isoDate(start),
    end: isoDate(end),
  }, sessionToken)
}

/** monday tasks in Inbox + Next Actions (updates loaded lazily on expand). */
export async function loadTasks(sessionToken: string | null): Promise<MondayTask[]> {
  const { tasks } = await callFunction<{ tasks: MondayTask[] }>('dashboard-tasks', {}, sessionToken)
  return tasks
}

/** Lazy-load a single task's monday updates when the card is expanded. */
export async function loadTaskUpdates(taskId: string, sessionToken: string | null): Promise<MondayUpdate[]> {
  const { updates } = await callFunction<{ updates: MondayUpdate[] }>(
    'dashboard-tasks', { action: 'updates', taskId }, sessionToken,
  )
  return updates
}

/** Per-person hours across PCO + monday for the visible week. */
export async function loadHours(offsetWeeks: number, sessionToken: string | null): Promise<PersonHours[]> {
  const { start, end } = getWeekRange(new Date(), offsetWeeks)
  const { people } = await callFunction<{ people: PersonHours[] }>(
    'dashboard-hours', { start: isoDate(start), end: isoDate(end) }, sessionToken,
  )
  return people
}

// ── Personal crew calendars (opt-in) ─────────────────────────────────────────
// The secret iCal URL is write-only from the client's perspective — it's stored
// but never read back (the public view omits it; the edge function reads it
// server-side). So we only ever load names + active state here.

export interface CrewCalendar {
  pcoId: string
  personName: string
  active: boolean
}

export async function loadCrewCalendars(): Promise<CrewCalendar[]> {
  const { data, error } = await supabase
    .from('dashboard_calendar_links_public')
    .select('pco_id, person_name, active')
    .order('person_name')
  if (error) throw error
  return (data ?? []).map(r => ({ pcoId: r.pco_id, personName: r.person_name, active: r.active }))
}

export async function upsertMyCalendar(pcoId: string, personName: string, icalUrl: string): Promise<void> {
  // delete-then-insert rather than upsert: ON CONFLICT DO UPDATE needs privileges
  // that conflict with keeping ical_url unreadable, but plain insert/delete are fine.
  await supabase.from('dashboard_calendar_links').delete().eq('pco_id', pcoId)
  const { error } = await supabase
    .from('dashboard_calendar_links')
    .insert({ pco_id: pcoId, person_name: personName, ical_url: icalUrl.trim(), active: true })
  if (error) throw error
}

export async function setMyCalendarActive(pcoId: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('dashboard_calendar_links').update({ active }).eq('pco_id', pcoId)
  if (error) throw error
}

export async function removeMyCalendar(pcoId: string): Promise<void> {
  const { error } = await supabase.from('dashboard_calendar_links').delete().eq('pco_id', pcoId)
  if (error) throw error
}

// ── Community clipboard (Supabase table + storage; no external creds) ─────────

export async function loadClipboard(): Promise<ClipboardItem[]> {
  const { data, error } = await supabase
    .from('clipboard_items')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw error
  return (data ?? []).map(rowToClipboard)
}

interface ClipboardRow {
  id: string
  kind: 'file' | 'text' | 'link'
  label: string
  body: string | null
  file_url: string | null
  file_name: string | null
  posted_by_name: string
  posted_by_avatar_url: string | null
  created_at: string
  expires_at: string
}

function rowToClipboard(r: ClipboardRow): ClipboardItem {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    body: r.body,
    fileUrl: r.file_url,
    fileName: r.file_name,
    postedByName: r.posted_by_name,
    postedByAvatarUrl: r.posted_by_avatar_url,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }
}

const EXPIRY_HOURS = 48
const MAX_SLOTS = 5

export async function postClipboardText(
  label: string, body: string, kind: 'text' | 'link',
  postedByName: string, postedByAvatarUrl: string | null,
): Promise<void> {
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 3600_000).toISOString()
  const { error } = await supabase.from('clipboard_items').insert({
    kind, label, body,
    posted_by_name: postedByName,
    posted_by_avatar_url: postedByAvatarUrl,
    expires_at: expiresAt,
  })
  if (error) throw error
  await pruneToMaxSlots()
}

export async function postClipboardFile(
  file: File, postedByName: string, postedByAvatarUrl: string | null,
): Promise<void> {
  const path = `${crypto.randomUUID()}-${file.name}`
  const up = await supabase.storage.from('clipboard-files').upload(path, file, { upsert: false })
  if (up.error) throw up.error
  const { data: pub } = supabase.storage.from('clipboard-files').getPublicUrl(path)
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 3600_000).toISOString()
  const { error } = await supabase.from('clipboard_items').insert({
    kind: 'file', label: file.name, body: null,
    file_url: pub.publicUrl, file_name: file.name,
    posted_by_name: postedByName, posted_by_avatar_url: postedByAvatarUrl,
    expires_at: expiresAt,
  })
  if (error) throw error
  await pruneToMaxSlots()
}

/** Keep only the newest MAX_SLOTS non-expired items (rolling shelf). */
async function pruneToMaxSlots(): Promise<void> {
  const { data } = await supabase
    .from('clipboard_items')
    .select('id, kind, file_url')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  const rows = data ?? []
  const stale = rows.slice(MAX_SLOTS)
  if (!stale.length) return
  // Remove any file objects for rolled-off items (Storage API — the DB can't).
  const paths = stale
    .filter(r => r.kind === 'file' && r.file_url)
    .map(r => (r.file_url as string).split('/clipboard-files/')[1])
    .filter(Boolean)
  if (paths.length) await supabase.storage.from('clipboard-files').remove(paths)
  await supabase.from('clipboard_items').delete().in('id', stale.map(r => r.id))
}
