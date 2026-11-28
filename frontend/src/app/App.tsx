import { useEffect, useLayoutEffect, useRef } from 'react'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import { AppRouter } from './router'
import { SessionProvider } from './session'
import { LocaleProvider } from '../shared/i18n'
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

  useEffect(() => {
    const persist = () => {
      const current = locationRef.current
      rememberRoute(current.pathname, current.search, current.hash)
    }
    document.addEventListener('visibilitychange', persist)
    window.addEventListener('pagehide', persist)
    return () => {
      document.removeEventListener('visibilitychange', persist)
      window.removeEventListener('pagehide', persist)
    }
  }, [])

  return null
}

export function App() {
  return (
    <BrowserRouter>
      <LocaleProvider>
      <SessionProvider>
        <BlockBrowserBack />
        <RememberRoute />
        <AppCursor />
        <AppRouter />
      </SessionProvider>
      </LocaleProvider>
    </BrowserRouter>
  )
}
