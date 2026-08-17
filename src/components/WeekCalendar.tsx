import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, AlertCircle, Users, ExternalLink, X, CalendarDays, List } from 'lucide-react'
import { useAuth } from '../context/authState'
import { loadWeek, loadCrewCalendars, type WeekPayload, type CrewCalendar } from '../lib/dashboardData'
import { getWeekRange, isoDate, sameDay, fmtTime } from '../lib/week'
import { useIsMobile } from '../lib/useIsMobile'
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
const LAYER_BAR: Record<CalendarLayer, string> = {
  personal: 'bg-blue-400', pco: 'bg-emerald-400', monday: 'bg-orange-400',
}

const PX_PER_MIN = 0.7
const GUTTER = 44
const MIN_COL = 130
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
  return placed.map(p => {
    const overlapping = placed.filter(q => p.startM < q.endM && q.startM < p.endM)
    const lanes = Math.max(...overlapping.map(q => q.lane)) + 1
    return { event: p.event, lane: p.lane, lanes }
  })
}

// ── Shared detail content ─────────────────────────────────────────────────────
function EventDetail({ event }: { event: CalendarEvent }) {
  const timeLabel = event.allDay ? 'All day' : `${fmtTime(event.start)}${event.end ? `–${fmtTime(event.end)}` : ''}`
  return (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full ${LAYER_DOT[event.layer]}`} />
        <span className="text-[11px] font-semibold text-gray-500">{event.context ?? (event.layer === 'monday' ? 'Task due' : event.personName ?? 'Calendar')}</span>
      </div>
      <div className="text-base font-semibold text-gray-900 leading-snug">{event.title}</div>
      <div className="text-xs text-gray-500 mt-0.5">{timeLabel}</div>
      {event.assignees && event.assignees.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Scheduled crew</div>
          <div className="flex flex-col gap-0.5">
            {event.assignees.map((a, i) => (
              <div key={i} className="text-sm text-gray-700 flex items-baseline justify-between gap-2">
                <span className="truncate"><span className="font-medium">{a.name}</span>{a.position ? <span className="text-gray-400"> · {a.position}</span> : ''}</span>
                {a.status && <span className={`text-[10px] shrink-0 ${a.status.toLowerCase() === 'confirmed' ? 'text-emerald-600' : 'text-amber-600'}`}>{a.status}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {event.sourceUrl && (
        <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
          Open in {event.layer === 'monday' ? 'monday' : 'Planning Center'} <ExternalLink size={12} />
        </a>
      )}
    </>
  )
}

// Mobile: bottom sheet.
function DetailSheet({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/40" onClick={onClose}>
      <div className="w-full md:max-w-md bg-white rounded-t-2xl md:rounded-2xl p-4 pb-8 md:pb-4 shadow-xl" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        <div className="flex justify-between items-start">
          <div className="flex-1"><EventDetail event={event} /></div>
          <button onClick={onClose} className="p-1.5 -mt-1 -mr-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
      </div>
    </div>
  )
}

// Desktop: hover/pin popover on an absolutely-positioned chip.
function EventChip({ event, style, compact = false }: { event: CalendarEvent; style?: React.CSSProperties; compact?: boolean }) {
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
        onMouseEnter={() => { place(); setOpen(true) }}
        onMouseLeave={() => { if (!pinned) setOpen(false) }}
        onClick={(e) => { e.stopPropagation(); place(); setPinned(p => !p); setOpen(true) }}
        style={style}
        className={`text-left overflow-hidden rounded-md border px-2 py-1 block w-full ${LAYER_TONE[event.layer]}`}
      >
        {!compact && !event.allDay && <p className="truncate text-[9px] font-semibold uppercase tracking-wide opacity-60 leading-none mb-1">{fmtTime(event.start)}{event.end ? `–${fmtTime(event.end)}` : ''}</p>}
        <p className="truncate text-[11px] font-semibold leading-tight">{event.title}</p>
        {!compact && (event.context || event.personName || event.location) && (
          <p className="truncate text-[9px] opacity-65 mt-0.5">
            {[event.context, event.personName, event.location].filter(Boolean).join(' · ')}
          </p>
        )}
      </button>
      {open && pos && (
        <div className="fixed z-50 w-64 rounded-xl bg-white border border-gray-200 shadow-xl p-3 text-left" style={{ left: pos.left, top: pos.top }}
          onMouseEnter={() => setOpen(true)} onMouseLeave={() => !pinned && setOpen(false)}>
          <EventDetail event={event} />
        </div>
      )}
    </>
  )
}

// Full-week list: generous, scan-friendly rows grouped by day.
function WeekList({ days, events, onSelect }: { days: Date[]; events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void }) {
  return (
    <div className="divide-y divide-gray-100">
      {days.map(day => {
        const dayEvents = events
          .filter(e => sameDay(new Date(e.start), day))
          .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
        const today = sameDay(day, new Date())
        return (
          <section key={isoDate(day)} className="grid md:grid-cols-[150px_1fr] gap-2 md:gap-5 px-4 py-4">
            <div>
              <div className={`text-xs font-semibold uppercase tracking-wide ${today ? 'text-blue-600' : 'text-gray-400'}`}>{day.toLocaleDateString('en-US', { weekday: 'long' })}</div>
              <div className="text-sm font-semibold text-gray-800">{day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</div>
            </div>
            {dayEvents.length === 0 ? (
              <div className="text-sm text-gray-400 py-2">Nothing scheduled.</div>
            ) : (
              <div className="space-y-2">
                {dayEvents.map(e => (
                  <button key={e.id} onClick={() => onSelect(e)} className="w-full text-left flex items-stretch gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                    <div className="w-24 shrink-0 text-right tabular-nums">
                      <div className="text-xs font-semibold text-gray-800">{e.allDay ? 'All day' : fmtTime(e.start)}</div>
                      {!e.allDay && e.end && <div className="text-[11px] text-gray-400">to {fmtTime(e.end)}</div>}
                    </div>
                    <span className={`w-1 rounded-full ${LAYER_BAR[e.layer]}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900">{e.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[e.context, e.personName, e.location].filter(Boolean).join(' · ') || (e.layer === 'monday' ? 'Task due' : 'Calendar event')}
                        {e.assignees?.length ? ` · ${e.assignees.length} crew` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

// ── Mobile agenda ─────────────────────────────────────────────────────────────
function MobileAgenda({ days, events, onSelect }: { days: Date[]; events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void }) {
  const todayIdx = days.findIndex(d => sameDay(d, new Date()))
  const [sel, setSel] = useState(todayIdx >= 0 ? todayIdx : 0)
  const day = days[sel]
  const dayEvents = events.filter(e => sameDay(new Date(e.start), day))
  const allDay = dayEvents.filter(e => e.allDay || !e.end).sort((a, b) => a.title.localeCompare(b.title))
  const timed = dayEvents.filter(e => !e.allDay && e.end).sort((a, b) => a.start.localeCompare(b.start))

  return (
    <div>
      {/* Day selector */}
      <div className="flex border-b border-gray-100">
        {days.map((d, i) => {
          const today = sameDay(d, new Date())
          const active = i === sel
          return (
            <button key={isoDate(d)} onClick={() => setSel(i)}
              className={`flex-1 py-2 flex flex-col items-center gap-0.5 border-b-2 ${active ? 'border-blue-600' : 'border-transparent'}`}>
              <span className={`text-[10px] uppercase ${active ? 'text-blue-600' : 'text-gray-400'}`}>{d.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
              <span className={`text-sm w-7 h-7 grid place-items-center rounded-full ${active ? 'bg-blue-600 text-white font-semibold' : today ? 'text-blue-600 font-semibold' : 'text-gray-700'}`}>{d.getDate()}</span>
            </button>
          )
        })}
      </div>

      {/* Agenda for the selected day */}
      <div className="p-3">
        <div className="text-xs font-semibold text-gray-500 mb-2">{day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        {dayEvents.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">Nothing scheduled.</p>}
        <div className="flex flex-col gap-1.5">
          {allDay.map(e => (
            <button key={e.id} onClick={() => onSelect(e)} className="w-full text-left flex items-stretch gap-2.5 rounded-xl border border-gray-200 bg-white p-2.5 active:bg-gray-50">
              <span className={`w-1 rounded-full ${LAYER_BAR[e.layer]}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900 truncate">{e.title}</div>
                <div className="text-[11px] text-gray-500">All day{e.context ? ` · ${e.context}` : ''}</div>
              </div>
            </button>
          ))}
          {timed.map(e => (
            <button key={e.id} onClick={() => onSelect(e)} className="w-full text-left flex items-stretch gap-2.5 rounded-xl border border-gray-200 bg-white p-2.5 active:bg-gray-50">
              <div className="w-14 shrink-0 text-right">
                <div className="text-xs font-semibold text-gray-800 tabular-nums">{fmtTime(e.start)}</div>
                {e.end && <div className="text-[10px] text-gray-400 tabular-nums">{fmtTime(e.end)}</div>}
              </div>
              <span className={`w-1 rounded-full ${LAYER_BAR[e.layer]}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900 truncate">{e.title}</div>
                <div className="text-[11px] text-gray-500 truncate">
                  {e.context ?? e.personName ?? ''}
                  {e.assignees && e.assignees.length > 0 ? ` · ${e.assignees.length} crew` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function WeekCalendar() {
  const { sessionToken } = useAuth()
  const isMobile = useIsMobile()
  const [offset, setOffset] = useState(0)
  const [payload, setPayload] = useState<WeekPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [sheetEvent, setSheetEvent] = useState<CalendarEvent | null>(null)
  const [view, setView] = useState<'week' | 'list'>(() => localStorage.getItem('calendar_view') === 'list' ? 'list' : 'week')
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cal_hidden') ?? '[]')) } catch { return new Set() }
  })

  const [crew, setCrew] = useState<CrewCalendar[]>([])

  function toggleHidden(id: string) {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      localStorage.setItem('cal_hidden', JSON.stringify([...next]))
      return next
    })
  }

  function changeView(next: 'week' | 'list') {
    setView(next)
    localStorage.setItem('calendar_view', next)
  }

  useEffect(() => { loadCrewCalendars().then(setCrew).catch(() => {}) }, [reloadNonce])

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
  // Per-viewer visibility: hide events from calendars the user toggled off.
  const events = (payload?.events ?? []).filter(e => !(e.calendarId && hidden.has(e.calendarId)))
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
          <div className="flex items-center rounded-lg bg-gray-100 p-0.5 mr-1" aria-label="Calendar view">
            <button onClick={() => changeView('week')} title="Week view" aria-pressed={view === 'week'} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${view === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><CalendarDays size={14} /><span className="hidden lg:inline">Week</span></button>
            <button onClick={() => changeView('list')} title="List view" aria-pressed={view === 'list'} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${view === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><List size={14} /><span className="hidden lg:inline">List</span></button>
          </div>
          <button onClick={() => setSettingsOpen(true)} title="Crew calendars" className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg hover:bg-gray-100 text-gray-600"><Users size={15} /><span className="hidden sm:inline">Calendars</span></button>
          <span className="w-px h-4 bg-gray-200 mx-0.5" />
          <button onClick={() => setOffset(o => o - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronLeft size={18} /></button>
          <button onClick={() => setOffset(0)} className="text-xs font-medium px-2 py-1 rounded-lg hover:bg-gray-100 text-gray-700">{offset === 0 ? 'This week' : 'Today'}</button>
          <button onClick={() => setOffset(o => o + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronRight size={18} /></button>
        </div>
      </header>

      {settingsOpen && <CalendarSettings onClose={() => setSettingsOpen(false)} onChanged={() => setReloadNonce(n => n + 1)} />}
      {sheetEvent && <DetailSheet event={sheetEvent} onClose={() => setSheetEvent(null)} />}

      {/* Crew-calendar filter — toggle any shared calendar on/off in your view */}
      {crew.filter(c => c.active).length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
          {crew.filter(c => c.active).map(c => {
            const visible = !hidden.has(c.id)
            return (
              <button key={c.id} onClick={() => toggleHidden(c.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${visible ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-400'}`}>
                <span className={`w-2 h-2 rounded-full ${visible ? 'bg-blue-500' : 'bg-gray-300'}`} />
                {c.personName}{c.label ? ` · ${c.label}` : ''}
              </button>
            )
          })}
        </div>
      )}

      {payload && payload.unknownPcoTimeNames.length > 0 && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>New PCO time name{payload.unknownPcoTimeNames.length > 1 ? 's' : ''}: {payload.unknownPcoTimeNames.join(', ')}</span>
        </div>
      )}

      {loading && <p className="px-4 py-6 text-sm text-gray-400">Loading week…</p>}
      {error && <p className="px-4 py-6 text-sm text-gray-400">Calendar isn't connected yet ({error}).</p>}

      {!loading && !error && view === 'list' && (
        <WeekList days={days} events={events} onSelect={setSheetEvent} />
      )}

      {!loading && !error && view === 'week' && isMobile && (
        <MobileAgenda days={days} events={events} onSelect={setSheetEvent} />
      )}

      {!loading && !error && view === 'week' && !isMobile && (
        <div className="w-full">
          {/* Day headers */}
          <div className="flex border-b border-gray-100 bg-gray-50/60">
            <div style={{ width: GUTTER, flexShrink: 0 }} />
            {days.map(d => {
              const today = sameDay(d, new Date())
              return (
                <div key={isoDate(d)} style={{ flex: `1 1 ${MIN_COL}px` }}
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
                <div key={isoDate(d)} style={{ flex: `1 1 ${MIN_COL}px` }} className="border-l border-gray-100 p-1 space-y-1 min-h-[28px]">
                  {eventsOn(d, allDay).map(e => (
                    <div key={e.id} className="relative"><EventChip event={e} /></div>
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
                  <div key={isoDate(d)} className={`relative border-l border-gray-100 ${today ? 'bg-blue-50/40' : ''}`} style={{ flex: `1 1 ${MIN_COL}px` }}>
                    {placements.map(({ event: e, lane, lanes }) => {
                      const s = minsFromMidnight(e.start)
                      const en = minsFromMidnight(e.end as string)
                      const top = (s - windowStart) * PX_PER_MIN
                      const h = Math.max((en - s) * PX_PER_MIN, MIN_BLOCK_H)
                      const widthPct = 100 / lanes
                      return (
                        <div key={e.id} className="absolute" style={{ top: top + 1, height: h - 2, left: `calc(${lane * widthPct}% + 1px)`, width: `calc(${widthPct}% - 2px)` }}>
                          <EventChip event={e} compact={h < 54 || lanes > 2} style={{ height: '100%' }} />
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
