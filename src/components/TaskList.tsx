import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, MessageSquare } from 'lucide-react'
import { useAuth } from '../context/authState'
import { loadTasks, loadTaskUpdates } from '../lib/dashboardData'
import type { MondayTask, MondayUpdate } from '../types'

function Avatar({ url, name, size = 22 }: { url: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} className="rounded-full object-cover ring-1 ring-gray-200" style={{ width: size, height: size }} />
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('')
  return (
    <div className="rounded-full bg-gray-200 text-gray-600 grid place-items-center text-[10px] font-semibold ring-1 ring-gray-200" style={{ width: size, height: size }}>
      {initials}
    </div>
  )
}

function TaskCard({ task }: { task: MondayTask }) {
  const { sessionToken } = useAuth()
  const [open, setOpen] = useState(false)
  const [updates, setUpdates] = useState<MondayUpdate[] | null>(null)
  const [loadingUpdates, setLoadingUpdates] = useState(false)

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && updates === null && task.updatesCount > 0) {
      setLoadingUpdates(true)
      loadTaskUpdates(task.id, sessionToken)
        .then(setUpdates).catch(() => setUpdates([])).finally(() => setLoadingUpdates(false))
    }
  }

  return (
    <div className="rounded-xl bg-white border border-gray-200 shadow-sm">
      <button onClick={toggle} className="w-full flex items-center gap-2 p-3 text-left">
        {open ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900">{task.name}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
            {task.status && (
              <span className="rounded px-1.5 py-0.5 font-medium bg-gray-100 text-gray-700">{task.status}</span>
            )}
            {task.dueDate && <span>Due {task.dueDate}</span>}
            {task.updatesCount > 0 && (
              <span className="flex items-center gap-0.5"><MessageSquare size={11} />{task.updatesCount}</span>
            )}
          </div>
        </div>
        <div className="flex -space-x-1.5 shrink-0">
          {task.assignees.map(a => <Avatar key={a.id} url={a.avatarUrl} name={a.name} />)}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-3 py-2 space-y-2 bg-gray-50/50">
          {task.updatesCount === 0 && <p className="text-[11px] text-gray-400">No updates.</p>}
          {loadingUpdates && <p className="text-[11px] text-gray-400">Loading updates…</p>}
          {updates?.map(u => (
            <div key={u.id} className="flex gap-2">
              <Avatar url={u.authorAvatarUrl} name={u.authorName} size={20} />
              <div className="min-w-0">
                <div className="text-[11px] text-gray-500">
                  <span className="font-medium text-gray-700">{u.authorName}</span> · {new Date(u.createdAt).toLocaleDateString()}
                </div>
                <div className="text-xs text-gray-700 whitespace-pre-wrap break-words">{u.body}</div>
              </div>
            </div>
          ))}
          <a href={task.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
            Open in monday <ExternalLink size={11} />
          </a>
        </div>
      )}
    </div>
  )
}

export function TaskList() {
  const { sessionToken } = useAuth()
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
    { key: 'next_actions', label: 'Next Actions' },
  ]

  return (
    <section className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4 fade-in">
      <h2 className="text-sm font-bold text-gray-900 mb-3">Production Tasks</h2>
      {loading && <p className="text-sm text-gray-400">Loading tasks…</p>}
      {error && <p className="text-sm text-gray-400">Tasks aren't connected yet ({error}).</p>}
      {!loading && !error && groups.map(g => {
        const groupTasks = tasks.filter(t => t.group === g.key)
        return (
          <div key={g.key} className="mb-4 last:mb-0">
            <h3 className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-2">{g.label}</h3>
            <div className="flex flex-col gap-2">
              {groupTasks.length === 0 && <p className="text-[11px] text-gray-400">Nothing here.</p>}
              {groupTasks.map(t => <TaskCard key={t.id} task={t} />)}
            </div>
          </div>
        )
      })}
    </section>
  )
}
