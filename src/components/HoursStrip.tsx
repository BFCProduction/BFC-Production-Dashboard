import { useEffect, useState } from 'react'
import { useAuth } from '../context/authState'
import { loadHours } from '../lib/dashboardData'
import type { PersonHours } from '../types'

export function HoursStrip({ offset = 0 }: { offset?: number }) {
  const { sessionToken } = useAuth()
  const [people, setPeople] = useState<PersonHours[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    loadHours(offset, sessionToken)
      .then(p => { if (live) setPeople(p) })
      .catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [offset, sessionToken])

  if (error) return null // quietly hide until the hours function is deployed
  if (people.length === 0) return null

  const max = Math.max(...people.map(p => p.hours), 1)

  return (
    <section className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <h2 className="font-semibold mb-3">Hours This Week</h2>
      <div className="flex flex-col gap-2">
        {people.map(p => (
          <div key={p.personName} className="flex items-center gap-3">
            <div className="w-24 shrink-0 truncate text-sm">{p.personName}</div>
            <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: `${(p.hours / max) * 100}%` }} />
            </div>
            <div className="w-14 text-right text-sm tabular-nums text-gray-300">
              {p.hours.toFixed(1)}{p.approximate ? '~' : ''}h
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-gray-500">~ = approximate (monday tasks without a duration are excluded)</p>
    </section>
  )
}
