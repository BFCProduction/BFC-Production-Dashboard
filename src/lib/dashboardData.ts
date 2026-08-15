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

/** Keep only the newest MAX_SLOTS non-expired items (rolling shelf). */
async function pruneToMaxSlots(): Promise<void> {
  const { data } = await supabase
    .from('clipboard_items')
    .select('id')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  const ids = (data ?? []).map(r => r.id)
  const stale = ids.slice(MAX_SLOTS)
  if (stale.length) await supabase.from('clipboard_items').delete().in('id', stale)
}
