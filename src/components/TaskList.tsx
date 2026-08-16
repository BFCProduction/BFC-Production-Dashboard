import { useEffect, useState, Fragment } from 'react'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { useAuth } from '../context/authState'
import { loadTasks, loadTaskUpdates } from '../lib/dashboardData'
import { useIsMobile } from '../lib/useIsMobile'
import type { MondayTask, MondayUpdate, StatusCell } from '../types'

const GRID = 'minmax(190px,1.4fr) 100px 110px 130px 140px 110px'

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
function priorityRank(p: StatusCell | null): number {
  return p ? (PRIORITY_RANK[p.label.toLowerCase()] ?? 4) : 5
}
function parseDue(due: string | null): number | null {
  if (!due) return null
  const m = due.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  return new Date(+y, +mo - 1, +d, h ? +h : 9, mi ? +mi : 0).getTime()
}
function fmtDue(due: string | null): string {
  if (!due) return ''
  const t = parseDue(due); if (t === null) return due
  const d = new Date(t)
  const base = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return /[ T]\d{2}:\d{2}/.test(due) ? `${base}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : base
}
function sortTasks(list: MondayTask[]): MondayTask[] {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const bucket = (t: MondayTask) => {
    const m = parseDue(t.dueDate)
    if (m === null) return 2
    return m < todayStart.getTime() ? 0 : 1
  }
  return [...list].sort((a, b) => {
    const ba = bucket(a), bb = bucket(b)
    if (ba !== bb) return ba - bb
    const ma = parseDue(a.dueDate), mb = parseDue(b.dueDate)
    if (ma !== null && mb !== null && ma !== mb) return mb - ma
    return priorityRank(a.priority) - priorityRank(b.priority)
  })
}

function Pill({ cell }: { cell: StatusCell | null }) {
  if (!cell) return <span className="text-gray-300">—</span>
  return (
    <span className="inline-block max-w-full truncate rounded px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: cell.color }}>{cell.label}</span>
  )
}
function Avatar({ name, url = null, size = 22 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt={name} title={name} className="rounded-full object-cover ring-1 ring-white" style={{ width: size, height: size }} />
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('')
  return <div className="rounded-full bg-gray-200 text-gray-600 grid place-items-center text-[10px] font-semibold ring-1 ring-white" title={name} style={{ width: size, height: size }}>{initials}</div>
}

function useUpdates(task: MondayTask, open: boolean) {
  const { sessionToken } = useAuth()
  const [updates, setUpdates] = useState<MondayUpdate[] | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!open || updates !== null) return
    let live = true
    const run = async () => {
      setLoading(true)
      try { const u = await loadTaskUpdates(task.id, sessionToken); if (live) setUpdates(u) }
      catch { if (live) setUpdates([]) }
      finally { if (live) setLoading(false) }
    }
    void run()
    return () => { live = false }
  }, [open, updates, task.id, sessionToken])
  return { updates, loading }
}

function UpdatesPanel({ task, open }: { task: MondayTask; open: boolean }) {
  const { updates, loading } = useUpdates(task, open)
  return (
    <div className="space-y-2">
      {loading && <p className="text-[11px] text-gray-400">Loading updates…</p>}
      {updates && updates.length === 0 && !loading && <p className="text-[11px] text-gray-400">No updates.</p>}
      {updates?.map(u => (
        <div key={u.id} className="flex gap-2">
          <Avatar name={u.authorName} url={u.authorAvatarUrl} size={20} />
          <div className="min-w-0">
            <div className="text-[11px] text-gray-500"><span className="font-medium text-gray-700">{u.authorName}</span> · {new Date(u.createdAt).toLocaleDateString()}</div>
            <div className="text-xs text-gray-700 whitespace-pre-wrap break-words">{u.body}</div>
          </div>
        </div>
      ))}
      <a href={task.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
        Open in monday <ExternalLink size={11} />
      </a>
    </div>
  )
}

// Desktop table row.
function TaskRow({ task }: { task: MondayTask }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div onClick={() => setOpen(o => !o)} className="grid items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer" style={{ gridTemplateColumns: GRID, borderLeft: `3px solid ${task.groupColor ?? '#cbd5e1'}` }}>
        <div className="flex items-center gap-1.5 min-w-0">
          {open ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
          <span className="truncate text-sm text-gray-900">{task.name}</span>
        </div>
        <div className="flex -space-x-1.5">
          {task.assignees.length === 0 ? <span className="text-gray-300 text-xs">—</span> : task.assignees.map(a => <Avatar key={a.id} name={a.name} url={a.avatarUrl} />)}
        </div>
        <div className="min-w-0"><Pill cell={task.priority} /></div>
        <div className="min-w-0"><Pill cell={task.statusField} /></div>
        <div className="min-w-0"><Pill cell={task.category} /></div>
        <div className="text-[11px] text-gray-600 whitespace-nowrap">{fmtDue(task.dueDate) || <span className="text-gray-300">—</span>}</div>
      </div>
      {open && <div className="px-4 py-3 bg-gray-50 border-b border-gray-100"><UpdatesPanel task={task} open={open} /></div>}
    </>
  )
}

// Mobile card.
function TaskCard({ task }: { task: MondayTask }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden" style={{ borderLeft: `4px solid ${task.groupColor ?? '#cbd5e1'}` }}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left p-3">
        <div className="flex items-start gap-2">
          <span className="text-sm font-medium text-gray-900 flex-1">{task.name}</span>
          {task.assignees.length > 0 && (
            <div className="flex -space-x-1.5 shrink-0 pt-0.5">{task.assignees.slice(0, 3).map(a => <Avatar key={a.id} name={a.name} url={a.avatarUrl} size={20} />)}</div>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <Pill cell={task.priority} />
          <Pill cell={task.category} />
          {task.dueDate && <span className="text-[11px] text-gray-500">· {fmtDue(task.dueDate)}</span>}
        </div>
      </button>
      {open && <div className="px-3 pb-3 pt-1 bg-gray-50/60 border-t border-gray-100"><UpdatesPanel task={task} open={open} /></div>}
    </div>
  )
}

export function TaskList() {
  const { sessionToken } = useAuth()
  const isMobile = useIsMobile()
  const [tasks, setTasks] = useState<MondayTask[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    loadTasks(sessionToken)
      .then(t => { if (live) setTasks(t) })
      .catch(e => { if (live) setError(e.message) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [sessionToken])

  const groups: { key: string; label: string }[] = [
    { key: 'inbox', label: 'Inbox' },
    { key: 'next_actions', label: 'Next Action' },
  ]

  if (loading) return <section className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4 fade-in"><p className="text-sm text-gray-400">Loading tasks…</p></section>
  if (error) return <section className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4 fade-in"><p className="text-sm text-gray-400">Tasks aren't connected yet ({error}).</p></section>

  // ── Mobile: grouped cards ──────────────────────────────────────────────────
  if (isMobile) {
    return (
      <section className="fade-in space-y-4">
        {groups.map(g => {
          const groupTasks = sortTasks(tasks.filter(t => t.group === g.key))
          const color = groupTasks[0]?.groupColor ?? '#cbd5e1'
          return (
            <div key={g.key}>
              <h3 className="flex items-center gap-2 text-[11px] uppercase tracking-wide font-bold mb-2 px-1" style={{ color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />{g.label}
                <span className="text-gray-400 font-medium">{groupTasks.length}</span>
              </h3>
              <div className="flex flex-col gap-2">
                {groupTasks.length === 0 && <p className="text-[11px] text-gray-400 px-1">Nothing here.</p>}
                {groupTasks.map(t => <TaskCard key={t.id} task={t} />)}
              </div>
            </div>
          )
        })}
      </section>
    )
  }

  // ── Desktop: full-width table ──────────────────────────────────────────────
  return (
    <section className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden fade-in">
      <h2 className="text-sm font-bold text-gray-900 px-4 py-3 border-b border-gray-100">Production Tasks</h2>
      <div className="grid gap-2 px-3 py-2 text-[10px] uppercase tracking-wide font-semibold text-gray-400 border-b border-gray-200 bg-gray-50" style={{ gridTemplateColumns: GRID }}>
        <span className="pl-5">Item</span><span>Person</span><span>Priority</span><span>Status</span><span>Category</span><span>Due Date</span>
      </div>
      {groups.map(g => {
        const groupTasks = sortTasks(tasks.filter(t => t.group === g.key))
        const color = groupTasks[0]?.groupColor ?? '#cbd5e1'
        return (
          <Fragment key={g.key}>
            <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold" style={{ color, background: `${color}14` }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />{g.label}
              <span className="text-gray-400 font-medium">{groupTasks.length}</span>
            </div>
            {groupTasks.length === 0 ? <div className="px-4 py-2 text-[11px] text-gray-400">Nothing here.</div> : groupTasks.map(t => <TaskRow key={t.id} task={t} />)}
          </Fragment>
        )
      })}
    </section>
  )
}
