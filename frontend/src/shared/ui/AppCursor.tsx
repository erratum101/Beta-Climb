import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from '../../app/session'

const CURSOR_LIGHT = '/cursor-shoe.png'
const CURSOR_NIGHT = '/cursor-shoe-darck.png'

/** Toe tip of the climbing shoe, as a fraction of cursor-shoe.png. */
const TIP_X = 8 / 673
const TIP_Y = 20 / 550
const SHIFT_X = -5
const TILT_MS = 100

export function AppCursor() {
  const { night } = useSession()
  const rootRef = useRef<HTMLDivElement>(null)
  const glyphRef = useRef<HTMLImageElement>(null)
  const [on, setOn] = useState(false)
  const [pressed, setPressed] = useState(false)
  const src = night ? CURSOR_NIGHT : CURSOR_LIGHT

  useEffect(() => {
    const pending = new Image()
    pending.src = night ? CURSOR_LIGHT : CURSOR_NIGHT
  }, [night])

  useEffect(() => {
    const root = rootRef.current
    const glyph = glyphRef.current
    if (!root || !glyph) return

    const fine = window.matchMedia('(hover: hover) and (any-pointer: fine)')
    const pressedRef = { current: false }
    const onRef = { current: false }
    let x = 0
    let y = 0
    let pressedAt = 0
    let releaseTimer = 0

    const place = () => {
      const width = glyph.offsetWidth || glyph.naturalWidth
      const height = glyph.offsetHeight || glyph.naturalHeight
      root.style.transform = `translate3d(${x - width * TIP_X + SHIFT_X}px, ${y - height * TIP_Y}px, 0)`
    }

    const show = (next: boolean) => {
      if (onRef.current === next) return
      onRef.current = next
      setOn(next)
    }

    const press = (next: boolean) => {
      if (pressedRef.current === next) return
      pressedRef.current = next
      setPressed(next)
    }

    const typingTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false
      return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
    }

    const onMove = (event: PointerEvent) => {
      if (!fine.matches || event.pointerType === 'touch') {
        show(false)
        return
      }
      x = event.clientX
      y = event.clientY
      show(!typingTarget(event.target))
      place()
    }

    const release = () => {
      window.clearTimeout(releaseTimer)
      const elapsed = performance.now() - pressedAt
      releaseTimer = window.setTimeout(() => {
        press(false)
      }, Math.max(0, TILT_MS - elapsed))
    }

    const onDown = (event: PointerEvent) => {
      if (!fine.matches || event.pointerType === 'touch' || event.button !== 0) return
      if (typingTarget(event.target)) return
      window.clearTimeout(releaseTimer)
      pressedAt = performance.now()
      press(true)
    }

    const onUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.button !== 0) return
      if (!pressedRef.current) return
      release()
    }

    const onLeave = () => {
      show(false)
      window.clearTimeout(releaseTimer)
      press(false)
    }

    const onFineChange = () => {
      if (!fine.matches) onLeave()
    }

    glyph.addEventListener('load', place)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    fine.addEventListener('change', onFineChange)
    document.documentElement.classList.add('has-app-cursor')

    return () => {
      window.clearTimeout(releaseTimer)
      glyph.removeEventListener('load', place)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      fine.removeEventListener('change', onFineChange)
      document.documentElement.classList.remove('has-app-cursor')
    }
  }, [])

  const className = `app-cursor${on ? ' is-on' : ''}${pressed ? ' is-pressed' : ''}`

  return createPortal(
    <div ref={rootRef} className={className} aria-hidden="true">
      <img
        ref={glyphRef}
        className="app-cursor-glyph"
        src={src}
        alt=""
        draggable={false}
      />
    </div>,
    document.body,
  )
}
