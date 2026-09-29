import { createContext, useState } from 'react'

const GUIDE_KEY = 'beta-climb.capture-guide'

export const CAPTURE_GUIDE_STEPS = [
  'Камера стоит неподвижно',
  'Один спортсмен в кадре',
  'Цвета трасс хорошо различимы',
  'Весь нужный участок стены в кадре',
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
        <img src="/instructions.webp" alt="" />
      </div>
    </div>
  )
}

export function CaptureGuide({ onDone, onLeave }: { onDone: () => void; onLeave: () => void }) {
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1

  return (
    <div className="app-shell">
      <div className="app-field">
        <CaptureGuideBody step={step} />
      </div>
      <nav className="bottom-nav capture-guide-nav" aria-label="Инструкция">
        <button type="button" className="btn capture-guide-back" onClick={() => (step === 0 ? onLeave() : setStep(step - 1))}>
          Назад
        </button>
        <button
          type="button"
          className="btn capture-guide-next"
          onClick={() => {
            if (last) onDone()
            else setStep(step + 1)
          }}
        >
          Далее
        </button>
      </nav>
    </div>
  )
}
