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
const THEME_SWAP_MS = 1000
let themeSwapTimer = 0

function beginThemeSwap() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const root = document.documentElement
  root.classList.add('is-theme-swap')
  void root.offsetWidth
  window.clearTimeout(themeSwapTimer)
  themeSwapTimer = window.setTimeout(() => {
    root.classList.remove('is-theme-swap')
  }, THEME_SWAP_MS)
}

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
  const stored = readStoredNight()
  const root = document.documentElement
  const scheme = stored == null ? 'light dark' : stored ? 'dark' : 'light'
  root.classList.toggle('is-night', stored === true)
  root.classList.toggle('is-light', stored === false)
  root.classList.remove('is-boot-dark')
  root.style.colorScheme = scheme
  replaceMeta('theme-color', on ? '#1e1e1e' : '#fd7115')
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
  const [profile, setProfile] = useState<AthleteProfile | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const chosen = useRef(readStoredNight() != null)
  const [night, setNightState] = useState(() => {
    const on = readNightPreference()
    applyNightTheme(on)
    return on
  })

  useLayoutEffect(() => {
    if (chosen.current) {
      try {
        localStorage.setItem(THEME_KEY, night ? 'dark' : 'light')
      } catch {
        /* private mode */
      }
    }
    applyNightTheme(night)
  }, [night])

  const nightRef = useRef(night)
  nightRef.current = night

  useEffect(() => {
    let lastSystem = window.matchMedia('(prefers-color-scheme: dark)').matches

    const followSystem = (next: boolean) => {
      if (next === lastSystem) return
      lastSystem = next
      chosen.current = false
      try {
        localStorage.removeItem(THEME_KEY)
      } catch {
        /* private mode */
      }
      if (nightRef.current !== next) beginThemeSwap()
      applyNightTheme(next)
      setNightState(next)
    }

    const onChange = (event: MediaQueryListEvent) => {
      followSystem(event.matches)
    }

    const onForeground = () => {
      if (document.visibilityState === 'hidden') return
      followSystem(window.matchMedia('(prefers-color-scheme: dark)').matches)
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', onChange)
    document.addEventListener('visibilitychange', onForeground)
    window.addEventListener('pageshow', onForeground)
    window.addEventListener('focus', onForeground)
    return () => {
      media.removeEventListener('change', onChange)
      document.removeEventListener('visibilitychange', onForeground)
      window.removeEventListener('pageshow', onForeground)
      window.removeEventListener('focus', onForeground)
    }
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
      beginThemeSwap()
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
