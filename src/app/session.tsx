import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { climbApi } from '../shared/api'
import type { AthleteProfile, Attempt, CreateAttemptInput } from '../shared/api'

interface SessionValue {
  ready: boolean
  profile: AthleteProfile | null
  attempts: Attempt[]
  night: boolean
  setNight: (next: boolean | ((current: boolean) => boolean)) => void
  saveProfile: (profile: AthleteProfile) => Promise<void>
  startAttempt: (input: CreateAttemptInput) => Promise<Attempt>
  loadDemo: () => Promise<void>
  resetLocal: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

function readNightPreference(): boolean {
  const stored = localStorage.getItem('beta-climb.night')
  if (stored === '1') return true
  if (stored === '0') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyNightTheme(on: boolean) {
  const bg = on ? '#1e1e1e' : '#fd7115'
  document.documentElement.classList.toggle('is-night', on)
  document.documentElement.classList.remove('is-boot-dark')
  document.documentElement.style.setProperty('--boot-bg', bg)
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', bg)
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<AthleteProfile | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [night, setNightState] = useState(() => {
    const on = readNightPreference()
    applyNightTheme(on)
    return on
  })

  useEffect(() => {
    applyNightTheme(night)
    localStorage.setItem('beta-climb.night', night ? '1' : '0')
  }, [night])

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
    night,
    setNight: (next) => {
      setNightState((current) => (typeof next === 'function' ? next(current) : next))
    },
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
