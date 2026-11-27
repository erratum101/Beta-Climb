import { useEffect, useLayoutEffect, useRef } from 'react'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import { AppRouter } from './router'
import { SessionProvider } from './session'
import { isResumeEntry, readRememberedRoute, rememberRoute } from '../shared/routeMemory'
import { AppCursor } from '../shared/ui/AppCursor'

/** Keeps swipe-back / browser Back from leaving the current in-app screen. */
function BlockBrowserBack() {
  const location = useLocation()
  const navigate = useNavigate()
  const locked = useRef(location)

  useEffect(() => {
    locked.current = location
  }, [location])

  useEffect(() => {
    window.history.pushState({ betaClimbGuard: true }, '')

    const onPopState = () => {
      const { pathname, search, hash } = locked.current
      navigate(`${pathname}${search}${hash}`, { replace: true })
      window.history.pushState({ betaClimbGuard: true }, '')
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [navigate])

  return null
}

/** Puts the user back on the screen they left when the phone relaunches the app at its start URL. */
function RememberRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const locationRef = useRef(location)
  locationRef.current = location

  useLayoutEffect(() => {
    rememberRoute(location.pathname, location.search, location.hash)
  }, [location.pathname, location.search, location.hash])

  useLayoutEffect(() => {
    const saved = readRememberedRoute()
    if (!saved || !isResumeEntry(location.pathname)) return
    const here = `${location.pathname}${location.search}${location.hash}`
    if (saved === here) return
    navigate(saved, { replace: true })
  }, [location.pathname, location.search, location.hash, navigate])

  useEffect(() => {
    const persist = () => {
      const current = locationRef.current
      rememberRoute(current.pathname, current.search, current.hash)
    }
    const resume = () => {
      if (document.visibilityState === 'hidden') {
        persist()
        return
      }
      const current = locationRef.current
      const saved = readRememberedRoute()
      if (!saved || !isResumeEntry(current.pathname)) return
      const here = `${current.pathname}${current.search}${current.hash}`
      if (saved === here) return
      navigate(saved, { replace: true })
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pagehide', persist)
    window.addEventListener('pageshow', resume)
    return () => {
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pagehide', persist)
      window.removeEventListener('pageshow', resume)
    }
  }, [navigate])

  return null
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <BlockBrowserBack />
        <RememberRoute />
        <AppCursor />
        <AppRouter />
      </SessionProvider>
    </BrowserRouter>
  )
}
