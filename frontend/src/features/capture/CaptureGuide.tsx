import { createContext, useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../app/session'
import { attemptHref } from '../../entities/attempt'
import type { CreateAttemptInput } from '../../shared/api'
import { SvgIcon } from '../../shared/ui/SvgIcon'

const GUIDE_KEY = 'beta-climb.capture-guide'

async function captureFrame(file: File): Promise<{ frame?: Blob; durationSec?: number }> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('frame'))
    })
    const durationSec = Number.isFinite(video.duration) ? video.duration : 0
    const target = durationSec > 1 ? Math.min(durationSec * 0.35, Math.max(0, durationSec - 0.05)) : 0
    if (target > 0) {
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

export function CaptureSource({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate()
  const { startAttempt } = useSession()
  const [entered, setEntered] = useState(false)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<CreateAttemptInput | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    mounted.current = true
    return () => { mounted.current = false; cancelAnimationFrame(id) }
  }, [])

  function selectVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.type && !file.type.startsWith('video/') && file.type !== 'application/octet-stream') {
      setError('Выбери видео попытки.')
      return
    }
    setError('')
    setSelected({ file, idempotencyKey: crypto.randomUUID() })
  }

  async function upload() {
    if (!selected || inFlight.current) return
    inFlight.current = true
    setUploading(true)
    setError('')
    try {
      const captured = await captureFrame(selected.file)
      const attempt = await startAttempt({ ...selected, ...captured })
      if (mounted.current) navigate(attemptHref(attempt), { replace: true })
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить видео.')
    } finally {
      inFlight.current = false
      if (mounted.current) setUploading(false)
    }
  }

  return (
    <div className={entered ? 'capture-source is-in' : 'capture-source'}>
      {selected ? (
        <div className="screen screen-center capture-upload">
          <h1 className="page-title">{uploading ? 'Загружаем видео' : 'Видео попытки'}</h1>
          <p>{selected.file.name}</p>
          {error ? <p role="alert">{error}</p> : null}
          <button type="button" className="btn btn-orange" disabled={uploading} onClick={() => void upload()}>
            {uploading ? 'Идёт загрузка…' : error ? 'Повторить загрузку' : 'Отправить на разбор'}
          </button>
          <button type="button" className="btn btn-ghost" disabled={uploading} onClick={() => { setError(''); setSelected(null) }}>
            Выбрать другое видео
          </button>
        </div>
      ) : <>
        <button type="button" className="capture-back btn-text" onClick={onBack}>Назад</button>
        {error ? <p role="alert" className="capture-file-error">{error}</p> : null}
        <button type="button" className="capture-source-gallery" onClick={() => galleryRef.current?.click()}>
          <SvgIcon src="/gallery.svg" size={100} />
          <span>Из галереи</span>
        </button>
        <button type="button" className="capture-source-camera" onClick={() => cameraRef.current?.click()}>
          <SvgIcon src="/Camera.svg" size={100} />
          <span>Снять новое</span>
        </button>
        <input
          ref={galleryRef}
          type="file"
          accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
          onChange={selectVideo}
          hidden
        />
        <input ref={cameraRef} type="file" accept="video/*" capture="environment" onChange={selectVideo} hidden />
      </>}
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
