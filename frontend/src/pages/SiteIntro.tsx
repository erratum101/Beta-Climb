import { useEffect, useRef, useState } from 'react'

type Phase = 'load' | 'logo' | 'words' | 'exit'

const EXIT_MS = 640

export function SiteIntro({
  onDone,
  onExit,
  ready,
}: {
  onDone: () => void
  onExit: () => void
  ready: boolean
}) {
  const [phase, setPhase] = useState<Phase>('load')
  const [mainMark, setMainMark] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [reverse, setReverse] = useState(false)
  const onDoneRef = useRef(onDone)
  const onExitRef = useRef(onExit)
  const readyRef = useRef(ready)
  const left = useRef(false)
  const finished = useRef(false)

  onDoneRef.current = onDone
  onExitRef.current = onExit
  readyRef.current = ready

  useEffect(() => {
    let alive = true
    const ids: number[] = []
    const later = (ms: number, run: () => void) => {
      ids.push(
        window.setTimeout(() => {
          if (alive) run()
        }, ms),
      )
    }
    const finish = () => {
      if (finished.current) return
      finished.current = true
      onDoneRef.current()
    }
    const leave = () => {
      if (left.current) return
      left.current = true
      setPhase('exit')
      onExitRef.current()
      later(EXIT_MS, finish)
    }
    const reveal = (reduce: boolean) => {
      setShaking(false)
      setReverse(false)
      setMainMark(true)
      setPhase('logo')
      const wordAt = reduce ? 40 : 340
      later(wordAt, () => setPhase('words'))
      later(wordAt + (reduce ? 320 : 860), leave)
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      const wait = window.setInterval(() => {
        if (!alive || !readyRef.current) return
        window.clearInterval(wait)
        reveal(true)
      }, 80)
      return () => {
        alive = false
        window.clearInterval(wait)
        ids.forEach((id) => window.clearTimeout(id))
      }
    }

    let onMain = false
    const jerk = (toMain: boolean) => {
      window.requestAnimationFrame(() => {
        if (!alive) return
        window.requestAnimationFrame(() => {
          if (!alive) return
          setReverse(!toMain)
          setShaking(true)
          later(120, () => {
            onMain = toMain
            setMainMark(toMain)
          })
          later(340, () => {
            setShaking(false)
            if (readyRef.current && onMain) {
              later(200, () => reveal(false))
              return
            }
            later(480, () => jerk(!onMain))
          })
        })
      })
    }

    later(580, () => jerk(true))

    return () => {
      alive = false
      ids.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  function skip() {
    if (phase !== 'words' || left.current) return
    left.current = true
    setPhase('exit')
    onExitRef.current()
    window.setTimeout(() => {
      if (finished.current) return
      finished.current = true
      onDoneRef.current()
    }, EXIT_MS)
  }

  const className = [
    'site-intro',
    phase === 'load' ? 'is-loading' : '',
    phase === 'load' && shaking ? 'is-shake' : '',
    phase === 'load' && shaking && reverse ? 'is-back' : '',
    phase === 'load' && mainMark ? 'is-main' : '',
    phase === 'logo' || phase === 'words' || phase === 'exit' ? 'is-logo' : '',
    phase === 'words' || phase === 'exit' ? 'is-words' : '',
    phase === 'exit' ? 'is-exit' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className} role="status" aria-busy={phase === 'load'}>
      <button
        type="button"
        className="site-intro-hit"
        onClick={skip}
        aria-label={phase === 'load' ? 'Загрузка' : 'Beta Climb'}
      >
        <span className="visually-hidden">{phase === 'load' ? 'Загрузка видео' : 'Beta Climb'}</span>
        <span className="site-intro-lockup" aria-hidden="true">
          <span className="site-intro-mark">
            <Mark src="/B.svg" className="mark-plain" />
            <Mark src="/logo.svg" className="mark-full" />
          </span>
          <Name />
        </span>
      </button>
    </div>
  )
}

const LINES = ['Beta', 'Climb'] as const

function Name() {
  return (
    <span className="site-intro-name">
      <span className="site-intro-lines">
        {LINES.map((line, lineIndex) => (
          <span className="site-intro-line" key={line}>
            {[...line].map((letter, index) => (
              <span
                className="site-intro-ch"
                key={`${line}-${index}`}
                style={{ animationDelay: `${(lineIndex === 0 ? 0 : 130) + index * 34}ms` }}
              >
                {letter}
              </span>
            ))}
          </span>
        ))}
      </span>
    </span>
  )
}

function Mark({ src, className }: { src: string; className: string }) {
  return (
    <span
      className={`svg-icon ${className}`}
      style={{
        maskImage: `url("${src}")`,
        WebkitMaskImage: `url("${src}")`,
      }}
    />
  )
}
