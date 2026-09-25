import { useEffect, useState } from 'react'
import type { Attempt } from '../../shared/api'
import { formatSeconds } from '../../entities/attempt'
import { IconPause, IconPlay } from '../../shared/ui/icons'

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
    <div className="player">
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
        {playing ? <IconPause /> : <IconPlay />}
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
        <input
          className="scrub"
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={Math.min(time, duration)}
          aria-label="Время попытки"
          onChange={(event) => onTime(Number(event.target.value))}
        />
        <p className="player-caption">{active ? active.title : 'Схема трассы и положения тела'}</p>
      </div>
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
