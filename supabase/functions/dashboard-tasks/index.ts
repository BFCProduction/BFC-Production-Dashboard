// ─────────────────────────────────────────────────────────────────────────────
// dashboard-tasks — monday.com Production Tasks (Inbox + Next Actions).
//
// POST {}                        → { tasks: MondayTask[] } (updates NOT included)
// POST { action:'updates', taskId } → { updates: MondayUpdate[] }
//
// Group mapping: monday group titles containing "inbox" → inbox, "next action"
// → next_actions. Adjust GROUP_MATCHERS if the board uses different titles.
// ─────────────────────────────────────────────────────────────────────────────
import { corsHeaders, json } from '../_shared/cors.ts'
import { requireStaff } from '../_shared/session.ts'

const GROUP_MATCHERS: { key: string; test: (title: string) => boolean }[] = [
  { key: 'inbox', test: t => t.toLowerCase().includes('inbox') },
  { key: 'next_actions', test: t => t.toLowerCase().includes('next action') },
]

async function monday(query: string): Promise<any> {
  const token = Deno.env.get('MONDAY_API_TOKEN')!
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': '2024-10' },
    body: JSON.stringify({ query }),
  })
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const staff = await requireStaff(req)
  if (!staff) return json({ error: 'unauthorized' }, 401)

  const body = await req.json().catch(() => ({})) as { action?: string; taskId?: string }
  const board = Deno.env.get('MONDAY_BOARD_ID')!

  if (body.action === 'updates' && body.taskId) {
    const data = await monday(`query { items(ids:[${body.taskId}]) { updates(limit:25) { id body created_at creator { name photo_thumb_small } } } }`)
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
      groups { id title }
      items_page(limit: 200) {
        items {
          id name group { id title } updates_count
          column_values { id text type ... on StatusValue { label } }
          ${''/* assignees resolved from people column below */}
        }
      }
    }
  }`)

  const board0 = data?.data?.boards?.[0]
  const items = board0?.items_page?.items ?? []
  const tasks = []
  for (const it of items) {
    const groupTitle: string = it.group?.title ?? ''
    const match = GROUP_MATCHERS.find(g => g.test(groupTitle))
    if (!match) continue // only Inbox + Next Actions
    const statusCol = it.column_values.find((c: any) => c.type === 'status')
    const dueCol = it.column_values.find((c: any) => c.type === 'date')
    tasks.push({
      id: it.id,
      name: it.name,
      group: match.key,
      status: statusCol?.label ?? statusCol?.text ?? null,
      statusColor: null, // color requires a settings_str parse; left for a later pass
      dueDate: dueCol?.text || null,
      assignees: [], // people column parse added when the board's people col id is known
      updatesCount: it.updates_count ?? 0,
      updates: [],
      url: `https://monday.com/boards/${board}/pulses/${it.id}`,
    })
  }
  return json({ tasks })
})

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
}
