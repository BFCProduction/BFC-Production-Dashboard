// ─────────────────────────────────────────────────────────────────────────────
// dashboard-tasks — monday Production Tasks (read + edit).
//
// POST {}                              → { tasks, options, people }
// POST { action:'updates', taskId }    → { updates }
// POST { action:'update', taskId, field, value } → { ok } (writes to monday)
//   field ∈ priority|status|category|person|due
// ─────────────────────────────────────────────────────────────────────────────
import { corsHeaders, json } from '../_shared/cors.ts'
import { requireStaff } from '../_shared/session.ts'

const GROUP_MATCHERS: { key: string; test: (title: string) => boolean }[] = [
  { key: 'inbox', test: (t) => t.toLowerCase().includes('inbox') },
  { key: 'next_actions', test: (t) => t.toLowerCase().includes('next action') },
]

const PRIORITY_COL = 'status_18'
const STATUS_COL = 'status'
const CATEGORY_COL = 'status_1'
const PERSON_COL = 'person'
const DATE_COL = 'date'
const FIELD_COL: Record<string, string> = {
  priority: PRIORITY_COL, status: STATUS_COL, category: CATEGORY_COL, person: PERSON_COL, due: DATE_COL,
}

// deno-lint-ignore no-explicit-any
async function monday(query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const token = Deno.env.get('MONDAY_API_TOKEN')!
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': '2024-10' },
    body: JSON.stringify({ query, variables }),
  })
  return res.json()
}

function boardId(): string {
  return Deno.env.get('MONDAY_PRODUCTION_BOARD_ID') ?? Deno.env.get('MONDAY_BOARD_ID')!
}

interface Cell { label: string; color: string }
interface Option { index: number; label: string; color: string }

function colorMap(settings_str: string): Record<string, string> {
  try {
    const s = JSON.parse(settings_str)
    const out: Record<string, string> = {}
    for (const k in (s.labels_colors ?? {})) out[k] = s.labels_colors[k].color
    return out
  } catch { return {} }
}
function statusOptions(settings_str: string): Option[] {
  try {
    const s = JSON.parse(settings_str)
    const labels = s.labels ?? {}, colors = s.labels_colors ?? {}, pos = s.labels_positions_v2 ?? {}
    return Object.keys(labels)
      .map(idx => ({ index: +idx, label: labels[idx], color: colors[idx]?.color ?? '#c4c4c4', pos: pos[idx] ?? +idx }))
      .filter(o => o.label)
      .sort((a, b) => a.pos - b.pos)
      .map(({ index, label, color }) => ({ index, label, color }))
  } catch { return [] }
}
// deno-lint-ignore no-explicit-any
function statusCell(cols: any[], id: string, map: Record<string, string>): Cell | null {
  const cv = cols.find((c) => c.id === id)
  if (!cv || cv.index === null || cv.index === undefined || !cv.label) return null
  return { label: cv.label, color: map[String(cv.index)] ?? '#c4c4c4' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const staff = await requireStaff(req)
  if (!staff) return json({ error: 'unauthorized' }, 401)

  const body = (await req.json().catch(() => ({}))) as { action?: string; taskId?: string; field?: string; value?: unknown }
  const board = boardId()

  // ── Lazy-load a task's updates ──────────────────────────────────────────────
  if (body.action === 'updates' && body.taskId) {
    const data = await monday(`query { items(ids:[${body.taskId}]) { updates(limit:25) { id body created_at creator { name photo_thumb_small } } } }`)
    // deno-lint-ignore no-explicit-any
    const updates = (data?.data?.items?.[0]?.updates ?? []).map((u: any) => ({
      id: u.id, authorName: u.creator?.name ?? 'Unknown', authorAvatarUrl: u.creator?.photo_thumb_small ?? null,
      createdAt: u.created_at, body: stripHtml(u.body ?? ''),
    }))
    return json({ updates })
  }

  // ── Write a column value back to monday ─────────────────────────────────────
  if (body.action === 'update' && body.taskId && body.field) {
    const col = FIELD_COL[body.field]
    if (!col) return json({ error: 'unknown field' }, 400)
    let res
    if (body.field === 'person') {
      const ids = Array.isArray(body.value) ? body.value : []
      const v = JSON.stringify({ personsAndTeams: ids.map((id) => ({ id: Number(id), kind: 'person' })) })
      res = await monday(`mutation($v: JSON!) { change_column_value(board_id: ${board}, item_id: ${body.taskId}, column_id: "${col}", value: $v) { id } }`, { v })
    } else {
      const v = body.value == null ? '' : String(body.value)
      res = await monday(`mutation($v: String) { change_simple_column_value(board_id: ${board}, item_id: ${body.taskId}, column_id: "${col}", value: $v) { id } }`, { v })
    }
    if (res?.errors) return json({ error: res.errors[0]?.message ?? 'monday update failed' }, 400)
    return json({ ok: true })
  }

  // ── Read board (+ options + assignable people) ──────────────────────────────
  const data = await monday(`query {
    boards(ids:[${board}]) {
      groups { id title color }
      columns(ids: ["${PRIORITY_COL}","${STATUS_COL}","${CATEGORY_COL}"]) { id settings_str }
      items_page(limit: 200) {
        items {
          id name group { id }
          column_values(ids: ["${PERSON_COL}","${PRIORITY_COL}","${STATUS_COL}","${CATEGORY_COL}","${DATE_COL}"]) {
            id text ... on StatusValue { index label } ... on DateValue { date } ... on PeopleValue { persons_and_teams { id kind } }
          }
        }
      }
    }
    users(limit: 300) { id name photo_thumb_small is_guest enabled }
  }`)

  const b = data?.data?.boards?.[0]
  const groupMap: Record<string, { title: string; color: string }> = {}
  // deno-lint-ignore no-explicit-any
  for (const g of (b?.groups ?? []) as any[]) groupMap[g.id] = { title: g.title, color: g.color }

  const maps: Record<string, Record<string, string>> = {}
  const options: Record<string, Option[]> = {}
  // deno-lint-ignore no-explicit-any
  for (const c of (b?.columns ?? []) as any[]) { maps[c.id] = colorMap(c.settings_str); options[c.id] = statusOptions(c.settings_str) }

  // deno-lint-ignore no-explicit-any
  const people = (data?.data?.users ?? [])
    .filter((u: any) => u.enabled !== false)
    .map((u: any) => ({ id: String(u.id), name: u.name, avatarUrl: u.photo_thumb_small ?? null, guest: !!u.is_guest }))
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))
  const peopleMap: Record<string, { name: string; avatarUrl: string | null }> = {}
  for (const p of people) peopleMap[p.id] = { name: p.name, avatarUrl: p.avatarUrl }

  const items = b?.items_page?.items ?? []
  const tasks = []
  for (const it of items) {
    const g = groupMap[it.group?.id]
    if (!g) continue
    const match = GROUP_MATCHERS.find((m) => m.test(g.title))
    if (!match) continue
    // deno-lint-ignore no-explicit-any
    const cols: any[] = it.column_values ?? []
    const personCol = cols.find((c) => c.id === PERSON_COL)
    // deno-lint-ignore no-explicit-any
    const assignees = ((personCol?.persons_and_teams ?? []) as any[])
      .filter((p) => p.kind === 'person')
      .map((p) => ({ id: String(p.id), name: peopleMap[String(p.id)]?.name ?? 'Unknown', avatarUrl: peopleMap[String(p.id)]?.avatarUrl ?? null }))
    const dueText = cols.find((c) => c.id === DATE_COL)?.text || null

    tasks.push({
      id: it.id, name: it.name, group: match.key, groupTitle: g.title, groupColor: g.color,
      priority: statusCell(cols, PRIORITY_COL, maps[PRIORITY_COL] ?? {}),
      statusField: statusCell(cols, STATUS_COL, maps[STATUS_COL] ?? {}),
      category: statusCell(cols, CATEGORY_COL, maps[CATEGORY_COL] ?? {}),
      dueDate: dueText, assignees,
      url: `https://monday.com/boards/${board}/pulses/${it.id}`,
    })
  }

  return json({
    tasks, people,
    options: { priority: options[PRIORITY_COL] ?? [], status: options[STATUS_COL] ?? [], category: options[CATEGORY_COL] ?? [] },
  })
})

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
}
