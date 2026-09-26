import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from './session'
import { BottomNav } from '../shared/ui/BottomNav'
import { RouteTransition } from '../shared/ui/RouteTransition'
import { SplashPage, SPLASH_ENTER_KEY } from '../pages/SplashPage'
import { WelcomePage } from '../pages/WelcomePage'
import { OnboardingPage, ProfilePage } from '../pages/ProfilePage'
import { HomePage } from '../pages/HomePage'
import { ClimbsPage } from '../pages/ClimbsPage'
import { HistoryPage } from '../pages/HistoryPage'
import { NewAttemptPage } from '../pages/NewAttemptPage'
import { ProcessingPage } from '../pages/ProcessingPage'
import { AnalysisPage } from '../pages/AnalysisPage'
import { ComparePage } from '../pages/ComparePage'

const TAB_PATHS = new Set(['/home', '/climbs', '/history', '/profile'])

function RequireProfile() {
  const { profile, ready } = useSession()
  if (!ready) return null
  if (!profile) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

function TabsLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [fromSplash] = useState(() => {
    const flagged = sessionStorage.getItem(SPLASH_ENTER_KEY) === '1'
    if (flagged) sessionStorage.removeItem(SPLASH_ENTER_KEY)
    return flagged || Boolean((location.state as { fromSplash?: boolean } | null)?.fromSplash)
  })
  const [splashEnter, setSplashEnter] = useState(fromSplash)

  useEffect(() => {
    if (!fromSplash) return
    navigate(location.pathname, { replace: true, state: null })
    const timer = window.setTimeout(() => setSplashEnter(false), 1300)
    return () => window.clearTimeout(timer)
  }, [fromSplash, location.pathname, navigate])

  return (
    <div className={splashEnter ? 'app-shell is-splash-enter' : 'app-shell'}>
      <div className="app-field">
        <RouteTransition transitionKey={location.pathname} animate={!fromSplash}>
          <Outlet />
        </RouteTransition>
      </div>
      <BottomNav />
    </div>
  )
}

function routeTransitionKey(pathname: string): string {
  if (TAB_PATHS.has(pathname)) return 'tabs'
  return pathname
}

export function AppRouter() {
  const location = useLocation()
  const key = routeTransitionKey(location.pathname)
  const fromSplash = Boolean((location.state as { fromSplash?: boolean } | null)?.fromSplash)
  const skipTabsEnter = useRef(false)

  if ((fromSplash || sessionStorage.getItem(SPLASH_ENTER_KEY) === '1') && key === 'tabs') {
    skipTabsEnter.current = true
  }
  if (key !== 'tabs') skipTabsEnter.current = false

  return (
    <RouteTransition transitionKey={key} animate={!(key === 'tabs' && (fromSplash || skipTabsEnter.current))}>
      <Routes location={location}>
        <Route path="/" element={<SplashPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<RequireProfile />}>
          <Route element={<TabsLayout />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/climbs" element={<ClimbsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route path="/attempt/new" element={<NewAttemptPage />} />
          <Route path="/attempt/:id/processing" element={<ProcessingPage />} />
          <Route path="/attempt/:id" element={<AnalysisPage />} />
          <Route path="/compare/:id" element={<ComparePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RouteTransition>
  )
}
