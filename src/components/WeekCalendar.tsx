import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, AlertCircle, Users } from 'lucide-react'
import { useAuth } from '../context/authState'
import { loadWeek, type WeekPayload } from '../lib/dashboardData'
import { CalendarSettings } from './CalendarSettings'
import { getWeekRange, isoDate, sameDay, fmtTime } from '../lib/week'
import type { CalendarEvent, CalendarLayer } from '../types'

// Layer tones — light theme, matching Sunday Ops' schedule blocks.
const LAYER_TONE: Record<CalendarLayer, string> = {
  personal: 'border-blue-300 bg-blue-50 text-blue-900',
  pco: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  monday: 'border-orange-300 bg-orange-50 text-orange-900',
}
const LAYER_DOT: Record<CalendarLayer, string> = {
  personal: 'bg-blue-500', pco: 'bg-emerald-500', monday: 'bg-orange-500',
}

const PX_PER_MIN = 0.7
const GUTTER = 40
const MIN_COL = 116
const MIN_BLOCK_H = 26

function minsFromMidnight(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}
function hourLabel(minute: number) {
  const hour = Math.floor(minute / 60)
  const h12 = hour % 12 || 12
  return `${h12}${hour >= 12 ? 'p' : 'a'}`
}

export function WeekCalendar() {
  const { sessionToken } = useAuth()
  const [offset, setOffset] = useState(0)
  const [payload, setPayload] = useState<WeekPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)

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
  }, [offset, sessionToken, reloadNonce])

  const { days } = getWeekRange(new Date(), offset)
  const events = payload?.events ?? []
  const timed = events.filter(e => !e.allDay && e.end)
  const allDay = events.filter(e => e.allDay || !e.end)

  // Shared vertical time window across the week (fallback 8a–10p).
  const starts = timed.map(e => minsFromMidnight(e.start))
  const ends = timed.map(e => minsFromMidnight(e.end as string))
  const windowStart = timed.length ? Math.floor(Math.min(...starts) / 60) * 60 : 8 * 60
  const windowEnd = timed.length ? Math.ceil(Math.max(...ends) / 60) * 60 : 22 * 60
  const height = (windowEnd - windowStart) * PX_PER_MIN
  const hourMarks: number[] = []
  for (let m = windowStart; m <= windowEnd; m += 60) hourMarks.push(m)

  const eventsOn = (d: Date, list: CalendarEvent[]) => list.filter(e => sameDay(new Date(e.start), d))
  const bodyMinWidth = GUTTER + days.length * MIN_COL

  return (
    <section className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden fade-in">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-gray-900">This Week</h2>
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />PCO</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />Crew</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" />Tasks</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setSettingsOpen(true)} title="Crew calendars" className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg hover:bg-gray-100 text-gray-600"><Users size={15} /><span className="hidden sm:inline">Calendars</span></button>
          <span className="w-px h-4 bg-gray-200 mx-0.5" />
          <button onClick={() => setOffset(o => o - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronLeft size={18} /></button>
          <button onClick={() => setOffset(0)} className="text-xs font-medium px-2 py-1 rounded-lg hover:bg-gray-100 text-gray-700">{offset === 0 ? 'This week' : 'Today'}</button>
          <button onClick={() => setOffset(o => o + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronRight size={18} /></button>
        </div>
      </header>

      {settingsOpen && <CalendarSettings onClose={() => setSettingsOpen(false)} onChanged={() => setReloadNonce(n => n + 1)} />}

      {payload && payload.unknownPcoTimeNames.length > 0 && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>New PCO time name{payload.unknownPcoTimeNames.length > 1 ? 's' : ''} showing until filed: {payload.unknownPcoTimeNames.join(', ')}</span>
        </div>
      )}

      {loading && <p className="px-4 py-6 text-sm text-gray-400">Loading week…</p>}
      {error && <p className="px-4 py-6 text-sm text-gray-400">Calendar isn't connected yet ({error}).</p>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <div style={{ minWidth: bodyMinWidth }}>
            {/* Day headers */}
            <div className="flex border-b border-gray-100 bg-gray-50/60">
              <div style={{ width: GUTTER, flexShrink: 0 }} />
              {days.map(d => {
                const today = sameDay(d, new Date())
                return (
                  <div key={isoDate(d)} style={{ flex: `1 0 ${MIN_COL}px` }}
                    className={`border-l border-gray-100 px-2 py-1.5 text-center ${today ? 'bg-blue-50' : ''}`}>
                    <div className="text-[10px] uppercase tracking-wide text-gray-400">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className={`text-sm font-semibold ${today ? 'text-blue-600' : 'text-gray-700'}`}>{d.getDate()}</div>
                  </div>
                )
              })}
            </div>

            {/* All-day / no-duration strip (monday tasks, all-day cal events) */}
            {allDay.length > 0 && (
              <div className="flex border-b border-gray-100">
                <div style={{ width: GUTTER, flexShrink: 0 }} className="flex items-start justify-end pr-1.5 pt-1.5 text-[9px] text-gray-300">all-day</div>
                {days.map(d => (
                  <div key={isoDate(d)} style={{ flex: `1 0 ${MIN_COL}px` }} className="border-l border-gray-100 p-1 space-y-1 min-h-[28px]">
                    {eventsOn(d, allDay).map(e => (
                      <a key={e.id} href={e.sourceUrl} target="_blank" rel="noreferrer"
                        className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${LAYER_TONE[e.layer]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${LAYER_DOT[e.layer]}`} />
                        <span className="truncate">{e.title}</span>
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Timed grid */}
            <div className="relative" style={{ height }}>
              {hourMarks.map(minute => (
                <div key={minute} className="absolute left-0 right-0" style={{ top: (minute - windowStart) * PX_PER_MIN }}>
                  <div className="absolute left-0 text-[9px] font-mono text-gray-300" style={{ top: -5, width: GUTTER - 6, textAlign: 'right' }}>{hourLabel(minute)}</div>
                  <div className="border-t border-gray-100" style={{ marginLeft: GUTTER }} />
                </div>
              ))}
              <div className="absolute top-0 bottom-0 flex" style={{ left: GUTTER, right: 0 }}>
                {days.map(d => {
                  const today = sameDay(d, new Date())
                  return (
                    <div key={isoDate(d)} className={`relative border-l border-gray-100 ${today ? 'bg-blue-50/40' : ''}`} style={{ flex: `1 0 ${MIN_COL}px` }}>
                      {eventsOn(d, timed).map(e => {
                        const s = minsFromMidnight(e.start)
                        const en = minsFromMidnight(e.end as string)
                        const top = (s - windowStart) * PX_PER_MIN
                        const h = Math.max((en - s) * PX_PER_MIN, MIN_BLOCK_H)
                        return (
                          <a key={e.id} href={e.sourceUrl} target="_blank" rel="noreferrer"
                            title={`${e.title} · ${fmtTime(e.start)}`}
                            className={`absolute overflow-hidden rounded-md border px-1.5 py-0.5 ${LAYER_TONE[e.layer]}`}
                            style={{ top: top + 1, height: h - 2, left: 2, right: 2 }}>
                            <p className="truncate text-[10px] font-semibold leading-tight">{e.title}</p>
                            <p className="truncate font-mono text-[9px] opacity-70">{fmtTime(e.start)}{e.personName ? ` · ${e.personName}` : ''}</p>
                          </a>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
