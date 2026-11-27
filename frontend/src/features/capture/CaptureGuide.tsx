import { createContext, useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { syncDocumentChrome, useSession } from '../../app/session'
import { attemptHref } from '../../entities/attempt'
import { GRADE_OPTIONS } from '../../entities/profile'
import type { CreateAttemptInput, GradeBandId } from '../../shared/api'
import { SvgIcon } from '../../shared/ui/SvgIcon'

const GUIDE_KEY = 'beta-climb.capture-guide'

function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function captureFrame(file: File, atSec?: number): Promise<{ frame?: Blob; durationSec?: number }> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = url
  video.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0'
  document.body.appendChild(video)
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('frame')), 2500)
      video.onloadeddata = () => {
        window.clearTimeout(timer)
        resolve()
      }
      video.onerror = () => {
        window.clearTimeout(timer)
        reject(new Error('frame'))
      }
      video.load()
    })
    const durationSec = Number.isFinite(video.duration) ? video.duration : 0
    const target = openingTime(atSec ?? 0, durationSec)
    if (target > 0.001) {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 1500)
        video.onseeked = () => {
          window.clearTimeout(timer)
          resolve()
        }
        video.currentTime = target
      })
    }
    const width = video.videoWidth || 640
    const height = video.videoHeight || 360
    const scale = width > 960 ? 960 / width : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) return { durationSec }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const frame = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    return frame ? { frame, durationSec } : { durationSec }
  } catch {
    return {}
  } finally {
    video.remove()
    URL.revokeObjectURL(url)
  }
}

export const CAPTURE_GUIDE_STEPS = [
  'Камера стоит неподвижно',
  'Один спортсмен в кадре',
  'Цвета трасс хорошо различимы',
  'Вся трасса в кадре',
  'Картинка четкая',
]

export type HomeGuideControls = {
  open: boolean
  step: number
  start: () => void
  back: () => void
  next: () => void
}

export const HomeGuideContext = createContext<HomeGuideControls | null>(null)

const STEPS = CAPTURE_GUIDE_STEPS

const GUIDE_MARKS = [
  { n: 1, x: 52.29, y: 89.68 },
  { n: 2, x: 55.13, y: 37.66 },
  { n: 3, x: 36.06, y: 56.19 },
  { n: 4, x: 68.07, y: 17.09 },
  { n: 5, x: 47.31, y: 18.07 },
]

export function captureGuideSeen(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function markCaptureGuideSeen() {
  try {
    localStorage.setItem(GUIDE_KEY, '1')
  } catch {
    /* private mode */
  }
}

export function clearCaptureGuide() {
  try {
    localStorage.removeItem(GUIDE_KEY)
  } catch {
    /* private mode */
  }
}

export function useSourceHandoff() {
  const [leaving, setLeaving] = useState(false)
  const [source, setSource] = useState(false)

  useEffect(() => {
    if (!leaving || source) return
    const id = window.setTimeout(() => setSource(true), 280)
    return () => window.clearTimeout(id)
  }, [leaving, source])

  const openSource = useCallback(() => setLeaving(true), [])
  const reset = useCallback(() => {
    setLeaving(false)
    setSource(false)
  }, [])

  return { leaving, source, openSource, reset }
}

function openingTime(start: number, duration: number) {
  const span = Number.isFinite(duration) && duration > 0 ? duration : 0
  if (span <= 0) return Math.max(0, start)
  const end = Math.max(0, span - 0.001)
  const at = Math.min(Math.max(0, start), end)
  // Time 0 often stays blank until the decoder paints the next frame.
  if (at <= 0.001) return Math.min(1 / 30, end)
  return at
}

function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const secs = whole % 60
  return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':')
}

function grabPoster(video: HTMLVideoElement): Promise<Blob | null> {
  if (video.videoWidth < 2 || video.videoHeight < 2) return Promise.resolve(null)
  const canvas = document.createElement('canvas')
  const scale = video.videoWidth > 960 ? 960 / video.videoWidth : 1
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) return Promise.resolve(null)
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82))
}

const STRIP_FRAMES = 8

function stillUrl(video: HTMLVideoElement, width: number): Promise<string | null> {
  if (video.videoWidth < 2 || video.videoHeight < 2) return Promise.resolve(null)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth))
  const context = canvas.getContext('2d')
  if (!context) return Promise.resolve(null)
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
  } catch {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.72))
}

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

function seekVideo(video: HTMLVideoElement, time: number, fast = false) {
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
      if (fast && typeof video.fastSeek === 'function') video.fastSeek(target)
      else video.currentTime = target
    } catch {
      finish()
    }
  })
}


export function CaptureSource({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate()
  const { startAttempt } = useSession()
  const [entered, setEntered] = useState(false)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const filmRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<CreateAttemptInput | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [strip, setStrip] = useState<string[]>([])
  const stripUrls = useRef<string[]>([])
  // iOS decodes frames only in the visible preview, so the film is shot from it while the user is idle.
  const stripRun = useRef<{ aborted: boolean } | null>(null)
  const [step, setStep] = useState<'edit' | 'route' | 'confirm'>('edit')
  const [confirmFor, setConfirmFor] = useState<'fix' | 'send'>('send')
  const [posterUrl, setPosterUrl] = useState('')
  const posterRef = useRef('')
  const [frameBlob, setFrameBlob] = useState<Blob | null>(null)
  const openingBlob = useRef<Blob | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [clip, setClip] = useState({ start: 0, end: 0, duration: 0 })
  const [still, setStill] = useState('')
  const [frameSeen, setFrameSeen] = useState(false)
  const stillRef = useRef('')
  const frameSeenRef = useRef(false)
  const captureGen = useRef(0)
  const clipRef = useRef(clip)
  clipRef.current = clip
  const dragRef = useRef<'start' | 'end' | 'play' | null>(null)
  const [grade, setGrade] = useState<GradeBandId | ''>('')
  const [verdict, setVerdict] = useState<'yes' | 'no' | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const sourceRef = useRef<HTMLDivElement>(null)
  const backSwipe = useRef<{ x: number; y: number; tracking: boolean } | null>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    mounted.current = true
    return () => { mounted.current = false; cancelAnimationFrame(id) }
  }, [])

  useEffect(() => {
    if (!selected || step !== 'edit') return
    const root = document.documentElement
    root.dataset.clearStatusBar = '1'
    syncDocumentChrome()
    return () => {
      delete root.dataset.clearStatusBar
      syncDocumentChrome()
    }
  }, [selected, step])

  const previewHeld = useRef('')

  useEffect(() => {
    if (!selected) return
    const url = URL.createObjectURL(selected.file)
    if (previewHeld.current) URL.revokeObjectURL(previewHeld.current)
    previewHeld.current = url
    setPreviewUrl(url)
  }, [selected])

  useEffect(() => () => {
    if (previewHeld.current) URL.revokeObjectURL(previewHeld.current)
  }, [])

  useEffect(() => () => {
    if (posterRef.current) URL.revokeObjectURL(posterRef.current)
    if (stillRef.current) URL.revokeObjectURL(stillRef.current)
    if (stripRun.current) stripRun.current.aborted = true
    stripUrls.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  function stopStrip() {
    const run = stripRun.current
    if (!run) return false
    run.aborted = true
    stripRun.current = null
    return true
  }

  function clearStrip() {
    stopStrip()
    stripUrls.current.forEach((url) => URL.revokeObjectURL(url))
    stripUrls.current = []
    setStrip([])
  }

  async function shootStrip(video: HTMLVideoElement) {
    stopStrip()
    const run = { aborted: false }
    stripRun.current = run
    const live = () => !run.aborted && mounted.current && video.isConnected
    const duration = video.duration
    for (let index = 0; index < STRIP_FRAMES && live(); index += 1) {
      const at = Math.min(duration * (index / Math.max(1, STRIP_FRAMES - 1)), Math.max(0, duration - 0.05))
      await seekVideo(video, openingTime(at, duration), index > 0)
      if (!live()) break
      const url = await stillUrl(video, 240)
      if (!url) continue
      if (!live()) {
        URL.revokeObjectURL(url)
        break
      }
      stripUrls.current.push(url)
      setStrip(stripUrls.current.slice())
    }
    if (stripRun.current !== run) return
    stripRun.current = null
    if (!live()) return
    await seekVideo(video, openingTime(clipRef.current.start, duration))
    if (stripRun.current || !video.isConnected || !video.paused) return
    setPlayhead(Number.isFinite(video.currentTime) ? video.currentTime : 0)
  }

  function rememberPoster(url: string) {
    if (posterRef.current) URL.revokeObjectURL(posterRef.current)
    posterRef.current = url
    setPosterUrl(url)
  }

  function rememberStill(url: string) {
    if (stillRef.current && stillRef.current !== url) URL.revokeObjectURL(stillRef.current)
    stillRef.current = url
    setStill(url)
  }

  function captureStill(video: HTMLVideoElement) {
    if (stripRun.current || frameSeenRef.current || video.videoWidth < 2 || video.videoHeight < 2) return
    const gen = ++captureGen.current
    requestAnimationFrame(() => {
      if (gen !== captureGen.current || stripRun.current || frameSeenRef.current || !video.isConnected) return
      if (video.videoWidth < 2 || video.videoHeight < 2) return
      const canvas = document.createElement('canvas')
      const width = 960
      canvas.width = width
      canvas.height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth))
      const context = canvas.getContext('2d')
      if (!context) return
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
      } catch {
        return
      }
      canvas.toBlob((blob) => {
        if (!blob || !mounted.current || gen !== captureGen.current || frameSeenRef.current) return
        rememberStill(URL.createObjectURL(blob))
      }, 'image/jpeg', 0.74)
    })
  }

  function selectVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.type && !file.type.startsWith('video/') && file.type !== 'application/octet-stream') {
      setError('Выбери видео попытки.')
      return
    }
    setError('')
    setStep('edit')
    clearStrip()
    rememberPoster('')
    openingBlob.current = null
    setFrameBlob(null)
    setPlayhead(0)
    setClip({ start: 0, end: 0, duration: 0 })
    setFrameSeen(false)
    frameSeenRef.current = false
    rememberStill('')
    setGrade('')
    setVerdict(null)
    setSelected({ file, idempotencyKey: createId() })
  }

  function seekPreview(seconds: number, bounds = clipRef.current) {
    const min = bounds.duration > 0 ? bounds.start : 0
    const max = bounds.duration > 0 ? bounds.end : seconds
    const next = Math.min(Math.max(min, seconds), max > 0 ? max : seconds)
    setPlayhead(next)
    if (previewRef.current) previewRef.current.currentTime = next
  }

  function timeFromX(clientX: number) {
    const film = filmRef.current
    const duration = clipRef.current.duration
    if (!film || duration <= 0) return 0
    const rect = film.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  function applyDrag(clientX: number, mode: 'start' | 'end' | 'play') {
    const current = clipRef.current
    const time = timeFromX(clientX)
    const minGap = Math.min(0.5, current.duration / 10)
    if (mode === 'start') {
      const start = Math.max(0, Math.min(time, current.end - minGap))
      const next = { ...current, start }
      clipRef.current = next
      setClip(next)
      seekPreview(next.start, next)
    } else if (mode === 'end') {
      const end = Math.min(current.duration, Math.max(time, current.start + minGap))
      const next = { ...current, end }
      clipRef.current = next
      setClip(next)
      seekPreview(next.end, next)
    } else {
      seekPreview(Math.min(Math.max(time, current.start), current.end), current)
    }
  }

  function onFilmPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (clipRef.current.duration <= 0) return
    stopStrip()
    const handle = (event.target as HTMLElement).dataset.handle
    const mode = handle === 'start' || handle === 'end' ? handle : 'play'
    dragRef.current = mode
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    applyDrag(event.clientX, mode)
  }

  function onFilmPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    applyDrag(event.clientX, dragRef.current)
  }

  function onFilmPointerUp() {
    dragRef.current = null
  }

  function onBackSwipeDown(event: PointerEvent<HTMLDivElement>) {
    if (selected || event.clientX > 48) return
    backSwipe.current = { x: event.clientX, y: event.clientY, tracking: true }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* pointer is already gone */
    }
    event.preventDefault()
  }

  function onBackSwipeMove(event: PointerEvent<HTMLDivElement>) {
    const swipe = backSwipe.current
    const node = sourceRef.current
    if (!swipe?.tracking || !node) return
    const dx = event.clientX - swipe.x
    const dy = event.clientY - swipe.y
    if (Math.abs(dy) > 64 && Math.abs(dy) > Math.abs(dx)) {
      swipe.tracking = false
      node.style.transform = ''
      return
    }
    if (dx > 0) node.style.transform = `translateX(${Math.min(dx, 140)}px)`
  }

  function onBackSwipeEnd(event: PointerEvent<HTMLDivElement>) {
    const swipe = backSwipe.current
    backSwipe.current = null
    const node = sourceRef.current
    if (node) node.style.transform = ''
    if (!swipe?.tracking || selected) return
    const dx = event.clientX - swipe.x
    const dy = event.clientY - swipe.y
    if (dx >= 72 && dx > Math.abs(dy)) onBack()
  }

  function rememberOpening(blob: Blob) {
    openingBlob.current = blob
    setFrameBlob(blob)
  }

  async function acceptClip() {
    const video = previewRef.current
    if (!video) return
    stopStrip()
    video.pause()
    let blob = openingBlob.current
    if (!blob) {
      const at = openingTime(0, clipRef.current.duration || video.duration || 0)
      await seekVideo(video, at)
      blob = await grabPoster(video)
      if (blob) rememberOpening(blob)
    }
    if (blob) rememberPoster(URL.createObjectURL(blob))
    setStep('route')
  }

  function syncPlayhead(video: HTMLVideoElement) {
    const bounds = clipRef.current
    let time = video.currentTime
    if (!Number.isFinite(time)) time = 0
    if (bounds.duration > 0 && time >= bounds.end) {
      time = Math.max(bounds.start, bounds.end - 0.001)
      if (!video.paused) video.pause()
      if (Math.abs(video.currentTime - time) > 0.02) video.currentTime = time
    } else if (bounds.duration > 0 && time < bounds.start - 0.001) {
      time = bounds.start
      video.currentTime = time
    }
    setPlayhead(time)
  }

  function onPreviewMetadata() {
    const video = previewRef.current
    if (!video) return
    const duration = video.duration
    if (!Number.isFinite(duration) || duration <= 0) return
    if (clipRef.current.duration !== duration) {
      const nextClip = clipRef.current.duration > 0
        ? { ...clipRef.current, duration, end: Math.min(clipRef.current.end, duration) }
        : { start: 0, end: duration, duration }
      clipRef.current = nextClip
      setClip(nextClip)
    }
    if (video.dataset.painted === '1') return
    video.dataset.painted = '1'
    const target = openingTime(0, duration)
    const finish = () => {
      if (!video.isConnected || !mounted.current) return
      setPlayhead(Number.isFinite(video.currentTime) ? video.currentTime : 0)
      void grabPoster(video).then((blob) => {
        if (!mounted.current || !video.isConnected) return
        if (!blob) {
          captureStill(video)
          return
        }
        rememberOpening(blob)
        if (!frameSeenRef.current) rememberStill(URL.createObjectURL(blob))
      }).finally(() => {
        if (mounted.current && video.isConnected && video.paused && !frameSeenRef.current) void shootStrip(video)
      })
    }
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime > 0.001) {
      finish()
      return
    }
    video.addEventListener('seeked', () => finish(), { once: true })
    try {
      video.currentTime = target
    } catch {
      finish()
    }
  }

  useEffect(() => {
    const video = previewRef.current
    if (!video || !previewUrl || step !== 'edit') return
    const assigned = previewUrl
    if (video.dataset.src !== assigned) {
      video.dataset.src = assigned
      delete video.dataset.painted
      video.src = assigned
    }
    let handle = 0
    let last = 0
    const tick = (now: number) => {
      if (video.paused || video.ended) return
      if (now - last >= 50) {
        last = now
        syncPlayhead(video)
      }
      handle = requestAnimationFrame(tick)
    }
    const onPlay = () => {
      frameSeenRef.current = true
      setFrameSeen(true)
      cancelAnimationFrame(handle)
      last = 0
      handle = requestAnimationFrame(tick)
    }
    video.addEventListener('play', onPlay)
    return () => {
      cancelAnimationFrame(handle)
      video.removeEventListener('play', onPlay)
    }
  }, [previewUrl, step])

  async function upload() {
    if (!selected || inFlight.current) return
    inFlight.current = true
    setUploading(true)
    setError('')
    try {
    const span = clip.end > clip.start ? clip.end - clip.start : clip.duration
    const cover = openingBlob.current ?? frameBlob
    const captured = cover
      ? { frame: cover, durationSec: span || undefined }
      : await captureFrame(selected.file, 0)
    const attempt = await startAttempt({
      ...selected,
      ...captured,
      durationSec: span || captured.durationSec,
      trim: clip.end > clip.start ? { start: clip.start, end: clip.end } : undefined,
    })
      if (mounted.current) navigate(attemptHref(attempt), { replace: true })
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить видео.')
    } finally {
      inFlight.current = false
      if (mounted.current) setUploading(false)
    }
  }

  return (
    <div
      ref={sourceRef}
      className={entered ? 'capture-source is-in' : 'capture-source'}
      onPointerDown={onBackSwipeDown}
      onPointerMove={onBackSwipeMove}
      onPointerUp={onBackSwipeEnd}
      onPointerCancel={onBackSwipeEnd}
    >
      {selected && step === 'edit' ? (
        <div className="flow-edit">
          <div className="flow-stage">
            {previewUrl ? (
              <>
                {still && !frameSeen ? <img className="flow-stage-still" src={still} alt="" /> : null}
                <video
                  ref={previewRef}
                  muted
                  playsInline
                  preload="auto"
                  onClick={() => {
                    const video = previewRef.current
                    if (!video) return
                    if (stopStrip()) video.currentTime = playhead
                    if (video.paused) {
                      const bounds = clipRef.current
                      if (bounds.duration > 0 && video.currentTime >= bounds.end - 0.05) video.currentTime = bounds.start
                      video.muted = false
                      void video.play().catch(() => {
                        video.muted = true
                        return video.play()
                      }).catch(() => undefined)
                    } else video.pause()
                  }}
                  onLoadedMetadata={onPreviewMetadata}
                  onDurationChange={onPreviewMetadata}
                  onTimeUpdate={(event) => { if (!stripRun.current) syncPlayhead(event.currentTarget) }}
                  onSeeked={(event) => {
                    captureStill(event.currentTarget)
                    if (!event.currentTarget.paused) syncPlayhead(event.currentTarget)
                  }}
                />
              </>
            ) : strip[0] ? <img className="flow-stage-still" src={strip[0]} alt="" /> : null}
          </div>
          <div
            className="flow-film"
            ref={filmRef}
            onPointerDown={onFilmPointerDown}
            onPointerMove={onFilmPointerMove}
            onPointerUp={onFilmPointerUp}
            onPointerCancel={onFilmPointerUp}
          >
            {strip.length > 0 ? (
              <div className="flow-film-frames" aria-hidden="true">
                {Array.from({ length: STRIP_FRAMES }, (_, index) => strip[index]
                  ? <img key={strip[index]} src={strip[index]} alt="" />
                  : <span key={index} />)}
              </div>
            ) : null}
            <div className="flow-film-shade flow-film-shade-left" style={{ width: `${clip.duration > 0 ? (clip.start / clip.duration) * 100 : 0}%` }} />
            <div className="flow-film-shade flow-film-shade-right" style={{ width: `${clip.duration > 0 ? 100 - (clip.end / clip.duration) * 100 : 0}%` }} />
            <div className="flow-film-window" style={{ left: `${clip.duration > 0 ? (clip.start / clip.duration) * 100 : 0}%`, right: `${clip.duration > 0 ? 100 - (clip.end / clip.duration) * 100 : 0}%` }} />
            <div className="flow-film-playhead" style={{ left: `${clip.duration > 0 ? (playhead / clip.duration) * 100 : 0}%` }} />
            <button type="button" className="flow-film-handle" data-handle="start" style={{ left: `${clip.duration > 0 ? (clip.start / clip.duration) * 100 : 0}%` }} aria-label="Начало обрезки" />
            <button type="button" className="flow-film-handle" data-handle="end" style={{ left: `${clip.duration > 0 ? (clip.end / clip.duration) * 100 : 100}%` }} aria-label="Конец обрезки" />
          </div>
          <div className="flow-trimbar">
            <button type="button" className="flow-round" aria-label="Отменить" onClick={() => { clearStrip(); setSelected(null); setError('') }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <div className="flow-time-tab" aria-live="polite">{clock(playhead)}</div>
            <button type="button" className="flow-round" aria-label="Принять" disabled={clip.duration <= 0} onClick={() => void acceptClip()}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
      {selected && step === 'route' ? (
        <div className="flow-route">
          <h1>Трасса</h1>
          <p>
            <span>Выберите категорию сложности трассы</span>
            <span>и проверьте правильность выделения зацепок</span>
          </p>
          <label className="flow-grade-wrap">
            <select
              className={grade ? 'is-set' : undefined}
              value={grade}
              aria-label="Категория трассы"
              onChange={(event) => setGrade(event.target.value as GradeBandId | '')}
            >
              <option value="">Категория трассы</option>
              {GRADE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="flow-shot-frame">
            {posterUrl ? <img className="flow-shot" src={posterUrl} alt="Кадр попытки" /> : <div className="flow-shot" />}
            <div className="flow-verdict" role="group" aria-label="Выделение зацепок">
              <button type="button" aria-label="Не правильно" className={verdict === 'no' ? 'is-on' : undefined} onClick={() => { setVerdict('no'); setConfirmFor('fix'); setStep('confirm') }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14.5 5.2a1.85 1.85 0 0 1 2.6 2.6L8.2 16.7l-3.1.8.8-3.1L14.5 5.2z" />
                    <path d="M13.5 17.1h7" />
                  </svg>
              </button>
              <button type="button" aria-label="Правильно" className={verdict === 'yes' ? 'is-on' : undefined} onClick={() => setVerdict('yes')}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5.5 12.2l5.2 5.2L19.2 8.2" />
                </svg>
              </button>
            </div>
          </div>
          {error ? <p role="alert">{error}</p> : null}
          <button type="button" className="flow-analyze" disabled={!grade || !verdict || uploading} onClick={() => { setConfirmFor('send'); setStep('confirm') }}>
            Проанализировать
          </button>
        </div>
      ) : null}
      {selected && step === 'confirm' ? (
        <div className="flow-confirm">
          {posterUrl ? <img src={posterUrl} alt="Кадр для разбора" /> : null}
          <button type="button" className="flow-close" aria-label="Закрыть" onClick={() => setStep('route')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          {error ? <p className="flow-confirm-error" role="alert">{error}</p> : null}
          <div className="flow-confirm-bar">
            <button type="button" className="flow-photo" aria-label="Другое видео" disabled={uploading} onClick={() => galleryRef.current?.click()}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="4" y="5" width="16" height="14" rx="2" />
                <circle cx="9" cy="10" r="1.4" />
                <path d="M4 16l4.5-4 3 3 2.2-2.2L20 17" />
              </svg>
            </button>
            <button type="button" className="flow-ok" disabled={uploading} onClick={() => { if (confirmFor === 'send') void upload(); else setStep('route') }}>
              {uploading ? 'Ждём…' : 'Подтвердить'}
            </button>
          </div>
        </div>
      ) : null}
      {selected ? null : <>
        {error ? <p role="alert" className="capture-file-error">{error}</p> : null}
        <button type="button" className="capture-source-gallery" onClick={() => galleryRef.current?.click()}>
          <SvgIcon src="/gallery.svg" size={100} />
          <span>Из галереи</span>
        </button>
        <button type="button" className="capture-source-camera" onClick={() => cameraRef.current?.click()}>
          <SvgIcon src="/Camera.svg" size={100} />
          <span>Снять новое</span>
        </button>
      </>}
      <input
        ref={galleryRef}
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
        onChange={selectVideo}
        hidden
      />
      <input ref={cameraRef} type="file" accept="video/*" capture="environment" onChange={selectVideo} hidden />
    </div>
  )
}

export function CaptureGuideBody({ step }: { step: number }) {
  return (
    <div className="screen capture-guide">
      <div className="capture-guide-dots" aria-hidden="true">
        {STEPS.map((label, index) => (
          <span key={label} className={index === step ? 'is-on' : undefined} />
        ))}
      </div>
      <p className="capture-guide-lead">Перед началом записи убедись, что:</p>
      <h1 key={step} className="capture-guide-title">
        {step + 1}. {STEPS[step]}
      </h1>
      <div className="capture-guide-art">
        <div className="capture-guide-frame">
          <img src="/instructions.webp" alt="" />
          {GUIDE_MARKS.map((mark) =>
            mark.n <= step + 1 ? (
              <span
                key={mark.n}
                className={mark.n === step + 1 ? 'capture-guide-badge is-on' : 'capture-guide-badge'}
                style={{ left: `${mark.x}%`, top: `${mark.y}%` }}
                aria-hidden="true"
              >
                {mark.n}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  )
}

export function CaptureGuide({ onLeave }: { onDone: () => void; onLeave: () => void }) {
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1
  const handoff = useSourceHandoff()
  const shellClass = ['app-shell', handoff.leaving ? 'is-leaving' : ''].filter(Boolean).join(' ')

  return (
    <div className={shellClass}>
      <div className="app-field" inert={handoff.leaving}>
        <CaptureGuideBody step={step} />
      </div>
      <nav className="bottom-nav capture-guide-nav" aria-label="Инструкция" inert={handoff.leaving}>
        <button type="button" className="btn capture-guide-back" onClick={() => (step === 0 ? onLeave() : setStep(step - 1))}>
          Назад
        </button>
        <button
          type="button"
          className="btn capture-guide-next"
          onClick={() => {
            if (last) handoff.openSource()
            else setStep(step + 1)
          }}
        >
          Далее
        </button>
      </nav>
      {handoff.source ? <CaptureSource onBack={handoff.reset} /> : null}
    </div>
  )
}
