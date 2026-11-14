import { useEffect, useRef, useState } from 'react'

type Phase = 'b' | 'shake' | 'logo' | 'words' | 'exit'

const EXIT_MS = 640

export function SiteIntro({ onDone, onExit }: { onDone: () => void; onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('b')
  const onDoneRef = useRef(onDone)
  const onExitRef = useRef(onExit)
  const skipped = useRef(false)
  const left = useRef(false)
  const laterRef = useRef<(ms: number, run: () => void) => void>(() => {})
  const clearRef = useRef<() => void>(() => {})

  onDoneRef.current = onDone
  onExitRef.current = onExit

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
    const clear = () => {
      ids.forEach((id) => window.clearTimeout(id))
      ids.length = 0
    }
    laterRef.current = later
    clearRef.current = clear

    const finish = () => onDoneRef.current()
    const leave = () => {
      if (left.current) return
      left.current = true
      onExitRef.current()
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduce) {
      setPhase('words')
      later(420, () => {
        setPhase('exit')
        leave()
      })
      later(480, finish)
      return () => {
        alive = false
        clear()
      }
    }

    let started = false
    const play = () => {
      if (!alive || started || skipped.current) return
      started = true
      const steps: Array<[Phase, number]> = [
        ['shake', 580],
        ['logo', 340],
        ['words', 340],
        ['exit', 780],
      ]
      let at = 0
      for (const [next, wait] of steps) {
        at += wait
        const phaseNext = next
        later(at, () => {
          if (skipped.current) return
          setPhase(phaseNext)
          if (phaseNext === 'exit') leave()
        })
      }
      later(at + EXIT_MS, finish)
    }

    const cap = window.setTimeout(play, 700)
    const fonts = document.fonts?.ready ?? Promise.resolve()
    fonts.then(() => {
      if (!alive) return
      window.clearTimeout(cap)
      play()
    })

    return () => {
      alive = false
      window.clearTimeout(cap)
      clear()
    }
  }, [])

  function skip() {
    if (skipped.current || phase === 'exit') return
    skipped.current = true
    clearRef.current()
    setPhase('exit')
    if (!left.current) {
      left.current = true
      onExitRef.current()
    }
    laterRef.current(EXIT_MS, () => onDoneRef.current())
  }

  const className = [
    'site-intro',
    phase === 'shake' ? 'is-shake' : '',
    phase === 'logo' || phase === 'words' || phase === 'exit' ? 'is-logo' : '',
    phase === 'words' || phase === 'exit' ? 'is-words' : '',
    phase === 'exit' ? 'is-exit' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      <button type="button" className="site-intro-hit" onClick={skip}>
        <span className="visually-hidden">Beta Climb</span>
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
