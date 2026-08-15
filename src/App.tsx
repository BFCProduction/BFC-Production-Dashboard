import { useState } from 'react'
import { useAuth } from './context/authState'
import { LoginScreen, NotStaffScreen } from './components/LoginScreen'
import { LinksRow } from './components/LinksRow'
import { WeekCalendar } from './components/WeekCalendar'
import { TaskList } from './components/TaskList'
import { Clipboard } from './components/Clipboard'
import { HoursStrip } from './components/HoursStrip'
import { DesktopTabs, MobileTabBar, type Tab } from './components/TabBar'
import bfcLogo from './assets/BFC_Production_Logo_reverse.png'

export default function App() {
  const { user, isStaff, isLoading, logout } = useAuth()
  const [tab, setTab] = useState<Tab>('calendar')
  // Mount a tab's content on first visit, then keep it mounted (hidden when
  // inactive) so switching back is instant and doesn't refetch.
  const [visited, setVisited] = useState<Set<Tab>>(new Set(['calendar']))

  function goTo(t: Tab) {
    setTab(t)
    setVisited(prev => prev.has(t) ? prev : new Set(prev).add(t))
  }

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!user) return <LoginScreen />
  if (!isStaff) return <NotStaffScreen onLogout={logout} />

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20" style={{ background: '#1a1a1a' }}>
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 md:px-6 h-14">
          <div className="flex items-center gap-3">
            <img src={bfcLogo} alt="BFC Production" className="h-6 md:h-7 w-auto object-contain" />
            <span className="hidden sm:inline text-gray-600 text-sm">·</span>
            <span className="hidden sm:inline text-gray-400 text-sm">Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            {user.avatar_url
              ? <img src={user.avatar_url} alt={user.name} className="w-7 h-7 rounded-full ring-1 ring-white/20" />
              : <div className="w-7 h-7 rounded-full bg-white/15" />}
            <button onClick={logout} className="text-[11px] text-gray-400 hover:text-gray-200">Sign out</button>
          </div>
        </div>
      </header>

      <DesktopTabs active={tab} setActive={goTo} />

      <main className="mx-auto max-w-5xl px-3 md:px-6 py-4 space-y-4 pb-28 md:pb-8">
        <LinksRow />

        {visited.has('calendar') && (
          <div className={`${tab === 'calendar' ? 'block' : 'hidden'} space-y-4`}>
            <WeekCalendar />
            <HoursStrip />
          </div>
        )}
        {visited.has('tasks') && <div className={tab === 'tasks' ? 'block' : 'hidden'}><TaskList /></div>}
        {visited.has('clipboard') && <div className={tab === 'clipboard' ? 'block' : 'hidden'}><Clipboard /></div>}
      </main>

      <MobileTabBar active={tab} setActive={goTo} />
    </div>
  )
}
