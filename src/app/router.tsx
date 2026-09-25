import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useSession } from './session'
import { BottomNav } from '../shared/ui/BottomNav'
import { SplashPage } from '../pages/SplashPage'
import { WelcomePage } from '../pages/WelcomePage'
import { OnboardingPage, ProfilePage } from '../pages/ProfilePage'
import { HomePage } from '../pages/HomePage'
import { ClimbsPage } from '../pages/ClimbsPage'
import { HistoryPage } from '../pages/HistoryPage'
import { NewAttemptPage } from '../pages/NewAttemptPage'
import { ProcessingPage } from '../pages/ProcessingPage'
import { AnalysisPage } from '../pages/AnalysisPage'
import { ComparePage } from '../pages/ComparePage'

function RequireProfile() {
  const { profile, ready } = useSession()
  if (!ready) return null
  if (!profile) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

function TabsLayout() {
  return (
    <div className="app-shell">
      <div className="app-field">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  )
}

export function AppRouter() {
  return (
    <Routes>
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
  )
}
