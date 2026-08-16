import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, AlertCircle, Users, ExternalLink } from 'lucide-react'
import { useAuth } from '../context/authState'
import { loadWeek, type WeekPayload } from '../lib/dashboardData'
import { getWeekRange, isoDate, sameDay, fmtTime } from '../lib/week'
import type { CalendarEvent, CalendarLayer } from '../types'
import { CalendarSettings } from './CalendarSettings'

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

// Lane-pack overlapping events so they sit side by side (from Sunday Ops' grid).
interface Placement { event: CalendarEvent; lane: number; lanes: number }
function packDay(events: CalendarEvent[]): Placement[] {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start) || (a.end ?? '').localeCompare(b.end ?? ''))
  const placed: { event: CalendarEvent; lane: number; startM: number; endM: number }[] = []
  let active: { lane: number; endM: number }[] = []
  for (const e of sorted) {
    const startM = minsFromMidnight(e.start)
    const endM = Math.max(minsFromMidnight(e.end as string), startM + 20)
    active = active.filter(a => a.endM > startM)
    const used = new Set(active.map(a => a.lane))
    let lane = 0; while (used.has(lane)) lane++
    placed.push({ event: e, lane, startM, endM })
    active.push({ lane, endM })
  }
  // lane count per overlapping cluster: recompute a simple global max within
  // each connected overlap run for even widths.
  return placed.map(p => {
    const overlapping = placed.filter(q => p.startM < q.endM && q.startM < p.endM)
    const lanes = Math.max(...overlapping.map(q => q.lane)) + 1
    return { event: p.event, lane: p.lane, lanes }
  })
}

// ── Hover / tap popover ───────────────────────────────────────────────────────
function EventPopover({ event }: { event: CalendarEvent }) {
  const timeLabel = event.allDay ? 'All day' : `${fmtTime(event.start)}${event.end ? `–${fmtTime(event.end)}` : ''}`
  return (
    <div className="w-64 rounded-xl bg-white border border-gray-200 shadow-xl p-3 text-left">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full ${LAYER_DOT[event.layer]}`} />
        <span className="text-[11px] font-semibold text-gray-500">{event.context ?? (event.layer === 'monday' ? 'Task due' : event.personName ?? 'Calendar')}</span>
      </div>
      <div className="text-sm font-semibold text-gray-900">{event.title}</div>
      <div className="text-xs text-gray-500 mt-0.5">{timeLabel}</div>
      {event.assignees && event.assignees.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Scheduled crew</div>
          <div className="flex flex-col gap-0.5">
            {event.assignees.map((a, i) => (
              <div key={i} className="text-xs text-gray-700 flex items-baseline justify-between gap-2">
                <span className="truncate"><span className="font-medium">{a.name}</span>{a.position ? <span className="text-gray-400"> · {a.position}</span> : ''}</span>
                {a.status && <span className={`text-[10px] shrink-0 ${a.status.toLowerCase() === 'confirmed' ? 'text-emerald-600' : 'text-amber-600'}`}>{a.status}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {event.sourceUrl && (
        <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
          Open in {event.layer === 'monday' ? 'monday' : 'Planning Center'} <ExternalLink size={11} />
        </a>
      )}
    </div>
  )
}

function EventChip({ event, style, compact }: { event: CalendarEvent; style?: React.CSSProperties; compact?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  function place() {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    const W = 256, H = 220
    let left = r.right + 8
    if (left + W > window.innerWidth - 8) left = Math.max(8, r.left - W - 8)
    const top = Math.min(Math.max(8, r.top), window.innerHeight - H - 8)
    setPos({ left, top })
  }
  function show() { place(); setOpen(true) }
  function hide() { if (!pinned) setOpen(false) }

  useEffect(() => {
    if (!pinned) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setPinned(false); setOpen(false) } }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [pinned])

  return (
    <>
      <button
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={(e) => { e.stopPropagation(); place(); setPinned(p => !p); setOpen(true) }}
        style={style}
        className={`text-left overflow-hidden rounded-md border ${LAYER_TONE[event.layer]} ${compact ? 'px-1.5 py-0.5' : 'px-1.5 py-0.5'} block w-full`}
      >
        <p className="truncate text-[10px] font-semibold leading-tight">{event.title}</p>
        <p className="truncate font-mono text-[9px] opacity-70">
          {event.allDay ? '' : fmtTime(event.start)}
          {event.context ? `${event.allDay ? '' : ' · '}${event.context}` : ''}
          {event.personName ? ` · ${event.personName}` : ''}
        </p>
      </button>
      {open && pos && (
        <div className="fixed z-50" style={{ left: pos.left, top: pos.top }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => !pinned && setOpen(false)}>
          <EventPopover event={event} />
        </div>
      )}
    </>
  )
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
          <span>New PCO time name{payload.unknownPcoTimeNames.length > 1 ? 's' : ''}: {payload.unknownPcoTimeNames.join(', ')}</span>
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

            {/* All-day strip */}
            {allDay.length > 0 && (
              <div className="flex border-b border-gray-100">
                <div style={{ width: GUTTER, flexShrink: 0 }} className="flex items-start justify-end pr-1.5 pt-1.5 text-[9px] text-gray-300">all-day</div>
                {days.map(d => (
                  <div key={isoDate(d)} style={{ flex: `1 0 ${MIN_COL}px` }} className="border-l border-gray-100 p-1 space-y-1 min-h-[28px]">
                    {eventsOn(d, allDay).map(e => (
                      <div key={e.id} className="relative"><EventChip event={e} compact /></div>
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
                  const placements = packDay(eventsOn(d, timed))
                  return (
                    <div key={isoDate(d)} className={`relative border-l border-gray-100 ${today ? 'bg-blue-50/40' : ''}`} style={{ flex: `1 0 ${MIN_COL}px` }}>
                      {placements.map(({ event: e, lane, lanes }) => {
                        const s = minsFromMidnight(e.start)
                        const en = minsFromMidnight(e.end as string)
                        const top = (s - windowStart) * PX_PER_MIN
                        const h = Math.max((en - s) * PX_PER_MIN, MIN_BLOCK_H)
                        const widthPct = 100 / lanes
                        return (
                          <div key={e.id} className="absolute" style={{ top: top + 1, height: h - 2, left: `calc(${lane * widthPct}% + 1px)`, width: `calc(${widthPct}% - 2px)` }}>
                            <EventChip event={e} style={{ height: '100%' }} />
                          </div>
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
