import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
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

const THEME_KEY = 'beta-climb.theme'

function readStoredNight(): boolean | null {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'dark') return true
    if (stored === 'light') return false
  } catch {
    return null
  }
  return null
}

function readNightPreference(): boolean {
  const stored = readStoredNight()
  if (stored != null) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyNightTheme(on: boolean) {
  const bg = on ? '#1e1e1e' : '#fd7115'
  const root = document.documentElement
  root.classList.toggle('is-night', on)
  root.classList.remove('is-boot-dark')
  root.style.colorScheme = on ? 'dark' : 'only light'
  root.style.setProperty('--boot-bg', bg)
  replaceMeta('theme-color', bg)
  replaceMeta('color-scheme', on ? 'dark' : 'only light')
}

function replaceMeta(name: string, content: string) {
  const nodes = [...document.querySelectorAll(`meta[name="${name}"]`)]
  if (nodes.length === 1 && nodes[0].getAttribute('content') === content) return
  nodes.forEach((node) => node.remove())
  const meta = document.createElement('meta')
  meta.setAttribute('name', name)
  meta.setAttribute('content', content)
  document.head.appendChild(meta)
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<AthleteProfile | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const chosen = useRef(readStoredNight() != null)
  const [night, setNightState] = useState(() => {
    const on = readNightPreference()
    applyNightTheme(on)
    return on
  })

  useLayoutEffect(() => {
    applyNightTheme(night)
    if (!chosen.current) return
    try {
      localStorage.setItem(THEME_KEY, night ? 'dark' : 'light')
    } catch {
      /* private mode */
    }
  }, [night])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => {
      if (chosen.current) return
      setNightState(event.matches)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

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
      chosen.current = true
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
