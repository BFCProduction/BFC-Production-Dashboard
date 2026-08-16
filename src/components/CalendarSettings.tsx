import { useEffect, useState } from 'react'
import { X, Trash2, Calendar, Plus } from 'lucide-react'
import { useAuth } from '../context/authState'
import { loadCrewCalendars, addMyCalendar, removeCalendar, type CrewCalendar } from '../lib/dashboardData'

interface Props {
  onClose: () => void
  onChanged: () => void   // a calendar was added/removed → refresh the calendar
}

export function CalendarSettings({ onClose, onChanged }: Props) {
  const { user } = useAuth()
  const [crew, setCrew] = useState<CrewCalendar[]>([])
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  function refresh() {
    loadCrewCalendars().then(setCrew).catch(e => setError(e.message))
  }
  useEffect(refresh, [])

  async function add() {
    if (!url.trim() || !user) return
    setBusy(true); setError(null)
    try {
      await addMyCalendar(user.pco_id, user.name, url, label || null)
      setUrl(''); setLabel(''); setAdding(false); refresh(); onChanged()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function remove(id: string) {
    setBusy(true); setError(null)
    try { await removeCalendar(id); refresh(); onChanged() }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Calendar size={16} /> Manage Calendars</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X size={16} /></button>
        </header>

        <div className="p-4 space-y-5">
          {/* Add a calendar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] uppercase tracking-wide font-semibold text-gray-400">Add a calendar</h3>
              <button onClick={() => setAdding(a => !a)} className="flex items-center gap-1 text-xs font-medium text-blue-600"><Plus size={13} /> New</button>
            </div>
            {adding && (
              <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Name (optional, e.g. Personal / Work)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Google Calendar secret iCal URL…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                <button onClick={add} disabled={busy || !url.trim()} className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2">
                  {busy ? 'Saving…' : 'Add calendar'}
                </button>
                <details className="text-[11px] text-gray-500">
                  <summary className="cursor-pointer hover:text-gray-700">Where do I get that URL?</summary>
                  <ol className="mt-1 ml-4 list-decimal space-y-0.5">
                    <li>Google Calendar → Settings → your calendar</li>
                    <li>Scroll to <b>Secret address in iCal format</b>, copy it</li>
                  </ol>
                  <p className="mt-1">The URL is never shown to anyone — only your events appear.</p>
                </details>
              </div>
            )}
          </div>

          {/* All shared calendars — delete any */}
          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-2">Shared calendars</h3>
            {crew.length === 0 && <p className="text-[11px] text-gray-400">No calendars shared yet.</p>}
            <div className="flex flex-col gap-1.5">
              {crew.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <span className="text-sm text-gray-800 truncate">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-2 align-middle" />
                    {c.personName}{c.label ? ` · ${c.label}` : ''}{c.pcoId === user?.pco_id ? ' (you)' : ''}
                  </span>
                  <button onClick={() => remove(c.id)} disabled={busy} className="flex items-center gap-1 text-xs text-red-600 hover:underline shrink-0"><Trash2 size={13} /> Delete</button>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
