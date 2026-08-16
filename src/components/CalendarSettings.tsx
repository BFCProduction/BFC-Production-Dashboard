import { useEffect, useState } from 'react'
import { X, Check, Trash2, Calendar } from 'lucide-react'
import { useAuth } from '../context/authState'
import { loadCrewCalendars, upsertMyCalendar, removeMyCalendar, type CrewCalendar } from '../lib/dashboardData'

export function CalendarSettings({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth()
  const [crew, setCrew] = useState<CrewCalendar[]>([])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mine = crew.find(c => c.pcoId === user?.pco_id)

  function refresh() {
    loadCrewCalendars().then(setCrew).catch(e => setError(e.message))
  }
  useEffect(refresh, [])

  async function save() {
    if (!url.trim() || !user) return
    setBusy(true); setError(null)
    try {
      await upsertMyCalendar(user.pco_id, user.name, url)
      setUrl(''); refresh(); onChanged()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function remove() {
    if (!user) return
    setBusy(true); setError(null)
    try {
      await removeMyCalendar(user.pco_id); refresh(); onChanged()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Calendar size={16} /> Crew Calendars</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X size={16} /></button>
        </header>

        <div className="p-4 space-y-5">
          {/* My calendar */}
          <div>
            <h3 className="text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-2">My calendar</h3>
            {mine ? (
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-emerald-800"><Check size={15} /> Shared with the team</span>
                <button onClick={remove} disabled={busy} className="flex items-center gap-1 text-xs text-red-600 hover:underline"><Trash2 size={13} /> Remove</button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="Paste your Google Calendar secret iCal URL…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <button onClick={save} disabled={busy || !url.trim()} className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2">
                  {busy ? 'Saving…' : 'Share my calendar'}
                </button>
                <details className="text-[11px] text-gray-500">
                  <summary className="cursor-pointer hover:text-gray-700">How do I get that URL?</summary>
                  <ol className="mt-1 ml-4 list-decimal space-y-0.5">
                    <li>Google Calendar → Settings (gear) → Settings</li>
                    <li>Pick your calendar in the left sidebar</li>
                    <li>Scroll to <b>Secret address in iCal format</b></li>
                    <li>Copy that URL and paste it above</li>
                  </ol>
                  <p className="mt-1">Only the dashboard reads it — it's never shown to other people, just your events appear on the shared calendar.</p>
                </details>
              </div>
            )}
          </div>

          {/* Team */}
          <div>
            <h3 className="text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-2">Shared by the team</h3>
            {crew.filter(c => c.active).length === 0 && <p className="text-[11px] text-gray-400">No one has shared a calendar yet.</p>}
            <div className="flex flex-col gap-1">
              {crew.filter(c => c.active).map(c => (
                <div key={c.pcoId} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  {c.personName}{c.pcoId === user?.pco_id ? ' (you)' : ''}
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
