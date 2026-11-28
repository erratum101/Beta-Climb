import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useOutlet } from 'react-router-dom'
import { useSession } from './session'
import { CAPTURE_GUIDE_STEP_COUNT, CaptureGuideBody, CaptureSource, HomeGuideContext, useSourceHandoff } from '../features/capture/CaptureGuide'
import { BottomNav } from '../shared/ui/BottomNav'
import { RouteTransition } from '../shared/ui/RouteTransition'
import { useClientKind } from '../shared/clientKind'
import { LandingPage } from '../pages/LandingPage'
import { SplashPage, SPLASH_ENTER_KEY } from '../pages/SplashPage'
import { AuthPage } from '../pages/AuthPage'
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
  if (!profile) return <Navigate to="/auth" replace />
  return <Outlet />
}

function TabsLayout() {
  const location = useLocation()
  const outlet = useOutlet()
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideStep, setGuideStep] = useState(0)
  const sourceHandoff = useSourceHandoff()
  const [splashPath, setSplashPath] = useState(() =>
    sessionStorage.getItem(SPLASH_ENTER_KEY) === '1' ? location.pathname : null,
  )
  const splashEnter = splashPath === location.pathname

  useEffect(() => {
    if (splashPath === null) return
    sessionStorage.removeItem(SPLASH_ENTER_KEY)
    if (location.pathname !== splashPath) {
      setSplashPath(null)
      return
    }
    const timer = window.setTimeout(() => setSplashPath(null), 1100)
    return () => window.clearTimeout(timer)
  }, [splashPath, location.pathname])

  useEffect(() => {
    setGuideOpen(false)
    setGuideStep(0)
    sourceHandoff.reset()
  }, [location.pathname])

  const guide = useMemo(
    () => ({
      open: guideOpen,
      step: guideStep,
      start() {
        sourceHandoff.reset()
        setGuideStep(0)
        setGuideOpen(true)
      },
      back() {
        if (guideStep === 0) {
          setGuideOpen(false)
          return
        }
        setGuideStep(guideStep - 1)
      },
      next() {
        if (guideStep >= CAPTURE_GUIDE_STEP_COUNT - 1) {
          sourceHandoff.openSource()
          return
        }
        setGuideStep(guideStep + 1)
      },
    }),
    [guideOpen, guideStep, sourceHandoff.openSource],
  )

  const shellClass = [
    'app-shell',
    splashEnter ? 'is-splash-enter' : '',
    guide.open ? 'is-guide' : '',
    sourceHandoff.leaving ? 'is-leaving' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <HomeGuideContext.Provider value={guide}>
      <div className={shellClass}>
        <div className="app-field" inert={sourceHandoff.leaving}>
          <div className={guide.open ? 'field-stage is-guide' : 'field-stage'}>
            <RouteTransition transitionKey={location.pathname} animate={!splashEnter} name="pane">
              {outlet}
            </RouteTransition>
            <div className="home-guide" aria-hidden={!guide.open} inert={!guide.open}>
              <CaptureGuideBody step={guide.step} />
            </div>
          </div>
        </div>
        <div inert={sourceHandoff.leaving}>
          <BottomNav guide={guide} />
        </div>
        {sourceHandoff.source ? <CaptureSource onBack={sourceHandoff.reset} /> : null}
      </div>
    </HomeGuideContext.Provider>
  )
}

function routeTransitionKey(pathname: string): string {
  if (TAB_PATHS.has(pathname)) return 'tabs'
  return pathname
}

export function AppRouter() {
  const location = useLocation()
  const kind = useClientKind()
  const key = routeTransitionKey(location.pathname)

  if (kind === 'desktop' || (kind === 'mobile' && location.pathname === '/')) {
    return <LandingPage mode={kind === 'desktop' ? 'desktop' : 'mobile'} />
  }

  const enteringFromSplash = key === 'tabs' && sessionStorage.getItem(SPLASH_ENTER_KEY) === '1'

  return (
    <RouteTransition transitionKey={key} animate={!enteringFromSplash} name="screen">
      <Routes location={location}>
        <Route path="/" element={<SplashPage />} />
        <Route path="/app" element={<SplashPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/auth" element={<AuthPage />} />
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
        <Route path="*" element={<Navigate to={kind === 'mobile' ? '/app' : '/'} replace />} />
      </Routes>
    </RouteTransition>
  )
}
