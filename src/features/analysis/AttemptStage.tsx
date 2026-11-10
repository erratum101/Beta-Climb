import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Attempt } from '../../shared/api'
import { formatSeconds } from '../../entities/attempt'
import { IconPause, IconPlay } from '../../shared/ui/icons'
import { SHARED_ATTEMPT } from '../../shared/ui/motion'

export function AttemptStage({
  attempt,
  time,
  playing,
  onTime,
  onToggle,
}: {
  attempt: Attempt
  time: number
  playing: boolean
  onTime: (time: number) => void
  onToggle: () => void
}) {
  const duration = attempt.durationSec || 1
  const progress = Math.min(1, Math.max(0, time / duration))
  const bodyX = 50 + Math.sin(progress * Math.PI) * 10
  const bodyY = 84 - progress * 66
  const active = attempt.moments.find((moment) => time >= moment.startSec && time <= moment.endSec)

  return (
    <div className="player" style={{ viewTransitionName: SHARED_ATTEMPT }}>
      <div className="player-top">
        <span>{attempt.fileName}</span>
        <strong>{formatSeconds(time)}</strong>
      </div>
      <svg className="route-map" viewBox="0 0 100 100" aria-hidden="true">
        {attempt.holds.map((hold) => (
          <circle key={hold.id} cx={hold.x} cy={hold.y} r="3.3" fill="#ff8a33" />
        ))}
        <g transform={`translate(${bodyX} ${bodyY})`} fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="0" cy="-7" r="1.7" fill="#fff" stroke="none" />
          <path d="M0 -5 V2 M0 -2 L-4 2 M0 -2 L4 -6 M0 2 L-2.4 8 M0 2 L2.6 7" />
        </g>
      </svg>
      <button type="button" className="play-btn" onClick={onToggle} aria-label={playing ? 'Пауза' : 'Смотреть момент'}>
        <span className="icon-swap">
          <span className={playing ? 'icon-swap-layer' : 'icon-swap-layer is-shown'}>
            <IconPlay />
          </span>
          <span className={playing ? 'icon-swap-layer is-shown' : 'icon-swap-layer'}>
            <IconPause />
          </span>
        </span>
      </button>
      <div className="player-foot">
        <div className="marker-track">
          {attempt.moments.map((moment) => (
            <button
              key={moment.id}
              type="button"
              className={active?.id === moment.id ? 'marker is-on' : 'marker'}
              style={{ left: `${(moment.timeSec / duration) * 100}%` }}
              onClick={() => onTime(moment.timeSec)}
              aria-label={`${moment.title}, ${formatSeconds(moment.timeSec)}`}
            />
          ))}
        </div>
        <Scrub value={Math.min(time, duration)} max={duration} onChange={onTime} />
        <p className="player-caption">{active ? active.title : 'Схема трассы и положения тела'}</p>
      </div>
    </div>
  )
}

function resist(excess: number) {
  const sign = Math.sign(excess)
  const distance = Math.abs(excess)
  return (sign * distance * 0.45) / (1 + distance / 120)
}

function Scrub({ value, max, onChange }: { value: number; max: number; onChange: (value: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  const dragging = useRef(false)
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0

  function place(clientX: number) {
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!track || !thumb) return 0
    const rect = track.getBoundingClientRect()
    const span = rect.width || 1
    const raw = clientX - rect.left
    let next = raw / span
    let over = 0
    if (next < 0) {
      over = resist(raw)
      next = 0
    } else if (next > 1) {
      over = resist(raw - span)
      next = 1
    }
    thumb.style.transition = 'none'
    thumb.style.transform = `translateX(${over}px) scaleX(1.12)`
    onChange(next * max)
    return over
  }

  function stop(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    dragging.current = false
    const over = place(event.clientX)
    const thumb = thumbRef.current
    if (!thumb) return
    const animation = thumb.animate(
      [
        { transform: `translateX(${over}px) scaleX(1.12)` },
        { transform: 'translateX(0px) scaleX(1)' },
      ],
      { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    )
    animation.onfinish = () => {
      thumb.style.transform = ''
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 1 : 0.1
    if (event.key === 'ArrowRight') onChange(Math.min(max, value + step))
    if (event.key === 'ArrowLeft') onChange(Math.max(0, value - step))
    if (event.key === 'Home') onChange(0)
    if (event.key === 'End') onChange(max)
  }

  return (
    <div
      ref={trackRef}
      className="scrub"
      role="slider"
      tabIndex={0}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 10) / 10}
      aria-label="Время попытки"
      onPointerDown={(event) => {
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        place(event.clientX)
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return
        place(event.clientX)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
    >
      <span className="scrub-fill" style={{ width: `${ratio * 100}%` }} />
      <span ref={thumbRef} className="scrub-thumb" style={{ left: `${ratio * 100}%` }} />
    </div>
  )
}

export function usePlayback(duration: number, initial: number) {
  const [time, setTime] = useState(initial)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setTime(initial)
  }, [initial])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const delta = (now - last) / 1000
      last = now
      setTime((current) => {
        const next = current + delta
        if (next >= duration) {
          setPlaying(false)
          return duration
        }
        return next
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, duration])

  return {
    time,
    playing,
    seek: (next: number) => setTime(Math.min(duration, Math.max(0, next))),
    toggle: () => setPlaying((current) => !current),
  }
}
