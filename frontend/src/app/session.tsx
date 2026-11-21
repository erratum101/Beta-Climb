import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { climbApi } from '../shared/api'
import { readClientKind } from '../shared/clientKind'
import type { AthleteProfile, Attempt, CreateAttemptInput } from '../shared/api'

interface SessionValue {
  ready: boolean
  profile: AthleteProfile | null
  attempts: Attempt[]
  night: boolean
  setNight: (next: boolean | ((current: boolean) => boolean)) => void
  saveProfile: (profile: AthleteProfile) => Promise<void>
  startAttempt: (input: CreateAttemptInput) => Promise<Attempt>
  statusError: boolean
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
  const menuOpen = root.classList.contains('is-landing-menu')
  const landing =
    root.classList.contains('is-landing') ||
    (readClientKind() === 'mobile' && window.location.pathname === '/')
  if (landing && !menuOpen) {
    root.style.colorScheme = 'normal'
    document.querySelectorAll('meta[name="theme-color"], meta[name="color-scheme"]').forEach((node) => node.remove())
    return
  }
  root.style.colorScheme = scheme
  replaceMeta('color-scheme', scheme)
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
  const chrome = bg || (on ? '#1e1e1e' : '#fd7115')
  replaceMeta('theme-color', chrome)
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
  const [statusError, setStatusError] = useState(false)
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
    const refresh = async () => {
      try {
        const nextProfile = await climbApi.getProfile()
        const nextAttempts = nextProfile ? await climbApi.listAttempts() : []
        if (!alive) return
        setProfile(nextProfile)
        setAttempts(nextAttempts)
        setLoadError(null)
        setReady(true)
      } catch (error) {
        if (alive) setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить данные.')
      }
    }
    void refresh()
    return () => {
      alive = false
    }
  }, [])

  const pending = attempts.filter((attempt) => attempt.status === 'processing').map((attempt) => attempt.id).join(',')
  useEffect(() => {
    setStatusError(false)
    if (!pending) return
    let active = true
    let timer: number
    async function poll() {
      const results = await Promise.allSettled(pending.split(',').map((id) => climbApi.getAttempt(id)))
      if (!active) return
      setStatusError(results.some((result) => result.status === 'rejected'))
      const updates = new Map<string, Attempt | null>()
      const ids = pending.split(',')
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') updates.set(ids[index], result.value)
      })
      setAttempts((items) => items.flatMap((item) => updates.has(item.id) ? updates.get(item.id) ?? [] : item))
      timer = window.setTimeout(poll, 2500)
    }
    timer = window.setTimeout(poll, 2000)
    return () => { active = false; window.clearTimeout(timer) }
  }, [pending])

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
      if (!profile) setAttempts(await climbApi.listAttempts())
      setProfile(saved)
    },
    startAttempt: async (input) => {
      const attempt = await climbApi.createAttempt(input)
      setAttempts((items) => [attempt, ...items.filter((item) => item.id !== attempt.id)])
      return attempt
    },
    statusError,
    resetLocal: async () => {
      await climbApi.reset()
      setProfile(null)
      setAttempts([])
    },
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
