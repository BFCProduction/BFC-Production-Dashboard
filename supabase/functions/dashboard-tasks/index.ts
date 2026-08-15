// ─────────────────────────────────────────────────────────────────────────────
// dashboard-tasks — monday.com Production Tasks (Inbox + Next Action).
//
// POST {}                            → { tasks: MondayTask[] }
// POST { action:'updates', taskId }  → { updates: MondayUpdate[] }
//
// Board is the "Production Tasks" board (MONDAY_PRODUCTION_BOARD_ID, falling
// back to MONDAY_BOARD_ID which currently points at the same board). Groups are
// matched by title: "Inbox" and "Next Action".
// ─────────────────────────────────────────────────────────────────────────────
import { corsHeaders, json } from '../_shared/cors.ts'
import { requireStaff } from '../_shared/session.ts'

const GROUP_MATCHERS: { key: string; test: (title: string) => boolean }[] = [
  { key: 'inbox', test: (t) => t.toLowerCase().includes('inbox') },
  { key: 'next_actions', test: (t) => t.toLowerCase().includes('next action') },
]

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

  const data = await monday(`query { boards(ids:[${board}]) { items_page(limit: 200) { items { id name group { id title } updates { id } column_values { id text type ... on StatusValue { label } ... on PeopleValue { persons_and_teams { id kind } } } } } } }`)

  const items = data?.data?.boards?.[0]?.items_page?.items ?? []
  const tasks = []
  for (const it of items) {
    const groupTitle: string = it.group?.title ?? ''
    const match = GROUP_MATCHERS.find((g) => g.test(groupTitle))
    if (!match) continue
    // deno-lint-ignore no-explicit-any
    const cols: any[] = it.column_values ?? []
    const statusCols = cols.filter((c) => c.type === 'status')
    const statusCol = statusCols.find((c) => c.label || c.text) ?? statusCols[0]
    const dueCol = cols.find((c) => c.type === 'date')
    const personCol = cols.find((c) => c.type === 'people')
    const assignees = (personCol?.text ? String(personCol.text).split(',') : [])
      .map((n: string) => n.trim())
      .filter(Boolean)
      .map((name: string) => ({ id: name, name, avatarUrl: null }))
    tasks.push({
      id: it.id,
      name: it.name,
      group: match.key,
      status: statusCol?.label ?? statusCol?.text ?? null,
      statusColor: null,
      dueDate: dueCol?.text || null,
      assignees,
      updatesCount: (it.updates ?? []).length,
      updates: [],
      url: `https://monday.com/boards/${board}/pulses/${it.id}`,
    })
  }
  return json({ tasks })
})

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
}
