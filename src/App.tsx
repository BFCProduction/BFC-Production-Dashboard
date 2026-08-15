import { useAuth } from './context/authState'
import { LoginScreen, NotStaffScreen } from './components/LoginScreen'
import { LinksRow } from './components/LinksRow'
import { WeekCalendar } from './components/WeekCalendar'
import { TaskList } from './components/TaskList'
import { Clipboard } from './components/Clipboard'
import { HoursStrip } from './components/HoursStrip'

export default function App() {
  const { user, isStaff, isLoading, logout } = useAuth()

  if (isLoading) {
    return <div className="min-h-screen grid place-items-center text-gray-500">Loading…</div>
  }
  if (!user) return <LoginScreen />
  if (!isStaff) return <NotStaffScreen onLogout={logout} />

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 backdrop-blur bg-brand-sidebar/80 border-b border-white/10">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-base font-bold leading-none">Production Dashboard</h1>
            <p className="text-[11px] text-gray-500">The week around the services</p>
          </div>
          <div className="flex items-center gap-2">
            {user.avatar_url
              ? <img src={user.avatar_url} alt={user.name} className="w-7 h-7 rounded-full" />
              : <div className="w-7 h-7 rounded-full bg-white/15" />}
            <button onClick={logout} className="text-[11px] text-gray-400 underline">Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4 space-y-4 pb-24">
        <LinksRow />
        <WeekCalendar />
        <HoursStrip />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TaskList />
          <Clipboard />
        </div>
      </main>
    </div>
  )
}
