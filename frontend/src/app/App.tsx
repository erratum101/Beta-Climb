import { useEffect, useRef } from 'react'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import { AppRouter } from './router'
import { SessionProvider } from './session'
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

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <BlockBrowserBack />
        <AppCursor />
        <AppRouter />
      </SessionProvider>
    </BrowserRouter>
  )
}
