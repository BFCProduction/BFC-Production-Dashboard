/* eslint-disable react-hooks/refs -- false positive: useMenu returns a ref object used only in event handlers/effects */
import { useEffect, useRef, useState, Fragment } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, UserPlus, Check, X } from 'lucide-react'
import { useAuth } from '../context/authState'
import { loadTasks, loadTaskUpdates, updateTaskField } from '../lib/dashboardData'
import { useIsMobile } from '../lib/useIsMobile'
import type { MondayTask, MondayUpdate, StatusCell, StatusOption, MondayAssignee, TaskOptions, TaskField } from '../types'

const GRID = 'minmax(190px,1.4fr) 110px 120px 130px 150px 120px'

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
function priorityRank(p: StatusCell | null): number { return p ? (PRIORITY_RANK[p.label.toLowerCase()] ?? 4) : 5 }
function parseDue(due: string | null): number | null {
  if (!due) return null
  const m = due.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  return new Date(+y, +mo - 1, +d, h ? +h : 9, mi ? +mi : 0).getTime()
}
function dueISO(due: string | null): string { const m = due?.match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : '' }
function fmtDue(due: string | null): string {
  if (!due) return ''
  const t = parseDue(due); if (t === null) return due
  const d = new Date(t)
  const base = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return /[ T]\d{2}:\d{2}/.test(due) ? `${base}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : base
}
// Chronological: earliest due date first (so overdue is at the top), no-date
// last; priority breaks ties on the same day.
function sortTasks(list: MondayTask[]): MondayTask[] {
  return [...list].sort((a, b) => {
    const ma = parseDue(a.dueDate), mb = parseDue(b.dueDate)
    if (ma === null && mb === null) return priorityRank(a.priority) - priorityRank(b.priority)
    if (ma === null) return 1
    if (mb === null) return -1
    if (ma !== mb) return ma - mb
    return priorityRank(a.priority) - priorityRank(b.priority)
  })
}

function Avatar({ name, url = null, size = 22 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt={name} title={name} className="rounded-full object-cover ring-1 ring-white" style={{ width: size, height: size }} />
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('')
  return <div className="rounded-full bg-gray-200 text-gray-600 grid place-items-center text-[10px] font-semibold ring-1 ring-white" title={name} style={{ width: size, height: size }}>{initials}</div>
}

// ── Anchored menu (fixed-position popover with click-away) ─────────────────────
function useMenu() {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!open) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      let left = r.left, top = r.bottom + 4
      if (left + 230 > window.innerWidth) left = window.innerWidth - 238
      if (top + 260 > window.innerHeight) top = Math.max(8, r.top - 264)
      setPos({ left: Math.max(8, left), top })
    }
    setOpen(o => !o)
  }
  useEffect(() => {
    if (!open) return
    const on = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', on)
    return () => document.removeEventListener('mousedown', on)
  }, [open])
  return { ref, open, setOpen, pos, toggle }
}

function MenuCard({ pos, children }: { pos: { left: number; top: number }; children: React.ReactNode }) {
  return (
    <div className="fixed z-50 min-w-[180px] max-h-64 overflow-y-auto rounded-xl bg-white border border-gray-200 shadow-xl py-1"
      style={{ left: pos.left, top: pos.top }} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      {children}
    </div>
  )
}

// ── Editable cells ────────────────────────────────────────────────────────────
function StatusEditor({ value, options, onChange }: { value: StatusCell | null; options: StatusOption[]; onChange: (label: string | null) => void }) {
  const m = useMenu()
  return (
    <>
      <button ref={m.ref} onClick={m.toggle} className="text-left max-w-full">
        {value
          ? <span className="inline-block max-w-full truncate rounded px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: value.color }}>{value.label}</span>
          : <span className="text-gray-300 hover:text-gray-400 text-sm">＋</span>}
      </button>
      {m.open && m.pos && (
        <MenuCard pos={m.pos}>
          {options.map(o => (
            <button key={o.index} onClick={() => { onChange(o.label); m.setOpen(false) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: o.color }} />{o.label}
              {value?.label === o.label && <Check size={13} className="ml-auto text-blue-600" />}
            </button>
          ))}
          {value && <button onClick={() => { onChange(null); m.setOpen(false) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 border-t border-gray-100"><X size={13} /> Clear</button>}
        </MenuCard>
      )}
    </>
  )
}

function PersonEditor({ assignees, people, onChange }: { assignees: MondayAssignee[]; people: MondayAssignee[]; onChange: (ids: string[]) => void }) {
  const m = useMenu()
  const selected = new Set(assignees.map(a => a.id))
  function toggle(id: string) { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); onChange([...n]) }
  return (
    <>
      <button ref={m.ref} onClick={m.toggle} className="flex -space-x-1.5 items-center">
        {assignees.length === 0
          ? <span className="text-gray-300 hover:text-gray-400"><UserPlus size={15} /></span>
          : assignees.map(a => <Avatar key={a.id} name={a.name} url={a.avatarUrl} />)}
      </button>
      {m.open && m.pos && (
        <MenuCard pos={m.pos}>
          {people.map(p => (
            <button key={p.id} onClick={() => toggle(p.id)} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
              <Avatar name={p.name} url={p.avatarUrl} size={20} />
              <span className="truncate">{p.name}</span>
              {p.guest && <span className="text-[9px] uppercase tracking-wide bg-amber-100 text-amber-700 rounded px-1 py-0.5 shrink-0">guest</span>}
              {selected.has(p.id) && <Check size={13} className="ml-auto text-blue-600" />}
            </button>
          ))}
        </MenuCard>
      )}
    </>
  )
}

function DateEditor({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const m = useMenu()
  return (
    <>
      <button ref={m.ref} onClick={m.toggle} className="text-[11px] text-gray-600 whitespace-nowrap">
        {fmtDue(value) || <span className="text-gray-300 hover:text-gray-400">＋</span>}
      </button>
      {m.open && m.pos && (
        <MenuCard pos={m.pos}>
          <div className="p-2">
            <input type="date" value={dueISO(value)} onChange={e => { onChange(e.target.value || null); m.setOpen(false) }}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500" />
            {value && <button onClick={() => { onChange(null); m.setOpen(false) }} className="mt-1 w-full flex items-center gap-1 px-1 py-1 text-xs text-gray-500 hover:text-gray-700"><X size={12} /> Clear date</button>}
          </div>
        </MenuCard>
      )}
    </>
  )
}

function UpdatesPanel({ task }: { task: MondayTask }) {
  const { sessionToken } = useAuth()
  const [updates, setUpdates] = useState<MondayUpdate[] | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let live = true
    const run = async () => {
      setLoading(true)
      try { const u = await loadTaskUpdates(task.id, sessionToken); if (live) setUpdates(u) }
      catch { if (live) setUpdates([]) } finally { if (live) setLoading(false) }
    }
    void run()
    return () => { live = false }
  }, [task.id, sessionToken])
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

interface RowProps { task: MondayTask; options: TaskOptions; people: MondayAssignee[]; onEdit: (field: TaskField, value: unknown) => void }

function TaskRow({ task, options, people, onEdit }: RowProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="grid items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50" style={{ gridTemplateColumns: GRID, borderLeft: `3px solid ${task.groupColor ?? '#cbd5e1'}` }}>
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 min-w-0 text-left">
          {open ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
          <span className="truncate text-sm text-gray-900">{task.name}</span>
        </button>
        <div><PersonEditor assignees={task.assignees} people={people} onChange={ids => onEdit('person', ids)} /></div>
        <div className="min-w-0"><StatusEditor value={task.priority} options={options.priority} onChange={l => onEdit('priority', l ?? '')} /></div>
        <div className="min-w-0"><StatusEditor value={task.statusField} options={options.status} onChange={l => onEdit('status', l ?? '')} /></div>
        <div className="min-w-0"><StatusEditor value={task.category} options={options.category} onChange={l => onEdit('category', l ?? '')} /></div>
        <div><DateEditor value={task.dueDate} onChange={v => onEdit('due', v ?? '')} /></div>
      </div>
      {open && <div className="px-4 py-3 bg-gray-50 border-b border-gray-100"><UpdatesPanel task={task} /></div>}
    </>
  )
}

function TaskCard({ task, options, people, onEdit }: RowProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden" style={{ borderLeft: `4px solid ${task.groupColor ?? '#cbd5e1'}` }}>
      <div className="p-3">
        <div className="flex items-start gap-2">
          <button onClick={() => setOpen(o => !o)} className="text-sm font-medium text-gray-900 flex-1 text-left">{task.name}</button>
          <PersonEditor assignees={task.assignees} people={people} onChange={ids => onEdit('person', ids)} />
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <StatusEditor value={task.priority} options={options.priority} onChange={l => onEdit('priority', l ?? '')} />
          <StatusEditor value={task.statusField} options={options.status} onChange={l => onEdit('status', l ?? '')} />
          <StatusEditor value={task.category} options={options.category} onChange={l => onEdit('category', l ?? '')} />
          <DateEditor value={task.dueDate} onChange={v => onEdit('due', v ?? '')} />
        </div>
      </div>
      {open && <div className="px-3 pb-3 pt-1 bg-gray-50/60 border-t border-gray-100"><UpdatesPanel task={task} /></div>}
    </div>
  )
}

export function TaskList() {
  const { sessionToken } = useAuth()
  const isMobile = useIsMobile()
  const [tasks, setTasks] = useState<MondayTask[]>([])
  const [people, setPeople] = useState<MondayAssignee[]>([])
  const [options, setOptions] = useState<TaskOptions>({ priority: [], status: [], category: [] })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    loadTasks(sessionToken)
      .then(p => { if (live) { setTasks(p.tasks); setPeople(p.people); setOptions(p.options) } })
      .catch(e => { if (live) setError(e.message) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [sessionToken])

  // Optimistic edit → write to monday; revert on failure.
  function makeEdit(task: MondayTask) {
    return async (field: TaskField, value: unknown) => {
      const before = tasks
      const patch: Partial<MondayTask> = {}
      if (field === 'due') patch.dueDate = (value as string) || null
      else if (field === 'person') {
        const ids = value as string[]
        patch.assignees = ids.map(id => people.find(p => p.id === id) ?? { id, name: 'Unknown', avatarUrl: null })
      } else {
        const prop = ({ priority: 'priority', status: 'statusField', category: 'category' } as const)[field as 'priority' | 'status' | 'category']
        const opt = options[field as 'priority' | 'status' | 'category'].find(o => o.label === value)
        patch[prop] = opt ? { label: opt.label, color: opt.color } : null
      }
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...patch } : t))
      try { await updateTaskField(task.id, field, value, sessionToken) }
      catch (e) { setTasks(before); setError(`Couldn't save: ${(e as Error).message}`) }
    }
  }

  const groups = [{ key: 'inbox', label: 'Inbox' }, { key: 'next_actions', label: 'Next Action' }]

  if (loading) return <section className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4 fade-in"><p className="text-sm text-gray-400">Loading tasks…</p></section>
  if (error && tasks.length === 0) return <section className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4 fade-in"><p className="text-sm text-gray-400">Tasks aren't connected yet ({error}).</p></section>

  if (isMobile) {
    return (
      <section className="fade-in space-y-4">
        {error && <p className="text-xs text-red-600 px-1">{error}</p>}
        {groups.map(g => {
          const gt = sortTasks(tasks.filter(t => t.group === g.key))
          const color = gt[0]?.groupColor ?? '#cbd5e1'
          return (
            <div key={g.key}>
              <h3 className="flex items-center gap-2 text-[11px] uppercase tracking-wide font-bold mb-2 px-1" style={{ color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />{g.label}<span className="text-gray-400 font-medium">{gt.length}</span>
              </h3>
              <div className="flex flex-col gap-2">
                {gt.length === 0 && <p className="text-[11px] text-gray-400 px-1">Nothing here.</p>}
                {gt.map(t => <TaskCard key={t.id} task={t} options={options} people={people} onEdit={makeEdit(t)} />)}
              </div>
            </div>
          )
        })}
      </section>
    )
  }

  return (
    <section className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden fade-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">Production Tasks</h2>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
      <div className="grid gap-2 px-3 py-2 text-[10px] uppercase tracking-wide font-semibold text-gray-400 border-b border-gray-200 bg-gray-50" style={{ gridTemplateColumns: GRID }}>
        <span className="pl-5">Item</span><span>Person</span><span>Priority</span><span>Status</span><span>Category</span><span>Due Date</span>
      </div>
      {groups.map(g => {
        const gt = sortTasks(tasks.filter(t => t.group === g.key))
        const color = gt[0]?.groupColor ?? '#cbd5e1'
        return (
          <Fragment key={g.key}>
            <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold" style={{ color, background: `${color}14` }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />{g.label}<span className="text-gray-400 font-medium">{gt.length}</span>
            </div>
            {gt.length === 0 ? <div className="px-4 py-2 text-[11px] text-gray-400">Nothing here.</div> : gt.map(t => <TaskRow key={t.id} task={t} options={options} people={people} onEdit={makeEdit(t)} />)}
          </Fragment>
        )
      })}
    </section>
  )
}
