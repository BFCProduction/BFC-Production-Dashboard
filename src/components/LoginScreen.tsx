import { useAuth } from '../context/authState'

export function LoginScreen() {
  const { login, switchAccount } = useAuth()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">BFC Production Dashboard</h1>
        <p className="mt-2 max-w-sm text-sm text-gray-400">
          The paid crew's view of everything happening around the services — this week's
          schedule, tasks, and shared files.
        </p>
      </div>
      <button
        onClick={login}
        className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white active:scale-95 transition"
      >
        Sign in with Planning Center
      </button>
      <button onClick={switchAccount} className="text-sm text-gray-400 underline">
        Log in as someone else
      </button>
    </div>
  )
}

export function NotStaffScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-bold">Paid crew only</h1>
      <p className="max-w-sm text-sm text-gray-400">
        You're signed in, but this dashboard is limited to paid production staff. If you
        think you should have access, ask Alan to add you.
      </p>
      <button onClick={onLogout} className="text-sm text-gray-400 underline">Sign out</button>
    </div>
  )
}
