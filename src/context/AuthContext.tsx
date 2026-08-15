import { useState, useEffect, type ReactNode } from 'react'
import { AuthContext } from './authState'
import {
  extractOAuthCode,
  exchangeCodeForSession,
  getStoredSession,
  storeSession,
  clearSession,
  initiatePCOLogin,
  type PCOUser,
} from '../lib/pcoAuth'
import { checkStaffAccess } from '../lib/access'

interface Props { children: ReactNode }

export function AuthProvider({ children }: Props) {
  const [user, setUser] = useState<PCOUser | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [isStaff, setIsStaff] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const code = extractOAuthCode()
      if (code) {
        try {
          const session = await exchangeCodeForSession(code)
          storeSession(session)
          setUser(session.user)
          setSessionToken(session.token)
          setIsStaff(await checkStaffAccess(session.user.pco_id))
        } catch (err) {
          console.error('PCO auth exchange failed:', err)
        }
        setIsLoading(false)
        return
      }

      const stored = getStoredSession()
      if (stored) {
        setUser(stored.user)
        setSessionToken(stored.token)
        setIsStaff(await checkStaffAccess(stored.user.pco_id))
      }
      setIsLoading(false)
    }
    void init()
  }, [])

  const accessLevel = user?.access_level ?? (user?.is_admin ? 'admin' : 'user')

  return (
    <AuthContext.Provider value={{
      user,
      accessLevel,
      isAdmin: accessLevel === 'admin',
      isStaff,
      isLoading,
      sessionToken,
      login: () => initiatePCOLogin(),
      switchAccount: () => initiatePCOLogin({ switchAccount: true }),
      logout: () => { clearSession(); setUser(null); setSessionToken(null); setIsStaff(false) },
    }}>
      {children}
    </AuthContext.Provider>
  )
}
