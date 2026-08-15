// ─────────────────────────────────────────────────────────────────────────────
// dashboard-tasks — monday.com Production Tasks (Inbox + Next Action).
//
// POST {}                            → { tasks: MondayTask[] }
// POST { action:'updates', taskId }  → { updates: MondayUpdate[] }
//
// Speed: the list query does NOT fetch per-item updates (that was the slow part);
// updates load lazily on expand. Color: monday group colors + the standard
// Priority palette are returned so the UI matches the board.
// ─────────────────────────────────────────────────────────────────────────────
import { corsHeaders, json } from '../_shared/cors.ts'
import { requireStaff } from '../_shared/session.ts'

const GROUP_MATCHERS: { key: string; test: (title: string) => boolean }[] = [
  { key: 'inbox', test: (t) => t.toLowerCase().includes('inbox') },
  { key: 'next_actions', test: (t) => t.toLowerCase().includes('next action') },
]

// monday's standard priority colors.
const PRIORITY_COLORS: Record<string, string> = {
  low: '#00c875', medium: '#fdab3d', high: '#e2445c', critical: '#bb3354',
}
const PRIORITY_SET = new Set(['low', 'medium', 'high', 'critical'])

// deno-lint-ignore no-explicit-any
async function monday(query: string): Promise<any> {
  const token = Deno.env.get('MONDAY_API_TOKEN')!
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': '2024-10' },
    body: JSON.stringify({ query }),
  })
  return res.json()
}

function boardId(): string {
  return Deno.env.get('MONDAY_PRODUCTION_BOARD_ID') ?? Deno.env.get('MONDAY_BOARD_ID')!
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

  const data = await monday(`query { boards(ids:[${board}]) { groups { id title color } items_page(limit: 200) { items { id name group { id } column_values { id text type ... on StatusValue { label } } } } } }`)

  const b = data?.data?.boards?.[0]
  // deno-lint-ignore no-explicit-any
  const groupMap: Record<string, { title: string; color: string }> = {}
  // deno-lint-ignore no-explicit-any
  for (const g of (b?.groups ?? []) as any[]) groupMap[g.id] = { title: g.title, color: g.color }

  const items = b?.items_page?.items ?? []
  const tasks = []
  for (const it of items) {
    const g = groupMap[it.group?.id]
    if (!g) continue
    const match = GROUP_MATCHERS.find((m) => m.test(g.title))
    if (!match) continue

    // deno-lint-ignore no-explicit-any
    const cols: any[] = it.column_values ?? []
    // Priority = the status column whose label is Low/Medium/High/Critical.
    const priorityCol = cols.find((c) => c.type === 'status' && c.label && PRIORITY_SET.has(String(c.label).toLowerCase()))
    const priority = priorityCol?.label ?? null
    const priorityColor = priority ? (PRIORITY_COLORS[String(priority).toLowerCase()] ?? null) : null
    const dueCol = cols.find((c) => c.type === 'date')
    const personCol = cols.find((c) => c.type === 'people')
    const assignees = (personCol?.text ? String(personCol.text).split(',') : [])
      .map((n: string) => n.trim()).filter(Boolean)
      .map((name: string) => ({ id: name, name, avatarUrl: null }))

    tasks.push({
      id: it.id,
      name: it.name,
      group: match.key,
      groupTitle: g.title,
      groupColor: g.color,
      status: priority,
      statusColor: priorityColor,
      dueDate: dueCol?.text || null,
      assignees,
      updatesCount: 0,
      updates: [],
      url: `https://monday.com/boards/${board}/pulses/${it.id}`,
    })
  }
  return json({ tasks })
})

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
}
