import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './shared/styles.css'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
