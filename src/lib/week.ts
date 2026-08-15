// Monday–Sunday week helpers, computed in the browser so the "this week"
// boundary never goes stale on its own.

export interface WeekRange {
  start: Date // Monday 00:00 local
  end: Date   // Sunday 23:59:59 local
  days: Date[]
}

export function getWeekRange(ref: Date = new Date(), offsetWeeks = 0): WeekRange {
  const d = new Date(ref)
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7 // 0 = Monday
  const start = new Date(d)
  start.setDate(d.getDate() - dow + offsetWeeks * 7)
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    return day
  })
  const end = new Date(days[6])
  end.setHours(23, 59, 59, 999)
  return { start, end, days }
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function fmtDayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
