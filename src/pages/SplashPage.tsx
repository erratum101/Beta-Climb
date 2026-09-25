import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../app/session'
import { SvgIcon } from '../shared/ui/SvgIcon'

export function SplashPage() {
  const navigate = useNavigate()
  const { profile, ready } = useSession()

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => {
      navigate(profile ? '/climbs' : '/onboarding', { replace: true })
    }, 1100)
    return () => window.clearTimeout(timer)
  }, [navigate, profile, ready])

  return (
    <div className="screen screen-center">
      <h1 className="visually-hidden">Beta Climb</h1>
      <button
        type="button"
        className="splash-hit"
        onClick={() => ready && navigate(profile ? '/climbs' : '/onboarding', { replace: true })}
        aria-label="Продолжить"
      >
        <SvgIcon src="/logo.svg" size={128} />
      </button>
    </div>
  )
}
