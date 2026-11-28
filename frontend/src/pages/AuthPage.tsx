import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { syncDocumentChrome, useSession } from '../app/session'
import { useUi } from '../shared/i18n'

function GoogleMark() {
  return (
    <svg className="auth-mark-icon" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  )
}

function AppleMark() {
  return (
    <svg className="auth-mark-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.37 12.73c-.03-2.9 2.37-4.29 2.48-4.36-1.35-1.98-3.46-2.25-4.21-2.28-1.79-.18-3.5 1.05-4.41 1.05-.91 0-2.32-1.03-3.81-.99-1.96.03-3.77 1.14-4.78 2.9-2.04 3.54-.52 8.78 1.46 11.65.97 1.4 2.13 2.98 3.65 2.92 1.46-.06 2.02-.95 3.79-.95 1.77 0 2.27.95 3.81.92 1.58-.03 2.57-1.43 3.53-2.84 1.11-1.63 1.57-3.21 1.6-3.29-.03-.02-3.07-1.18-3.11-4.73zM13.77 4.79c.8-.97 1.34-2.32 1.19-3.67-1.15.05-2.55.77-3.38 1.74-.74.86-1.39 2.23-1.22 3.55 1.29.1 2.6-.65 3.41-1.62z"
      />
    </svg>
  )
}

export function AuthPage() {
  const navigate = useNavigate()
  const { profile, ready } = useSession()
  const t = useUi()

  useEffect(() => {
    if (ready && profile) navigate('/climbs', { replace: true })
  }, [navigate, profile, ready])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.clearStatusBar = '1'
    syncDocumentChrome()
    return () => {
      delete root.dataset.clearStatusBar
      syncDocumentChrome()
    }
  }, [])

  function continueWith() {
    if (!ready || profile) return
    navigate('/onboarding', { replace: true })
  }

  return (
    <div className="screen auth-screen">
      <div className="auth-media" aria-hidden="true">
        <video src="/bg.mp4" poster="/bg.webp?v=2" autoPlay muted loop playsInline />
      </div>
      <h1 className="auth-slogan" aria-label="Beta climb - better climb!">
        <span className="auth-slogan-line">
          <span className="auth-slogan-mark" aria-hidden="true" />{'eta climb - better climb!'}
        </span>
      </h1>
      <div className="auth-sheet">
        <button type="button" className="auth-btn is-google" disabled={!ready || Boolean(profile)} onClick={continueWith}>
          <GoogleMark />
          <span>{t.signInGoogle}</span>
        </button>
        <button type="button" className="auth-btn is-apple" disabled={!ready || Boolean(profile)} onClick={continueWith}>
          <AppleMark />
          <span>{t.signInApple}</span>
        </button>
        <button type="button" className="auth-btn is-create" disabled={!ready || Boolean(profile)} onClick={continueWith}>
          {t.createAccount}
        </button>
      </div>
    </div>
  )
}
