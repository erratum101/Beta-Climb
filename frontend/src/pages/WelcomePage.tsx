import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../app/session'
import { useUi } from '../shared/i18n'

export function WelcomePage() {
  const navigate = useNavigate()
  const { profile, ready } = useSession()
  const t = useUi()

  useEffect(() => {
    if (ready && !profile) navigate('/auth', { replace: true })
  }, [navigate, profile, ready])

  return (
    <div className="screen welcome">
      <h1 className="welcome-title">
        {t.welcome1}
        <br />
        {t.welcome2}
        <br />
        {t.welcome3}
      </h1>
      <div className="welcome-art">
        <img className="welcome-photo" src="/male-onboarding.webp" alt="" />
      </div>
      <button type="button" className="btn btn-light" onClick={() => navigate('/climbs', { replace: true })}>
        {t.welcomeYes}
      </button>
    </div>
  )
}
