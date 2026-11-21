import { Children, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import './ScrollFloat.css'

gsap.registerPlugin(ScrollTrigger)

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const clampToScroll = (position: string) =>
  typeof position === 'string' && !position.startsWith('clamp(') ? `clamp(${position})` : position

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)

const smoothstep = (from: number, to: number, value: number) => {
  const k = clamp01((value - from) / (to - from))
  return k * k * (3 - 2 * k)
}

const random = (index: number, salt: number) => {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}

const getDelays = (count: number, order: ScrollFloatOrder, stagger: number) => {
  const middle = (count - 1) / 2
  const ranks = Array.from({ length: count }, (_, index) => {
    if (order === 'end') return count - 1 - index
    if (order === 'center') return Math.abs(index - middle)
    if (order === 'edges') return middle - Math.abs(index - middle)
    return index
  })
  if (order === 'random') {
    const shuffled = ranks.map((_, index) => index).sort((a, b) => random(a, 9) - random(b, 9))
    shuffled.forEach((target, rank) => {
      ranks[target] = rank
    })
  }
  const first = Math.min(...ranks)
  return ranks.map((rank) => (rank - first) * Math.max(0, stagger))
}

export type ScrollFloatEffect = 'float' | 'flip' | 'scatter' | 'blur' | 'wave'
export type ScrollFloatSplit = 'chars' | 'words'
export type ScrollFloatDirection = 'up' | 'down'
export type ScrollFloatOrder = 'start' | 'end' | 'center' | 'edges' | 'random'
export type ScrollFloatTag = 'h2' | 'h3' | 'p' | 'span'

export type ScrollFloatProps = {
  children?: ReactNode
  as?: ScrollFloatTag
  scrollContainerRef?: { readonly current: HTMLElement | null } | null
  triggerRef?: { readonly current: HTMLElement | null } | null
  containerClassName?: string
  textClassName?: string
  effect?: ScrollFloatEffect
  splitBy?: ScrollFloatSplit
  direction?: ScrollFloatDirection
  order?: ScrollFloatOrder
  fromColor?: string
  animationDuration?: number
  ease?: string
  scrollStart?: string
  scrollEnd?: string
  /** Pause before the pieces move, in seconds. */
  startDelay?: number
  /**
   * Play the piece timing on the clock when the trigger enters.
   * Leave this off to tie the same move directly to the scroll position.
   */
  playOnEnter?: boolean
  stagger?: number
  distance?: number
  stretch?: number
  smoothing?: number
  id?: string
}

const ScrollFloat = ({
  children,
  as = 'h2',
  scrollContainerRef,
  triggerRef,
  containerClassName = '',
  textClassName = '',
  effect = 'float',
  splitBy = 'chars',
  direction = 'up',
  order = 'start',
  fromColor = 'currentColor',
  animationDuration = 1,
  ease = 'back.inOut(2)',
  scrollStart = 'center bottom+=50%',
  scrollEnd = 'bottom bottom-=40%',
  startDelay = 0,
  playOnEnter = false,
  stagger = 0.03,
  distance = 120,
  stretch = 2.3,
  smoothing = 0,
  id,
}: ScrollFloatProps) => {
  const containerRef = useRef<HTMLElement>(null)
  const Tag = as
  const textRef = useRef<HTMLSpanElement>(null)

  const text = useMemo(() => {
    const parts = Children.toArray(children)
    return parts.every((part) => typeof part === 'string' || typeof part === 'number') ? parts.join('') : null
  }, [children])

  const shiftColor = fromColor && fromColor !== 'currentColor' ? fromColor : null
  const shiftStyle = useMemo<CSSProperties | undefined>(
    () =>
      shiftColor
        ? { color: `color-mix(in oklab, ${shiftColor} calc(var(--scroll-float-mix, 0) * 100%), currentColor)` }
        : undefined,
    [shiftColor],
  )

  const splitText = useMemo(() => {
    if (text === null) return null
    return text.split(/(\s+)/).map((word, wordIndex) =>
      word.trim() === '' ? (
        word
      ) : (
        <span className="scroll-float-word" key={wordIndex}>
          {Array.from(word).map((char, charIndex) => (
            <span className="scroll-float-char" key={charIndex} style={shiftStyle}>
              {char}
            </span>
          ))}
        </span>
      ),
    )
  }, [text, shiftStyle])

  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useIsomorphicLayoutEffect(() => {
    const el = containerRef.current
    const textEl = textRef.current
    if (!el || !textEl) return
    if (scrollContainerRef && !scrollContainerRef.current) return
    if (triggerRef && !triggerRef.current) return

    const scroller = scrollContainerRef?.current || window
    const trigger = triggerRef?.current || el
    const pieces = el.querySelectorAll(splitBy === 'words' ? '.scroll-float-word' : '.scroll-float-char')
    const targets: Element[] = pieces.length ? Array.from(pieces) : [textEl]
    const indexOf = new Map(targets.map((target, index) => [target, index]))
    const at = (fn: (index: number) => number) => (_index: number, target: Element) => fn(indexOf.get(target) ?? 0)
    const middle = (targets.length - 1) / 2
    const edge = (index: number) => (middle > 0 ? (index - middle) / middle : 0)
    const delays = getDelays(targets.length, order, stagger)
    const sign = direction === 'down' ? -1 : 1
    const reach = Math.max(0, Number(distance) || 0) / 120
    const squeeze = stretch > 0 ? stretch ** -0.43 : 1
    const baseEase = gsap.parseEase(ease) || ((progress: number) => progress)
    const timing = (progress: number) => clamp01(baseEase(progress))
    const size = () => parseFloat(getComputedStyle(textEl).fontSize) || 16
    const swell = (progress: number) => {
      const t = timing(progress)
      return 1 - Math.cos(t * Math.PI * 2.5) * Math.pow(1 - t, 2.6)
    }
    const sway = (progress: number) => {
      const t = timing(progress)
      return Math.sin(t * Math.PI * 2.5) * Math.pow(1 - t, 2.6)
    }
    const mm = gsap.matchMedia()

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const playback = { timeline: null as gsap.core.Timeline | null }
      const samples: { t: number; p: number }[] = []
      const lagMs = !playOnEnter ? Math.max(0, startDelay) * 1000 : 0
      const lagged = () => {
        const then = performance.now() - lagMs
        let value = 0
        for (const sample of samples) {
          if (sample.t > then) break
          value = sample.p
        }
        return value
      }
      const remember = (progress: number) => {
        const now = performance.now()
        if (progress <= 0.001) {
          samples.length = 0
          samples.push({ t: now, p: 0 })
          return
        }
        samples.push({ t: now, p: progress })
        const cutoff = now - lagMs - 250
        while (samples.length > 2 && samples[1].t < cutoff) samples.shift()
      }
      let ticking = false
      const tick = () => {
        playback.timeline?.progress(lagged())
        const latest = samples[samples.length - 1]
        const caughtUp = !latest || (performance.now() - latest.t >= lagMs && Math.abs(lagged() - latest.p) < 0.001)
        if (!caughtUp) return
        gsap.ticker.remove(tick)
        ticking = false
      }
      let pending: gsap.core.Tween | null = null
      let removeScroll = () => {}
      const arm = () => {
        const current = playback.timeline
        if (!current) return
        pending?.kill()
        current.pause(0)
        const wait = Math.max(0, startDelay)
        if (wait === 0) {
          current.play()
          return
        }
        pending = gsap.delayedCall(wait, () => current.play())
      }
      const timeline = gsap.timeline(
        playOnEnter
          ? { paused: true }
          : {
              scrollTrigger: {
                trigger,
                scroller,
                start: scrollStart,
                end: clampToScroll(scrollEnd),
                scrub: smoothing > 0 ? smoothing : true,
                invalidateOnRefresh: true,
                onUpdate(self: { progress: number }) {
                  if (lagMs <= 0) return
                  remember(self.progress)
                  playback.timeline?.progress(lagged())
                  if (!ticking) {
                    ticking = true
                    gsap.ticker.add(tick)
                  }
                },
              },
            },
      )
      playback.timeline = timeline
      const add = (fromVars: gsap.TweenVars, toVars: gsap.TweenVars) => {
        gsap.set(targets, { willChange: 'opacity, transform', ...fromVars })
        return timeline.fromTo(
          targets,
          { willChange: 'opacity, transform', ...fromVars },
          { duration: animationDuration, stagger: (index: number) => delays[index] || 0, ...toVars },
          0,
        )
      }

      if (effect === 'flip') {
        add(
          {
            rotationX: -90 * sign,
            transformPerspective: () => size() * 4,
            transformOrigin: () => `50% 50% ${(-size() * 0.55 * reach).toFixed(2)}`,
            backfaceVisibility: 'hidden',
          },
          { ease, rotationX: 0 },
        )
        add({ opacity: 0 }, { ease: (progress: number) => smoothstep(0.05, 0.55, timing(progress)), opacity: 1 })
      } else if (effect === 'scatter') {
        add(
          {
            x: at((index) => ((random(index, 1) * 2 - 1) * 1.3 - edge(index) * 0.9) * size() * reach),
            y: at((index) => sign * (0.35 + random(index, 2)) * size() * 1.1 * reach),
            rotation: at((index) => (random(index, 3) < 0.5 ? -1 : 1) * (40 + random(index, 4) * 120)),
            scale: at((index) => 0.35 + random(index, 5) * 0.9),
            transformOrigin: '50% 50%',
          },
          { ease, x: 0, y: 0, rotation: 0, scale: 1 },
        )
        add({ opacity: 0 }, { ease: (progress: number) => smoothstep(0, 0.4, timing(progress)), opacity: 1 })
      } else if (effect === 'blur') {
        add(
          {
            willChange: 'opacity, transform, filter',
            opacity: 0,
            y: () => sign * size() * 0.3 * reach,
            scale: 1.45,
            filter: () => `blur(${(size() * 0.2).toFixed(2)}px)`,
            transformOrigin: '50% 50%',
          },
          { ease, opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
        )
      } else if (effect === 'wave') {
        add(
          {
            yPercent: 120 * reach * sign,
            scaleY: stretch,
            scaleX: squeeze,
            transformOrigin: sign > 0 ? '50% 100%' : '50% 0%',
          },
          { ease: swell, yPercent: 0, scaleY: 1, scaleX: 1 },
        )
        add({ rotation: 0 }, { ease: sway, rotation: -16 * sign })
        add({ opacity: 0 }, { ease: (progress: number) => clamp01(timing(progress) * 2.5), opacity: 1 })
      } else {
        add(
          {
            opacity: 0,
            yPercent: 120 * reach * sign,
            scaleY: stretch,
            scaleX: squeeze,
            transformOrigin: sign > 0 ? '50% 0%' : '50% 100%',
          },
          { ease, opacity: 1, yPercent: 0, scaleY: 1, scaleX: 1 },
        )
      }

      if (shiftColor) {
        add(
          { '--scroll-float-mix': 1 },
          { ease: (progress: number) => smoothstep(0.5, 1, timing(progress)), '--scroll-float-mix': 0 },
        )
      }

      if (playOnEnter) {
        const root = scroller instanceof Element ? scroller : window
        const match = /^top\s+(\d+(?:\.\d+)?)%$/.exec(scrollStart.trim())
        const ratio = match ? Number(match[1]) / 100 : 0.65
        let played = false
        const onScroll = () => {
          const viewTop = root instanceof Element ? root.getBoundingClientRect().top : 0
          const height = root instanceof Element ? root.clientHeight : window.innerHeight
          const top = trigger.getBoundingClientRect().top - viewTop
          if (!played && top <= height * ratio) {
            played = true
            arm()
            return
          }
          if (played && top > height * ratio + 12) {
            played = false
            pending?.kill()
            timeline.reverse()
          }
        }
        // The landing scroller moves by setting scrollTop and does not emit scroll events, so poll the trigger.
        const timer = window.setInterval(onScroll, 50)
        onScroll()
        removeScroll = () => window.clearInterval(timer)
      }

      return () => {
        pending?.kill()
        removeScroll()
        gsap.ticker.remove(tick)
      }
    })

    return () => mm.revert()
  }, [
    mounted,
    scrollContainerRef,
    triggerRef,
    text,
    effect,
    splitBy,
    direction,
    order,
    shiftColor,
    animationDuration,
    ease,
    scrollStart,
    scrollEnd,
    startDelay,
    playOnEnter,
    stagger,
    distance,
    stretch,
    smoothing,
  ])

  return (
    <Tag
      ref={containerRef as Ref<HTMLHeadingElement>}
      id={id}
      className={`scroll-float ${effect === 'float' ? '' : 'scroll-float--open'} ${containerClassName}`}
    >
      {text !== null && <span className="scroll-float-sr">{text}</span>}
      <span
        ref={textRef}
        className={`scroll-float-text ${textClassName}`}
        style={text === null ? shiftStyle : undefined}
        aria-hidden={text !== null ? true : undefined}
      >
        {splitText ?? children}
      </span>
    </Tag>
  )
}

export default ScrollFloat
