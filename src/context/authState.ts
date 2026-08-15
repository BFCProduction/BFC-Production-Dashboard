import { createContext, useContext } from 'react'
import type { PCOUser } from '../lib/pcoAuth'
import type { AppAccessLevel } from '../types'

export interface AuthContextType {
  user: PCOUser | null
  accessLevel: AppAccessLevel
  isAdmin: boolean
  isStaff: boolean          // gate for THIS app
  isLoading: boolean
  sessionToken: string | null
  login: () => void
  switchAccount: () => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  accessLevel: 'user',
  isAdmin: false,
  isStaff: false,
  isLoading: true,
  sessionToken: null,
  login: () => {},
  switchAccount: () => {},
  logout: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}
