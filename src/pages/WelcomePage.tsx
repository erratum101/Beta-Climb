import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../app/session'

export function WelcomePage() {
  const navigate = useNavigate()
  const { profile, ready } = useSession()

  useEffect(() => {
    if (ready && !profile) navigate('/onboarding', { replace: true })
  }, [navigate, profile, ready])

  return (
    <div className="screen welcome">
      <h1 className="welcome-title">
        Хочешь улучшить
        <br />
        свою технику
        <br />
        и стать сильнее?
      </h1>
      <div className="welcome-art">
        <img className="welcome-photo" src="/male-onboarding.webp" alt="" />
      </div>
      <button type="button" className="btn btn-light" onClick={() => navigate('/climbs', { replace: true })}>
        Да, хочу!
      </button>
    </div>
  )
}
