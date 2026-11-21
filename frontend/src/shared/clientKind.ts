import { useEffect, useState } from 'react'

export type ClientKind = 'installed' | 'mobile' | 'desktop'
export type PhonePlatform = 'android' | 'ios'

/** Android and iOS need different install paths. iPadOS desktop mode still counts as iOS. */
export function readPhonePlatform(): PhonePlatform {
  const ua = navigator.userAgent
  const hints = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  if (hints?.platform === 'iOS' || /iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua)) return 'ios'
  return 'android'
}

function isHandheld() {
  const ua = navigator.userAgent
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true
  if (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua)) return true
  return window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(max-width: 820px)').matches
}

/** Browser tab shows the landing. A home-screen icon opens the app. */
export function readClientKind(): ClientKind {
  const handheld = isHandheld()
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  const displayMode =
    window.matchMedia('(display-mode: standalone)').matches ||
    (handheld && window.matchMedia('(display-mode: fullscreen)').matches)
  const fromHome = handheld && new URLSearchParams(window.location.search).get('source') === 'home'
  if (!handheld) {
    if (window.location.pathname === '/app' && new URLSearchParams(window.location.search).get('source') === 'home') {
      sessionStorage.setItem('beta-climb.desktop-app', '1')
    }
    if (window.location.pathname !== '/' && sessionStorage.getItem('beta-climb.desktop-app') === '1') return 'installed'
  }
  if (standalone || displayMode || fromHome) return 'installed'
  if (handheld) return 'mobile'
  return 'desktop'
}

export function useClientKind(): ClientKind {
  const [kind, setKind] = useState(readClientKind)

  useEffect(() => {
    const update = () => setKind(readClientKind())
    const media = ['(pointer: coarse)', '(max-width: 820px)', '(display-mode: standalone)', '(display-mode: fullscreen)'].map(
      (query) => window.matchMedia(query),
    )
    media.forEach((query) => query.addEventListener('change', update))
    window.addEventListener('resize', update)
    return () => {
      media.forEach((query) => query.removeEventListener('change', update))
      window.removeEventListener('resize', update)
    }
  }, [])

  return kind
}
