import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { climbApi } from '../shared/api'
import type { AthleteProfile, Attempt, CreateAttemptInput } from '../shared/api'

interface SessionValue {
  ready: boolean
  profile: AthleteProfile | null
  attempts: Attempt[]
  saveProfile: (profile: AthleteProfile) => Promise<void>
  startAttempt: (input: CreateAttemptInput) => Promise<Attempt>
  loadDemo: () => Promise<void>
  resetLocal: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<AthleteProfile | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])

  useEffect(() => {
    let alive = true
    let ticket = 0
    const refresh = () => {
      const current = ++ticket
      void Promise.all([climbApi.getProfile(), climbApi.listAttempts()]).then(([nextProfile, nextAttempts]) => {
        if (!alive || current !== ticket) return
        setProfile(nextProfile)
        setAttempts(nextAttempts)
        setReady(true)
      })
    }
    refresh()
    const unsubscribe = climbApi.subscribe(refresh)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const value: SessionValue = {
    ready,
    profile,
    attempts,
    saveProfile: (next) => {
      const saved = { ...next, nickname: next.nickname.trim() }
      setProfile(saved)
      return climbApi.saveProfile(saved)
    },
    startAttempt: (input) => climbApi.createAttempt(input),
    loadDemo: () => climbApi.loadDemo(),
    resetLocal: () => climbApi.reset(),
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('SessionProvider отсутствует')
  return value
}
