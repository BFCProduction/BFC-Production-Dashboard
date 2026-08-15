import type { LucideIcon } from 'lucide-react'
import { CalendarDays, ListChecks, ClipboardList } from 'lucide-react'

export type Tab = 'calendar' | 'tasks' | 'clipboard'

export const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'clipboard', label: 'Clipboard', icon: ClipboardList },
]

// Desktop: a horizontal tab row that sits under the header.
export function DesktopTabs({ active, setActive }: { active: Tab; setActive: (t: Tab) => void }) {
  return (
    <div className="hidden md:flex items-center gap-1 border-b border-gray-200 bg-white/60">
      <div className="mx-auto max-w-5xl w-full px-6 flex items-center gap-1">
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = active === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition
                ${isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Mobile: floating dark pill, matching Sunday Ops' bottom nav.
export function MobileTabBar({ active, setActive }: { active: Tab; setActive: (t: Tab) => void }) {
  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-center"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <nav
        className="flex items-center justify-around w-[calc(100%-16px)] max-w-md rounded-full px-2 py-2"
        style={{ background: '#1c1c1e', boxShadow: '0 4px 24px rgba(0,0,0,0.18), 0 1.5px 6px rgba(0,0,0,0.12)' }}
      >
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = active === t.id
          return (
            <button key={t.id} onClick={() => setActive(t.id)} className="flex flex-col items-center min-w-0 flex-1 px-1 py-1">
              <Icon className={isActive ? 'text-white' : 'text-gray-500'} size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              <span className={`text-[10px] font-medium mt-0.5 ${isActive ? 'text-white' : 'text-gray-500'}`}>{t.label}</span>
              <span className={`mt-0.5 w-1 h-1 rounded-full ${isActive ? 'bg-blue-500' : 'bg-transparent'}`} />
            </button>
          )
        })}
      </nav>
    </div>
  )
}
