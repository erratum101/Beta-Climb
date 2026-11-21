import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../app/session'
import { SvgIcon } from '../shared/ui/SvgIcon'

const HOLD_MS = 760
const EXIT_MS = 300
export const SPLASH_ENTER_KEY = 'beta-climb.from-splash'

export function SplashPage() {
  const navigate = useNavigate()
  const { profile, ready, night } = useSession()
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => setExiting(true), HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [ready])

  useEffect(() => {
    if (!exiting) return
    const timer = window.setTimeout(() => {
      if (profile) {
        sessionStorage.setItem(SPLASH_ENTER_KEY, '1')
        navigate('/climbs', { replace: true })
      } else {
        navigate('/onboarding', { replace: true })
      }
    }, EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [exiting, navigate, profile])

  function continueNow() {
    if (!ready || exiting) return
    setExiting(true)
  }

  return (
    <div
      className={[
        'screen screen-center splash-screen',
        night ? 'is-dark' : '',
        exiting ? 'is-exiting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <h1 className="visually-hidden">Beta Climb</h1>
      <button type="button" className="splash-hit" onClick={continueNow} aria-label="Продолжить">
        <SvgIcon src="/logo.svg" size={128} />
      </button>
    </div>
  )
}
