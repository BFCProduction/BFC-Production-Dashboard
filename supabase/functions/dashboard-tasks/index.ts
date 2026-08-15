// ─────────────────────────────────────────────────────────────────────────────
// dashboard-tasks — monday.com Production Tasks (Inbox + Next Action).
//
// Returns tasks shaped to mirror the monday board columns:
//   Item · Person · Priority · Status · Category · Due Date
// Status/Priority/Category colors come from each column's real monday settings.
// Updates load lazily via { action:'updates', taskId }.
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

// index → hex color, parsed from a status column's settings_str.
function colorMap(settings_str: string): Record<string, string> {
  try {
    const s = JSON.parse(settings_str)
    const out: Record<string, string> = {}
    for (const k in (s.labels_colors ?? {})) out[k] = s.labels_colors[k].color
    return out
  } catch { return {} }
}

interface Cell { label: string; color: string }
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

  const body = (await req.json().catch(() => ({}))) as { action?: string; taskId?: string }
  const board = boardId()

  if (body.action === 'updates' && body.taskId) {
    const data = await monday(`query { items(ids:[${body.taskId}]) { updates(limit:25) { id body created_at creator { name photo_thumb_small } } } }`)
    // deno-lint-ignore no-explicit-any
    const updates = (data?.data?.items?.[0]?.updates ?? []).map((u: any) => ({
      id: u.id,
      authorName: u.creator?.name ?? 'Unknown',
      authorAvatarUrl: u.creator?.photo_thumb_small ?? null,
      createdAt: u.created_at,
      body: stripHtml(u.body ?? ''),
    }))
    return json({ updates })
  }

  const data = await monday(`query {
    boards(ids:[${board}]) {
      groups { id title color }
      columns(ids: ["${PRIORITY_COL}","${STATUS_COL}","${CATEGORY_COL}"]) { id settings_str }
      items_page(limit: 200) {
        items {
          id name group { id }
          column_values(ids: ["${PERSON_COL}","${PRIORITY_COL}","${STATUS_COL}","${CATEGORY_COL}","${DATE_COL}"]) {
            id text ... on StatusValue { index label } ... on DateValue { date }
          }
        }
      }
    }
  }`)

  const b = data?.data?.boards?.[0]
  const groupMap: Record<string, { title: string; color: string }> = {}
  // deno-lint-ignore no-explicit-any
  for (const g of (b?.groups ?? []) as any[]) groupMap[g.id] = { title: g.title, color: g.color }

  const maps: Record<string, Record<string, string>> = {}
  // deno-lint-ignore no-explicit-any
  for (const c of (b?.columns ?? []) as any[]) maps[c.id] = colorMap(c.settings_str)

  const items = b?.items_page?.items ?? []
  const tasks = []
  for (const it of items) {
    const g = groupMap[it.group?.id]
    if (!g) continue
    const match = GROUP_MATCHERS.find((m) => m.test(g.title))
    if (!match) continue

    // deno-lint-ignore no-explicit-any
    const cols: any[] = it.column_values ?? []
    const personText = cols.find((c) => c.id === PERSON_COL)?.text ?? ''
    const assignees = (personText ? String(personText).split(',') : [])
      .map((n: string) => n.trim()).filter(Boolean)
      .map((name: string) => ({ id: name, name, avatarUrl: null }))
    const dueText = cols.find((c) => c.id === DATE_COL)?.text || null

    tasks.push({
      id: it.id,
      name: it.name,
      group: match.key,
      groupTitle: g.title,
      groupColor: g.color,
      priority: statusCell(cols, PRIORITY_COL, maps[PRIORITY_COL] ?? {}),
      statusField: statusCell(cols, STATUS_COL, maps[STATUS_COL] ?? {}),
      category: statusCell(cols, CATEGORY_COL, maps[CATEGORY_COL] ?? {}),
      dueDate: dueText,
      assignees,
      url: `https://monday.com/boards/${board}/pulses/${it.id}`,
    })
  }
  return json({ tasks })
})

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
}
