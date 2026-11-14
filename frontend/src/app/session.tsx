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
const THEME_SET_KEY = 'beta-climb.theme-set'

function readStoredNight(): boolean | null {
  try {
    if (localStorage.getItem(THEME_SET_KEY) !== '1') return null
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'dark') return true
    if (stored === 'light') return false
  } catch {
    return null
  }
  return null
}

function persistNight(on: boolean) {
  try {
    localStorage.setItem(THEME_SET_KEY, '1')
    localStorage.setItem(THEME_KEY, on ? 'dark' : 'light')
  } catch {
    /* private mode */
  }
}

function readNightPreference(): boolean {
  const stored = readStoredNight()
  if (stored != null) return stored
  return false
}

function applyNightTheme(on: boolean) {
  const root = document.documentElement
  const scheme = on ? 'dark' : 'light'
  root.classList.toggle('is-night', on)
  root.classList.toggle('is-light', !on)
  root.classList.remove('is-boot-dark')
  root.style.colorScheme = scheme
  const menuOpen = root.classList.contains('is-landing-menu')
  replaceMeta('theme-color', menuOpen ? (on ? '#343434' : '#ffffff') : on ? '#1e1e1e' : '#fd7115')
  replaceMeta('color-scheme', scheme)
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [profile, setProfile] = useState<AthleteProfile | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [night, setNightState] = useState(() => {
    const on = readNightPreference()
    applyNightTheme(on)
    return on
  })
  const nightRef = useRef(night)
  nightRef.current = night

  useLayoutEffect(() => {
    applyNightTheme(night)
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
        setLoadError(null)
        setReady(true)
      }).catch((error: unknown) => {
        if (!alive || current !== ticket) return
        setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить профиль.')
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
      const nextNight = typeof next === 'function' ? next(nightRef.current) : next
      nightRef.current = nextNight
      persistNight(nextNight)
      setNightState(nextNight)
    },
    saveProfile: async (next) => {
      const saved = { ...next, nickname: next.nickname.trim() }
      await climbApi.saveProfile(saved)
      setProfile(saved)
    },
    startAttempt: (input) => climbApi.createAttempt(input),
    loadDemo: () => climbApi.loadDemo(),
    resetLocal: () => climbApi.reset(),
  }

  return (
    <SessionContext.Provider value={value}>
      {loadError ? (
        <div className="screen screen-center">
          <p role="alert">{loadError}</p>
          <button className="btn btn-light" onClick={() => window.location.reload()}>Попробовать снова</button>
        </div>
      ) : children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('SessionProvider отсутствует')
  return value
}
