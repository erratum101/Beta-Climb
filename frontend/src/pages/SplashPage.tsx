import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../app/session'
import { isResumeEntry, readRememberedRoute } from '../shared/routeMemory'
import { SiteIntro } from './SiteIntro'

export const SPLASH_ENTER_KEY = 'beta-climb.from-splash'

export function SplashPage() {
  const navigate = useNavigate()
  const { profile, ready } = useSession()
  const [videoReady, setVideoReady] = useState(false)

  useEffect(() => {
    const video = document.createElement('video')
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = '/bg.mp4'
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      setVideoReady(true)
    }
    video.addEventListener('loadeddata', finish)
    video.addEventListener('error', finish)
    const cap = window.setTimeout(finish, 12000)
    const play = video.play()
    if (play) play.catch(() => {})
    return () => {
      settled = true
      window.clearTimeout(cap)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [])

  function openApp() {
    const saved = readRememberedRoute()
    if (saved && isResumeEntry(window.location.pathname)) {
      navigate(saved, { replace: true })
      return
    }
    if (profile) {
      sessionStorage.setItem(SPLASH_ENTER_KEY, '1')
      navigate('/climbs', { replace: true })
      return
    }
    navigate('/auth', { replace: true })
  }

  return (
    <div className="screen splash-screen">
      <SiteIntro ready={ready && videoReady} rise onExit={() => {}} onDone={openApp} />
    </div>
  )
}
