import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/authState'
import { loadWeek, type WeekPayload } from '../lib/dashboardData'
import { getWeekRange, isoDate, sameDay, fmtDayLabel, fmtTime } from '../lib/week'
import type { CalendarEvent } from '../types'

const LAYER_STYLES: Record<CalendarEvent['layer'], string> = {
  personal: 'border-l-blue-500 bg-blue-500/10',
  pco: 'border-l-green-500 bg-green-500/10',
  monday: 'border-l-orange-500 bg-orange-500/10',
}

export function WeekCalendar() {
  const { sessionToken } = useAuth()
  const [offset, setOffset] = useState(0)
  const [payload, setPayload] = useState<WeekPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    const run = async () => {
      setLoading(true); setError(null)
      try {
        const p = await loadWeek(offset, sessionToken)
        if (live) setPayload(p)
      } catch (e) {
        if (live) setError((e as Error).message)
      } finally {
        if (live) setLoading(false)
      }
    }
    void run()
    return () => { live = false }
  }, [offset, sessionToken])

  const { days } = getWeekRange(new Date(), offset)
  const eventsFor = (d: Date) =>
    (payload?.events ?? [])
      .filter(e => sameDay(new Date(e.start), d))
      .sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1))

  return (
    <section className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">This Week</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(o => o - 1)} className="p-1.5 rounded-lg hover:bg-white/10"><ChevronLeft size={18} /></button>
          <button onClick={() => setOffset(0)} className="text-xs px-2 py-1 rounded-lg hover:bg-white/10">{offset === 0 ? 'Now' : 'Today'}</button>
          <button onClick={() => setOffset(o => o + 1)} className="p-1.5 rounded-lg hover:bg-white/10"><ChevronRight size={18} /></button>
        </div>
      </header>

      {payload && payload.unknownPcoTimeNames.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-xs text-amber-200">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>
            New PCO time name{payload.unknownPcoTimeNames.length > 1 ? 's' : ''} showing until filed:{' '}
            {payload.unknownPcoTimeNames.join(', ')}
          </span>
        </div>
      )}

      {loading && <p className="text-sm text-gray-400">Loading week…</p>}
      {error && <p className="text-sm text-gray-500">Calendar isn't connected yet ({error}).</p>}

      {!loading && !error && (
        // Vertical day list on mobile; 7-col grid from md up.
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {days.map(d => {
            const dayEvents = eventsFor(d)
            const today = sameDay(d, new Date())
            return (
              <div key={isoDate(d)} className={`rounded-xl p-2 ${today ? 'bg-white/5 ring-1 ring-blue-500/40' : ''}`}>
                <div className="text-xs font-medium text-gray-400 mb-1">{fmtDayLabel(d)}</div>
                <div className="flex flex-col gap-1">
                  {dayEvents.length === 0 && <div className="text-[11px] text-gray-600">—</div>}
                  {dayEvents.map(e => (
                    <a
                      key={e.id}
                      href={e.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`block border-l-2 rounded px-1.5 py-1 text-[11px] leading-tight ${LAYER_STYLES[e.layer]}`}
                    >
                      <div className="font-medium truncate">{e.title}</div>
                      <div className="text-gray-400">
                        {e.allDay ? 'All day' : fmtTime(e.start)}
                        {e.personName ? ` · ${e.personName}` : ''}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
