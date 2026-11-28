import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { syncDocumentChrome } from '../app/session'
import { AttemptStage } from '../features/analysis/AttemptStage'
import { attemptMediaUrl, climbApi, type AnalysisMoment, type Attempt } from '../shared/api'
import { useUi } from '../shared/i18n'
import '../features/analysis/review.css'

const STRIP_FRAMES = 8

function waitForPaint(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 400)
    const finish = () => {
      window.clearTimeout(timer)
      resolve()
    }
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(() => finish())
      return
    }
    requestAnimationFrame(() => requestAnimationFrame(finish))
  })
}

function seekVideo(video: HTMLVideoElement, time: number) {
  const target = Math.max(0, time)
  if (Math.abs(video.currentTime - target) < 0.02 && video.readyState >= 2) return waitForPaint(video)
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(finish, 1200)
    function finish() {
      window.clearTimeout(timer)
      video.removeEventListener('seeked', finish)
      void waitForPaint(video).then(resolve)
    }
    video.addEventListener('seeked', finish)
    try {
      video.currentTime = target
    } catch {
      finish()
    }
  })
}

function frameBlob(video: HTMLVideoElement): Promise<string | 'blocked' | null> {
  if (video.videoWidth < 2 || video.videoHeight < 2) return Promise.resolve(null)
  const canvas = document.createElement('canvas')
  canvas.width = 240
  canvas.height = Math.max(1, Math.round(240 * video.videoHeight / video.videoWidth))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return Promise.resolve(null)
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    context.getImageData(0, 0, 1, 1)
  } catch {
    return Promise.resolve('blocked')
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.72))
}

async function captureFilm(src: string, origin: number, span: number, alive: () => boolean, onFrame: (url: string) => void) {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0.02;pointer-events:none'
  const video = document.createElement('video')
  video.muted = true
  video.defaultMuted = true
  video.playsInline = true
  video.preload = 'auto'
  video.setAttribute('playsinline', '')
  video.style.cssText = 'width:320px;height:180px'
  if (new URL(src, window.location.href).origin !== window.location.origin) video.crossOrigin = 'anonymous'
  host.appendChild(video)
  document.body.appendChild(host)
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('film')), 8000)
      const ready = () => {
        if (video.videoWidth < 2) return
        window.clearTimeout(timer)
        resolve()
      }
      video.onloadeddata = ready
      video.onerror = () => {
        window.clearTimeout(timer)
        reject(new Error('film'))
      }
      video.src = src
    })
    if (!alive()) return false
    for (let index = 0; index < STRIP_FRAMES; index += 1) {
      if (!alive()) return false
      const local = span * (index / Math.max(1, STRIP_FRAMES - 1))
      const at = origin + Math.min(local, Math.max(0, span - 0.05))
      await seekVideo(video, at)
      if (!alive()) return false
      const frame = await frameBlob(video)
      if (frame === 'blocked') return false
      if (frame) onFrame(frame)
    }
    return true
  } catch {
    return false
  } finally {
    video.removeAttribute('src')
    video.load()
    host.remove()
  }
}

export function AnalysisPage() {
  const { id } = useParams()
  return id ? <AnalysisDetail key={id} id={id} /> : <Navigate to="/climbs" replace />
}

function AnalysisDetail({ id }: { id: string }) {
  const [attempt, setAttempt] = useState<Attempt | null>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const t = useUi()
  useEffect(() => {
    let active = true
    setError('')
    void climbApi.getAttempt(id).then((data) => { if (active) setAttempt(data) }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : t.loadReviewFailed)
    })
    return () => { active = false }
  }, [id, retry])
  if (error) return (
    <div className="screen screen-center">
      <p role="alert">{error}</p>
      <button className="btn btn-light" onClick={() => setRetry((value) => value + 1)}>{t.tryAgain}</button>
    </div>
  )
  if (attempt === undefined) return (
    <div className="screen screen-center review-loading" role="status">
      <span className="review-loading-dot" aria-hidden="true" />
      {t.loadingReview}
    </div>
  )
  if (attempt === null) return <Navigate to="/climbs" replace />
  if (attempt.status !== 'ready' && attempt.status !== 'limited') return <Navigate to={`/attempt/${id}/processing`} replace />
  return <Analysis attempt={attempt} />
}

function Analysis({ attempt }: { attempt: Attempt }) {
  const navigate = useNavigate()
  const t = useUi()
  const moments = [...attempt.moments].sort((a, b) => a.startSec - b.startSec)
  const initial = moments.find((moment) => moment.primary) ?? moments[0]
  const [selectedId, setSelectedId] = useState(initial?.id)
  const selected = moments.find((moment) => moment.id === selectedId)
  const [time, setTime] = useState(initial?.timeSec ?? 0)
  const [frames, setFrames] = useState<string[]>([])
  const [showVideoFrames, setShowVideoFrames] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const seekTarget = useRef(time)
  const episodeEnd = useRef<number | null>(null)
  const current = moments.find((m) => m.id === selectedId && time >= m.startSec && time < m.endSec)
    ?? moments.find((m) => time >= m.startSec && time < m.endSec)
  const holdIds = current?.holdIds ?? []
  const duration = attempt.durationSec && attempt.durationSec > 0
    ? attempt.durationSec
    : Math.max(1, ...moments.map((moment) => moment.endSec))

  const origin = attempt.trimStartSec ?? 0

  function seek(seconds: number) {
    const absolute = Math.max(0, origin + seconds)
    seekTarget.current = seconds
    const player = videoRef.current
    if (player && player.readyState >= 1) {
      player.currentTime = Number.isFinite(player.duration) ? Math.min(player.duration, absolute) : absolute
    }
    setTime(seconds)
  }

  function openMoment(moment: AnalysisMoment) {
    setSelectedId(moment.id)
    episodeEnd.current = moment.endSec
    seek(moment.timeSec)
    const player = videoRef.current
    if (player) void player.play().catch(() => { episodeEnd.current = null })
  }

  function playbackTime(seconds: number) {
    setTime(seconds)
    if (episodeEnd.current !== null || videoRef.current?.paused) return
    const next = moments.find((m) => seconds >= m.startSec && seconds < m.endSec)
    if (next) setSelectedId(next.id)
  }

  function scrub(seconds: number) {
    episodeEnd.current = null
    seek(seconds)
    const next = moments.find((m) => seconds >= m.startSec && seconds < m.endSec)
    if (next) setSelectedId(next.id)
  }

  function stepMoment(direction: -1 | 1) {
    if (!moments.length) return
    const index = Math.max(0, moments.findIndex((moment) => moment.id === selected?.id))
    openMoment(moments[(index + direction + moments.length) % moments.length])
  }

  const advice = selected?.action || selected?.title
  const adviceIndex = selected ? moments.findIndex((moment) => moment.id === selected.id) + 1 : 0
  const mediaSrc = attempt.mediaUrl || attemptMediaUrl(attempt.id)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.clearStatusBar = '1'
    syncDocumentChrome()
    return () => {
      delete root.dataset.clearStatusBar
      syncDocumentChrome()
    }
  }, [])

  useEffect(() => {
    if (!mediaSrc || duration <= 0) return
    let alive = true
    const urls: string[] = []
    setFrames([])
    setShowVideoFrames(false)
    void captureFilm(mediaSrc, origin, duration, () => alive, (url) => {
      if (!alive) {
        URL.revokeObjectURL(url)
        return
      }
      urls.push(url)
      setFrames(urls.slice())
    }).then((painted) => {
      if (alive && !painted && urls.length === 0) setShowVideoFrames(true)
    })
    return () => {
      alive = false
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [mediaSrc, origin, duration])

  const markLeft = selected && duration > 0 ? (selected.startSec / duration) * 100 : 0
  const markWidth = selected && duration > 0
    ? Math.max(1.5, ((selected.endSec - selected.startSec) / duration) * 100)
    : 0

  return (
    <main className="flow-analysis flow-edit">
      <div className="flow-stage">
        <button type="button" className="flow-close" aria-label={t.close} onClick={() => navigate('/climbs')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <AttemptStage attempt={attempt} videoRef={videoRef} episodeEnd={episodeEnd} time={time} holdIds={holdIds}
          onTime={playbackTime} onResume={() => {}} onScrub={scrub}
          onMediaReady={(ready) => { if (ready) seek(seekTarget.current) }}>
          {null}
        </AttemptStage>
      </div>
      <p className="flow-advice">
        {advice ? `${adviceIndex}. ${advice}` : t.noAdvice}
      </p>
      <div className="flow-trimbar">
        <button type="button" className="flow-round" aria-label={t.previousTip} disabled={!moments.length} onClick={() => stepMoment(-1)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M14 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="flow-film">
          {frames.length > 0 ? (
            <div className="flow-film-frames" aria-hidden="true">
              {frames.map((src) => <img key={src} src={src} alt="" />)}
            </div>
          ) : showVideoFrames && mediaSrc ? (
            <div className="flow-film-frames" aria-hidden="true">
              {Array.from({ length: STRIP_FRAMES }, (_, index) => {
                const local = duration * (index / Math.max(1, STRIP_FRAMES - 1))
                const at = origin + Math.min(local, Math.max(0, duration - 0.05))
                return <video key={at} src={`${mediaSrc.split('#')[0]}#t=${at.toFixed(3)}`} muted playsInline preload="auto" />
              })}
            </div>
          ) : null}
          {selected && duration > 0 ? (
            <div className="flow-film-window" style={{ left: `${markLeft}%`, width: `${markWidth}%` }} />
          ) : null}
          <div className="flow-film-playhead" style={{ left: `${duration > 0 ? Math.min(100, (time / duration) * 100) : 0}%` }} />
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={Math.min(time, duration)}
            aria-label={t.videoPosition}
            onChange={(event) => scrub(event.currentTarget.valueAsNumber)}
          />
        </div>
        <button type="button" className="flow-round" aria-label={t.nextTip} disabled={!moments.length} onClick={() => stepMoment(1)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M10 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </main>
  )
}
