import { useEffect, useEffectEvent, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { type Attempt, attemptMediaUrl } from '../../shared/api'
import { IconPlay, IconPause } from '../../shared/ui/icons'
import { SHARED_ATTEMPT } from '../../shared/ui/motion'
import { useReviewFullscreen } from './useReviewFullscreen'

export function videoTime(seconds: number) {
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

interface AttemptStageProps {
  attempt: Attempt
  videoRef: RefObject<HTMLVideoElement | null>
  episodeEnd: RefObject<number | null>
  time: number
  holdIds: string[]
  onTime: (seconds: number) => void
  onMediaReady: (ready: boolean) => void
  onResume: () => void
  onScrub: (seconds: number) => void
  children: ReactNode
}

export function AttemptStage({ attempt, videoRef, episodeEnd, time, holdIds, onTime, onMediaReady, onResume, onScrub, children }: AttemptStageProps) {
  const { workspaceRef, buttonRef, expanded, toggleFullscreen } = useReviewFullscreen()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [duration, setDuration] = useState(attempt.durationSec)
  const [error, setError] = useState(false)
  const [playing, setPlaying] = useState(false)
  const ready = size.width > 0 && !error
  const visibleHolds = attempt.holds.filter((hold) => holdIds.includes(hold.id))
  const value = Math.min(Math.max(0, time), duration)
  const playLabel = playing ? 'Приостановить видео' : 'Воспроизвести видео'
  const expandLabel = expanded ? 'Выйти из полноэкранного режима' : 'На весь экран'

  function finishEpisode(video: HTMLVideoElement, end: number) {
    episodeEnd.current = null
    video.pause()
    // The interval excludes its end. Leave the last frame of the episode on screen.
    video.currentTime = Math.max(0, end - 0.001)
    onTime(video.currentTime)
  }

  const checkFrame = useEffectEvent((video: HTMLVideoElement, mediaTime: number) => {
    const end = episodeEnd.current
    // The worker produces constant 30fps. A timeupdate alone can lag by several frames.
    const nextFrame = 1 / 30 + 0.00001
    if (end !== null && !video.seeking && mediaTime + nextFrame >= end && video.currentTime + nextFrame >= end) {
      finishEpisode(video, end)
    }
  })
  useEffect(() => {
    const video = videoRef.current
    if (!video || !playing || !video.requestVideoFrameCallback) return
    let handle: number
    function frame(_now: number, metadata: VideoFrameCallbackMetadata) {
      if (!video || video.paused) return
      checkFrame(video, metadata.mediaTime)
      if (!video.paused) handle = video.requestVideoFrameCallback(frame)
    }
    handle = video.requestVideoFrameCallback(frame)
    return () => video.cancelVideoFrameCallback(handle)
  }, [videoRef, playing])

  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (!video.paused) video.pause()
    else void video.play().catch(() => setPlaying(false))
  }

  return (
    <div ref={workspaceRef} className={`review-workspace${expanded ? ' is-expanded' : ''}`}
      role={expanded ? 'dialog' : 'region'} aria-modal={expanded || undefined} aria-label="Видео и разбор"
      style={{ viewTransitionName: SHARED_ATTEMPT }}>
      <div className="review-media">
        <div className="review-picture">
          <video ref={videoRef} src={attempt.mediaUrl || attemptMediaUrl(attempt.id)}
            playsInline preload="metadata" aria-label={attempt.fileName}
            onLoadedMetadata={({ currentTarget: video }) => {
              setSize({ width: video.videoWidth, height: video.videoHeight })
              if (Number.isFinite(video.duration)) setDuration(video.duration)
              setError(false)
              onMediaReady(true)
            }}
            onTimeUpdate={({ currentTarget: video }) => {
              const end = episodeEnd.current
              if (end !== null && !video.seeking && video.currentTime >= end) finishEpisode(video, end)
              else onTime(video.currentTime)
            }}
            onPlay={() => { setPlaying(true); onResume() }}
            onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            onEmptied={() => {
              setSize({ width: 0, height: 0 })
              setPlaying(false)
              setError(false)
              onMediaReady(false)
            }}
            onError={() => { setPlaying(false); setError(true); onMediaReady(false) }} />
          {ready && visibleHolds.length > 0 && (
            <svg className="review-masks" viewBox={`0 0 ${size.width} ${size.height}`}
              preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              {visibleHolds.map((hold) => hold.polygon && hold.polygon.length >= 3 ? (
                <polygon key={hold.id} points={hold.polygon.map(([x, y]) => `${x * size.width},${y * size.height}`).join(' ')} />
              ) : (
                <circle key={hold.id} cx={hold.x * size.width} cy={hold.y * size.height} r={0.012 * Math.min(size.width, size.height)} />
              ))}
            </svg>
          )}
          {error && <div className="review-media-error" role="alert">
            <p>Не удалось воспроизвести видео.</p>
            <button type="button" onClick={() => videoRef.current?.load()}>Загрузить ещё раз</button>
          </div>}
        </div>
        <div className="review-controls" role="group" aria-label="Управление видео">
          <button type="button" className="review-icon-button review-play" aria-label={playLabel} title={playLabel}
            disabled={!ready} onClick={togglePlayback}>{playing ? <IconPause /> : <IconPlay />}</button>
          <span className="review-clock">{videoTime(value)}</span>
          <div className="review-seek">
            <input type="range" className="review-scrubber" min="0" max={duration || 1} step="0.1" value={value}
              disabled={!ready || duration <= 0} aria-label="Позиция видео" aria-valuetext={videoTime(value)}
              style={{ '--played': `${duration > 0 ? value / duration * 100 : 0}%` } as CSSProperties}
              onChange={(event) => onScrub(event.currentTarget.valueAsNumber)} />
            {duration > 0 && <div className="review-ticks" aria-hidden="true">
              {attempt.moments.map((moment) => <i key={moment.id}
                style={{ left: `${Math.min(100, Math.max(0, moment.timeSec / duration * 100))}%` }} />)}
            </div>}
          </div>
          <button ref={buttonRef} type="button" className="review-icon-button review-expand"
            aria-label={expandLabel} title={expandLabel} onClick={toggleFullscreen}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={expanded ? 'M4 9h5V4m6 0v5h5M4 15h5v5m6 0v-5h5'
                : 'M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5'} />
            </svg>
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}
