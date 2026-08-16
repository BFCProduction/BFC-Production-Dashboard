import { useEffect, useState } from 'react'
import { X, Trash2, Calendar, Eye, EyeOff, Plus } from 'lucide-react'
import { useAuth } from '../context/authState'
import { loadCrewCalendars, addMyCalendar, removeCalendar, type CrewCalendar } from '../lib/dashboardData'

interface Props {
  onClose: () => void
  onChanged: () => void          // a calendar was added/removed → refetch events
  hidden: Set<string>            // calendar ids hidden in this viewer's calendar
  onToggleHidden: (id: string) => void
}

export function CalendarSettings({ onClose, onChanged, hidden, onToggleHidden }: Props) {
  const { user } = useAuth()
  const [crew, setCrew] = useState<CrewCalendar[]>([])
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const mine = crew.filter(c => c.pcoId === user?.pco_id)

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
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Calendar size={16} /> Crew Calendars</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X size={16} /></button>
        </header>

        <div className="p-4 space-y-5">
          {/* Show/hide any calendar in MY view */}
          <div>
            <h3 className="text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-2">Show on my calendar</h3>
            {crew.filter(c => c.active).length === 0 && <p className="text-[11px] text-gray-400">No calendars shared yet.</p>}
            <div className="flex flex-col">
              {crew.filter(c => c.active).map(c => {
                const visible = !hidden.has(c.id)
                return (
                  <button key={c.id} onClick={() => onToggleHidden(c.id)}
                    className="flex items-center gap-2 py-1.5 text-left">
                    {visible ? <Eye size={15} className="text-blue-600" /> : <EyeOff size={15} className="text-gray-300" />}
                    <span className={`w-2 h-2 rounded-full ${visible ? 'bg-blue-500' : 'bg-gray-300'}`} />
                    <span className={`text-sm flex-1 truncate ${visible ? 'text-gray-800' : 'text-gray-400'}`}>
                      {c.personName}{c.label ? ` · ${c.label}` : ''}{c.pcoId === user?.pco_id ? ' (you)' : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* My calendars — add/remove multiple */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] uppercase tracking-wide font-semibold text-gray-400">My calendars</h3>
              <button onClick={() => setAdding(a => !a)} className="flex items-center gap-1 text-xs font-medium text-blue-600"><Plus size={13} /> Add</button>
            </div>

            <div className="flex flex-col gap-1.5">
              {mine.length === 0 && !adding && <p className="text-[11px] text-gray-400">You haven't shared a calendar yet.</p>}
              {mine.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <span className="text-sm text-gray-800 truncate">{c.label || 'My calendar'}</span>
                  <button onClick={() => remove(c.id)} disabled={busy} className="flex items-center gap-1 text-xs text-red-600 hover:underline shrink-0"><Trash2 size={13} /> Remove</button>
                </div>
              ))}
            </div>

            {adding && (
              <div className="mt-2 space-y-2 rounded-lg border border-gray-200 p-3">
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

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
