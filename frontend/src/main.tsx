import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './shared/styles.css'
import './shared/landing.css'

document.addEventListener('touchstart', () => {}, { passive: true })

// Block pinch-to-zoom (iOS Safari gestures + multi-touch)
const preventZoom = (event: Event) => {
  event.preventDefault()
}

document.addEventListener('gesturestart', preventZoom)
document.addEventListener('gesturechange', preventZoom)
document.addEventListener('gestureend', preventZoom)

// Block browser edge-swipe back/forward (Chrome/Safari)
const EDGE_GUARD_PX = 32
let edgeSwipeActive = false

document.addEventListener(
  'touchstart',
  (event) => {
    if (event.touches.length !== 1) {
      edgeSwipeActive = false
      return
    }
    const target = event.target
    if (target instanceof Element && target.closest('.squish-switch, .landing-theme')) {
      edgeSwipeActive = false
      return
    }
    const x = event.touches[0].clientX
    const w = window.innerWidth
    edgeSwipeActive = x <= EDGE_GUARD_PX || x >= w - EDGE_GUARD_PX
  },
  { passive: true, capture: true },
)

document.addEventListener(
  'touchmove',
  (event) => {
    if (event.touches.length > 1) {
      event.preventDefault()
      return
    }
    if (edgeSwipeActive) {
      event.preventDefault()
    }
  },
  { passive: false, capture: true },
)

document.addEventListener(
  'touchend',
  () => {
    edgeSwipeActive = false
  },
  { passive: true, capture: true },
)

document.addEventListener(
  'touchcancel',
  () => {
    edgeSwipeActive = false
  },
  { passive: true, capture: true },
)

document.addEventListener(
  'wheel',
  (event) => {
    if (event.ctrlKey) {
      event.preventDefault()
    }
  },
  { passive: false },
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
