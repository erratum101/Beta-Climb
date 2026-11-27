import { readClientKind } from './clientKind'

/** Last in-app screen. iOS standalone reloads the manifest start_url after the screen locks. */
export const ROUTE_MEMORY_KEY = 'beta-climb.route'

// Keep in sync with the boot script in index.html.
const SAVED_PATH =
  /^\/(welcome|onboarding|home|climbs|history|profile|attempt\/new|attempt\/(?!new\/)[^/]+\/processing|attempt\/(?!new$)[^/]+|compare\/[^/]+)$/

export function rememberedHref(pathname: string, search = '', hash = ''): string | null {
  if (!SAVED_PATH.test(pathname)) return null
  if (search && !search.startsWith('?')) return null
  if (hash && !hash.startsWith('#')) return null
  return `${pathname}${search}${hash}`
}

export function rememberRoute(pathname: string, search: string, hash: string) {
  const href = rememberedHref(pathname, search, hash)
  if (!href) return
  try {
    localStorage.setItem(ROUTE_MEMORY_KEY, JSON.stringify({ href }))
  } catch {
    /* private mode */
  }
}

export function readRememberedRoute(): string | null {
  try {
    const raw = localStorage.getItem(ROUTE_MEMORY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { href?: unknown }
    if (typeof parsed.href !== 'string') return null
    const match = /^(\/[^?#]*)(\?[^#]*)?(#.*)?$/.exec(parsed.href)
    if (!match) return null
    return rememberedHref(match[1], match[2] ?? '', match[3] ?? '')
  } catch {
    return null
  }
}

/** Launch addresses that would otherwise play the splash and drop the user on /climbs. */
export function isResumeEntry(pathname: string): boolean {
  if (pathname !== '/' && pathname !== '/app') return false
  const kind = readClientKind()
  if (kind === 'desktop') return false
  if (kind === 'mobile' && pathname === '/') return false
  return true
}
