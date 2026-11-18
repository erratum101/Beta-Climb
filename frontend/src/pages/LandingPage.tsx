import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from '../app/session'
import { SvgIcon } from '../shared/ui/SvgIcon'
import Magnet from '../shared/ui/Magnet'
import ScrollFloat from '../shared/ui/ScrollFloat'
import SquishSwitch from '../shared/ui/SquishSwitch'
import VariableProximity from '../shared/ui/VariableProximity'
import { SiteIntro } from './SiteIntro'

const GUIDES = {
  android: {
    title: 'Android',
    steps: [
      'Откройте эту страницу в Chrome',
      'Нажмите меню ⋮ справа вверху',
      'Выберите «Добавить на главный экран» или «Установить приложение»',
      'Подтвердите — иконка появится на экране',
    ],
  },
  ios: {
    title: 'iPhone',
    steps: [
      'Откройте эту страницу в Safari',
      'Нажмите «Поделиться» внизу экрана',
      'Выберите «На экран „Домой“»',
      'Нажмите «Добавить»',
    ],
  },
} as const

type GuideId = keyof typeof GUIDES

const NAV = [
  { id: 'home', label: 'Главная' },
  { id: 'install', label: 'Установка' },
  { id: 'how', label: 'Как это работает?' },
  { id: 'about', label: 'О нас' },
] as const

type SectionId = (typeof NAV)[number]['id']

const RU_ZONES = new Set([
  'Europe/Kaliningrad',
  'Europe/Moscow',
  'Europe/Simferopol',
  'Europe/Kirov',
  'Europe/Volgograd',
  'Europe/Astrakhan',
  'Europe/Saratov',
  'Europe/Ulyanovsk',
  'Europe/Samara',
  'Asia/Yekaterinburg',
  'Asia/Omsk',
  'Asia/Novosibirsk',
  'Asia/Barnaul',
  'Asia/Tomsk',
  'Asia/Novokuznetsk',
  'Asia/Krasnoyarsk',
  'Asia/Irkutsk',
  'Asia/Chita',
  'Asia/Yakutsk',
  'Asia/Khandyga',
  'Asia/Vladivostok',
  'Asia/Ust-Nera',
  'Asia/Magadan',
  'Asia/Sakhalin',
  'Asia/Srednekolymsk',
  'Asia/Kamchatka',
  'Asia/Anadyr',
])

function isRussianRegion() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || '']
  if (languages.some((tag) => tag.toLowerCase().startsWith('ru'))) return true
  try {
    return RU_ZONES.has(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return false
  }
}

const SHEET_SHIFT = 70
const CHROME_CLOSE_MS = 640

/** Same glide as a page turn: at least 1.2s, cubic-bezier(0.4, 0, 0.2, 1). */
function pageTurnMs(distance: number, viewport: number) {
  const screens = Math.abs(distance) / Math.max(1, viewport)
  return Math.round(Math.min(1550, Math.max(1200, 1080 + screens * 240)))
}

/** cubic-bezier(0.4, 0, 0.2, 1): starts from rest and eases into a long landing. */
function easePage(amount: number) {
  if (amount <= 0) return 0
  if (amount >= 1) return 1
  const x1 = 0.4
  const y1 = 0
  const x2 = 0.2
  const y2 = 1
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  let t = amount
  for (let i = 0; i < 5; i++) {
    const x = ((ax * t + bx) * t + cx) * t - amount
    const dx = (3 * ax * t + 2 * bx) * t + cx
    if (Math.abs(dx) < 1e-4) break
    t = Math.min(1, Math.max(0, t - x / dx))
  }
  return ((ay * t + by) * t + cy) * t
}

const NAV_INK = 'var(--landing-ink)'
const NAV_FILL_MS = 720

function navFillImage(accentOnLeft: boolean) {
  const accent = 'var(--nav-fill)'
  const mix = `color-mix(in srgb, var(--nav-fill) 50%, ${NAV_INK})`
  return accentOnLeft
    ? `linear-gradient(90deg, ${accent} 0%, ${accent} 42%, ${mix} 50%, ${NAV_INK} 58%, ${NAV_INK} 100%)`
    : `linear-gradient(90deg, ${NAV_INK} 0%, ${NAV_INK} 42%, ${mix} 50%, ${accent} 58%, ${accent} 100%)`
}

function paintNavFill(buttons: HTMLButtonElement[], from: number, to: number, forward: boolean, travel: boolean) {
  const start = forward ? '100% 0' : '0% 0'
  const end = forward ? '0% 0' : '100% 0'
  buttons.forEach((button, i) => {
    const leaving = travel && i === from && i !== to
    button.style.transition = 'none'
    button.style.backgroundImage = navFillImage(leaving ? !forward : forward)
    button.style.backgroundSize = '250% 100%'
    button.style.backgroundRepeat = 'no-repeat'
    button.style.backgroundPosition = !travel && i === to ? end : start
  })
  if (!travel || buttons.length === 0) return
  void buttons[0].offsetWidth
  buttons.forEach((button, i) => {
    if (i !== to && i !== from) return
    button.style.transition = `background-position ${NAV_FILL_MS}ms var(--ease-out)`
    button.style.backgroundPosition = end
  })
}

function ThemeToggle({ night, onNight }: { night: boolean; onNight: (next: boolean) => void }) {
  return (
    <>
      <SquishSwitch
        checked={night}
        onChange={onNight}
        ariaLabel="Тёмная тема"
        trackColor="var(--landing-menu)"
        trackOnColor="var(--landing-menu)"
        thumbColor="var(--landing-ink)"
        thumbOnColor="var(--landing-ink)"
        width={64}
        height={32}
        radius={16}
        colorDuration={640}
      />
      <span className="landing-theme-icons" aria-hidden="true">
        <span className="landing-theme-icon is-sun">
          <SvgIcon src="/light-mode.svg" size={15} />
        </span>
        <span className="landing-theme-icon is-moon">
          <SvgIcon src="/dark-mode.svg" size={15} />
        </span>
      </span>
    </>
  )
}

function SectionNav({
  placement,
  active,
  night,
  onSelect,
  onNight,
}: {
  placement: 'top' | 'bottom'
  active: SectionId
  night: boolean
  onSelect: (id: SectionId) => void
  onNight: (next: boolean) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const fromIndex = useRef(0)
  const index = Math.max(0, NAV.findIndex((item) => item.id === active))

  useLayoutEffect(() => {
    const track = trackRef.current
    const bar = track?.querySelector<HTMLElement>('.landing-nav-bar')
    const buttons = [...(track?.querySelectorAll<HTMLButtonElement>(':scope > button') ?? [])]
    const button = buttons[index]
    if (!track || !bar || !button) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const from = fromIndex.current
    const to = index
    fromIndex.current = to
    const travel = track.dataset.barReady === '1' && !reduce && from !== to

    const stacked = Boolean(
      track.closest('.screen.landing:not(.is-desktop)') && track.closest('.landing-nav.is-top'),
    )

    const measure = () => {
      const trackBox = track.getBoundingClientRect()
      const box = button.getBoundingClientRect()
      return {
        x: box.left - trackBox.left,
        y: box.bottom - trackBox.top + 4,
        w: box.width,
      }
    }

    const paint = (x: number, y: number, w: number, ms: number) => {
      bar.style.transition =
        ms === 0 ? 'none' : `transform ${ms}ms var(--ease-out), width ${ms}ms var(--ease-out)`
      bar.style.width = `${w}px`
      bar.style.top = stacked ? '0' : ''
      bar.style.bottom = stacked ? 'auto' : ''
      bar.style.transform = stacked ? `translate(${x}px, ${y}px)` : `translateX(${x}px)`
    }

    const next = measure()
    paint(next.x, next.y, next.w, travel ? NAV_FILL_MS : 0)
    paintNavFill(buttons, from, to, to >= from, travel)
    track.dataset.barReady = '1'

    const onResize = () => {
      const fresh = measure()
      paint(fresh.x, fresh.y, fresh.w, 0)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [index])

  return (
    <nav className={placement === 'top' ? 'landing-nav is-top' : 'landing-nav'} aria-label="Разделы страницы">
      <div className="landing-nav-slide">
      <p className="landing-brand">
        <SvgIcon src="/logo.svg" size={26} />
        <span>
          Beta
          <br />
          Climb
        </span>
      </p>
      <div className="landing-nav-track" ref={trackRef}>
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            data-label={item.label}
            aria-current={active === item.id ? 'true' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span>{item.label}</span>
            <span aria-hidden="true">{item.label}</span>
          </button>
        ))}
        <span className="landing-nav-bar" aria-hidden="true" />
      </div>
      <div className="landing-theme">
        <ThemeToggle night={night} onNight={onNight} />
      </div>
      </div>
    </nav>
  )
}

function AndroidMark() {
  return (
    <span className="landing-store-icon" aria-hidden="true">
      <svg viewBox="0 4.6 24 13.8">
        <path
          fill="currentColor"
          d="M17.6 9.48 19.44 6.3a.637.637 0 0 0-1.11-.59l-1.88 3.24a11.46 11.46 0 0 0-8.94 0L5.65 5.67a.643.643 0 0 0-1.11.63l1.84 3.18C2.7 11.25 1 14.44 1 18h22c0-3.56-1.7-6.75-5.4-8.52z"
        />
        <circle cx="7" cy="14" r="1.15" fill="#fd7115" />
        <circle cx="17" cy="14" r="1.15" fill="#fd7115" />
      </svg>
    </span>
  )
}

function AppleMark() {
  return (
    <span className="landing-store-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
        />
      </svg>
    </span>
  )
}

function Steps({
  platform,
  scrollContainerRef,
  triggerRef,
}: {
  platform: GuideId
  scrollContainerRef: { readonly current: HTMLElement | null }
  triggerRef: { readonly current: HTMLElement | null }
}) {
  const guide = GUIDES[platform]
  return (
    <section className="landing-block" id={`install-${platform}`} aria-labelledby={`install-${platform}-title`}>
      <LandingFloat
        as="h3"
        id={`install-${platform}-title`}
        className="landing-step-title"
        scrollContainerRef={scrollContainerRef}
        triggerRef={triggerRef}
      >
        {guide.title}
      </LandingFloat>
      <ol className="landing-steps">
        {guide.steps.map((step, index) => (
          <li key={step}>
            <LandingFloat
              as="span"
              className="landing-step-index"
              scrollContainerRef={scrollContainerRef}
              triggerRef={triggerRef}
            >
              {String(index + 1)}
            </LandingFloat>
            <LandingFloat as="span" scrollContainerRef={scrollContainerRef} triggerRef={triggerRef}>
              {step}
            </LandingFloat>
          </li>
        ))}
      </ol>
    </section>
  )
}

function LandingFloat({
  as = 'p',
  id,
  className = '',
  scrollContainerRef,
  triggerRef,
  children,
}: {
  as?: 'h2' | 'h3' | 'p' | 'span'
  id?: string
  className?: string
  scrollContainerRef: { readonly current: HTMLElement | null }
  triggerRef: { readonly current: HTMLElement | null }
  children: string
}) {
  return (
    <ScrollFloat
      as={as}
      id={id}
      scrollContainerRef={scrollContainerRef}
      triggerRef={triggerRef}
      containerClassName={['landing-float', className].filter(Boolean).join(' ')}
      textClassName="landing-float-text"
      effect="float"
      splitBy="chars"
      direction="up"
      order="start"
      fromColor="var(--accent)"
      animationDuration={1}
      ease="back.inOut(2)"
      scrollStart="top 100%"
      scrollEnd="top 12%"
      startDelay={0.5}
      stagger={0.045}
      distance={120}
      stretch={2.3}
      smoothing={0}
    >
      {children}
    </ScrollFloat>
  )
}

function HeroVideo({ onReady }: { onReady: () => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    const video = ref.current
    if (!video) return
    let alive = true
    let done = false
    let painted = false
    let timer = 0

    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.controls = false
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')

    const finish = () => {
      if (!alive || done) return
      done = true
      window.clearInterval(timer)
      onReadyRef.current()
    }

    const coversAll = () => {
      const duration = video.duration
      if (!Number.isFinite(duration) || duration <= 0) return false
      for (let index = 0; index < video.buffered.length; index += 1) {
        const start = video.buffered.start(index)
        const end = video.buffered.end(index)
        if (start <= 0.25 && end >= duration - 0.35) return true
      }
      return false
    }

    const sync = () => {
      if (done) return
      const frame = painted || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      if (frame && coversAll()) finish()
    }

    const start = () => {
      video.muted = true
      const pending = video.play()
      if (pending) pending.catch(() => {})
      sync()
    }

    const markPaint = () => {
      painted = true
      sync()
    }

    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(() => markPaint())
    }

    video.addEventListener('loadedmetadata', sync)
    video.addEventListener('progress', sync)
    video.addEventListener('loadeddata', start)
    video.addEventListener('canplay', start)
    video.addEventListener('canplaythrough', sync)
    video.addEventListener('playing', markPaint)
    video.addEventListener('suspend', sync)
    video.addEventListener('error', finish)
    window.addEventListener('pointerdown', start, { passive: true })
    timer = window.setInterval(sync, 120)
    start()

    return () => {
      alive = false
      window.clearInterval(timer)
      video.removeEventListener('loadedmetadata', sync)
      video.removeEventListener('progress', sync)
      video.removeEventListener('loadeddata', start)
      video.removeEventListener('canplay', start)
      video.removeEventListener('canplaythrough', sync)
      video.removeEventListener('playing', markPaint)
      video.removeEventListener('suspend', sync)
      video.removeEventListener('error', finish)
      window.removeEventListener('pointerdown', start)
    }
  }, [])

  return (
    <video
      ref={ref}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      controls={false}
      disablePictureInPicture
      src="/bg.mp4"
    />
  )
}

function usePhoneLayout(mode: 'mobile' | 'desktop') {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 759px)').matches)

  useEffect(() => {
    const query = window.matchMedia('(max-width: 759px)')
    const apply = () => setNarrow(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  return mode === 'mobile' || narrow
}

function HeroTitle({ russian, night, plain }: { russian: boolean; night: boolean; plain: boolean }) {
  const containerRef = useRef<HTMLHeadingElement>(null)
  const [radius, setRadius] = useState(170)
  const label = russian
    ? 'С Beta Climb\nбудешь лазать\nбетее!'
    : 'With Beta\nClimb you’ll\nclimb better!'

  useEffect(() => {
    const apply = () => setRadius(window.innerWidth < 760 ? 68 : 170)
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])

  if (plain) {
    return <h1 className="landing-title is-plain">{label}</h1>
  }

  return (
    <h1 className="landing-title" ref={containerRef}>
      <VariableProximity
        label={label}
        fromFontVariationSettings="'wght' 700, 'opsz' 72"
        toFontVariationSettings="'wght' 800, 'opsz' 144"
        containerRef={containerRef}
        radius={radius}
        falloff="gaussian"
        smoothing={0.2}
        toColor={night ? undefined : '#ffffff'}
        scale={1}
        lift={0}
        idleWave={false}
      />
    </h1>
  )
}

function currentSection(root: HTMLElement) {
  const edge = root.getBoundingClientRect().top + 56
  let current: SectionId = 'home'
  for (const item of NAV) {
    const node = document.getElementById(item.id)
    if (node && node.getBoundingClientRect().top <= edge) current = item.id
  }
  return current
}

const INTRO_SEEN_KEY = 'beta-climb.intro-seen'

function isThemeSwitchTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('.squish-switch, .landing-theme'))
}

/** Keeps the first-load decision across a StrictMode remount. A reload starts fresh. */
let introOnThisLoad: boolean | null = null

function shouldPlayIntro() {
  if (introOnThisLoad !== null) return introOnThisLoad
  let seen = false
  try {
    seen = sessionStorage.getItem(INTRO_SEEN_KEY) === '1'
    if (!seen) sessionStorage.setItem(INTRO_SEEN_KEY, '1')
  } catch {
    seen = false
  }
  introOnThisLoad = !seen
  return introOnThisLoad
}

export function LandingPage({ mode }: { mode: 'mobile' | 'desktop' }) {
  const russian = isRussianRegion()
  const phone = usePhoneLayout(mode)
  const { night, setNight } = useSession()

  useLayoutEffect(() => {
    if (mode !== 'mobile') return
    const root = document.documentElement
    root.classList.add('is-landing')
    if (!root.classList.contains('is-landing-menu')) {
      root.style.colorScheme = 'normal'
      document.querySelectorAll('meta[name="theme-color"], meta[name="color-scheme"]').forEach((node) => node.remove())
    }
    return () => {
      root.classList.remove('is-landing')
      const on = root.classList.contains('is-night')
      const scheme = on ? 'dark' : 'light'
      root.style.colorScheme = scheme
      document.querySelectorAll('meta[name="theme-color"], meta[name="color-scheme"]').forEach((node) => node.remove())
      const theme = document.createElement('meta')
      theme.setAttribute('name', 'theme-color')
      theme.setAttribute('content', on ? '#1e1e1e' : '#fd7115')
      document.head.appendChild(theme)
      const colorScheme = document.createElement('meta')
      colorScheme.setAttribute('name', 'color-scheme')
      colorScheme.setAttribute('content', scheme)
      document.head.appendChild(colorScheme)
    }
  }, [mode])
  const stageRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const installRef = useRef<HTMLElement>(null)
  const chromeRef = useRef<{ open: () => void } | null>(null)
  const glideRef = useRef<(top: number) => void>(() => {})
  const [intro, setIntro] = useState(shouldPlayIntro)
  const [shown, setShown] = useState(() => !shouldPlayIntro())
  const [videoReady, setVideoReady] = useState(false)
  const [active, setActive] = useState<SectionId>('home')

  useEffect(() => {
    const stage = stageRef.current
    const scroll = scrollRef.current
    if (!stage || !scroll) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      glideRef.current = (top) => {
        scroll.scrollTop = Math.max(0, top)
      }
      return () => {
        glideRef.current = () => {}
      }
    }

    let held = 0
    let idle = 0
    let classTimer = 0
    const activeId = { current: 'home' as SectionId }

    const band = (side: 'top' | 'bottom') => {
      const nav = stage.querySelector<HTMLElement>(
        side === 'top' ? '.landing-nav.is-top' : '.landing-nav:not(.is-top)',
      )
      return nav?.getBoundingClientRect().height || SHEET_SHIFT
    }

    const syncMenuChrome = (open: boolean) => {
      if (mode !== 'mobile') return
      const root = document.documentElement
      root.classList.toggle('is-landing-menu', open)
      document.querySelectorAll('meta[name="theme-color"], meta[name="color-scheme"]').forEach((node) => node.remove())
      const night = root.classList.contains('is-night')
      if (!open) {
        root.style.colorScheme = 'normal'
        return
      }
      const scheme = night ? 'dark' : 'light'
      root.style.colorScheme = scheme
      const theme = document.createElement('meta')
      theme.setAttribute('name', 'theme-color')
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
      theme.setAttribute('content', bg || (night ? '#1e1e1e' : '#fd7115'))
      document.head.appendChild(theme)
      const colorScheme = document.createElement('meta')
      colorScheme.setAttribute('name', 'color-scheme')
      colorScheme.setAttribute('content', scheme)
      document.head.appendChild(colorScheme)
    }

    const paint = (next: number) => {
      const wasOpen = held !== 0
      held = next
      const raised = next < 0
      const lowered = next > 0
      const shift = raised ? band('bottom') : lowered ? band('top') : SHEET_SHIFT
      const closeWait = mode === 'mobile' ? pageTurnMs(shift, scroll.clientHeight) + 80 : CHROME_CLOSE_MS
      window.clearTimeout(classTimer)
      if (next === 0) {
        if (wasOpen) stage.classList.add('is-closing')
        classTimer = window.setTimeout(() => {
          stage.classList.remove('is-raised', 'is-lowered', 'is-closing')
          syncMenuChrome(false)
        }, closeWait)
      } else {
        stage.classList.remove('is-closing')
        stage.classList.toggle('is-raised', raised)
        stage.classList.toggle('is-lowered', lowered)
        syncMenuChrome(lowered)
      }
      if (mode === 'mobile') {
        stage.style.setProperty('--chrome-move', `${pageTurnMs(shift, scroll.clientHeight)}ms`)
        stage.style.setProperty('--chrome-ease', 'cubic-bezier(0.4, 0, 0.2, 1)')
      }
      stage.style.setProperty('--sheet-shift', next === 0 ? '0px' : `${next * shift}px`)
      stage.style.setProperty('--sheet-lift', raised ? `${shift}px` : '0px')
      stage.style.setProperty('--sheet-top', lowered ? `${shift}px` : '0px')
      stage.style.setProperty('--menu-top', lowered ? '1' : '0')
      stage.style.setProperty('--menu-bottom', raised ? '1' : '0')
      stage.style.setProperty('--sheet-top-radius', lowered ? 'var(--landing-corner)' : '0px')
      stage.style.setProperty('--sheet-bottom-radius', raised ? 'var(--landing-corner)' : '0px')
      stage.style.setProperty('--reveal-bottom-extra', raised ? 'var(--landing-corner)' : '0px')
      stage.style.setProperty('--reveal-top-extra', lowered ? 'var(--landing-corner)' : '0px')
    }

    let openHeader = () => {}
    let closeHeader = () => {}
    let openFooter = () => {}
    let closeFooter = () => {}
    chromeRef.current = { open: () => openHeader() }

    const noteSection = () => {
      const next = currentSection(scroll)
      if (next === activeId.current) return
      activeId.current = next
      setActive(next)
    }

    const heroFrame = () => scroll.querySelector<HTMLElement>('.landing-hero-frame')
    const heroEnd = () => heroFrame()?.offsetHeight ?? scroll.clientHeight
    let snapping = false
    let dir = 0
    let settleTimer = 0
    let snapToken = 0

    const syncShrink = () => {
      const frame = heroFrame()
      if (!frame) return
      const end = frame.offsetHeight || scroll.clientHeight
      const value = end <= 0 ? 0 : Math.min(1, Math.max(0, scroll.scrollTop / end))
      frame.style.setProperty('--hero-shrink', value.toFixed(4))
    }

    const snapTo = (top: number) => {
      window.clearTimeout(settleTimer)
      snapToken += 1
      const token = snapToken
      snapping = true
      const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight)
      const dest = Math.min(max, Math.max(0, top))
      const from = scroll.scrollTop
      if (Math.abs(dest - from) < 2) {
        scroll.scrollTop = dest
        syncShrink()
        snapping = false
        return
      }
      const duration = pageTurnMs(dest - from, scroll.clientHeight)
      const start = performance.now()
      let pending = 0
      const step = () => {
        if (token !== snapToken) return
        const t = Math.min(1, (performance.now() - start) / duration)
        scroll.scrollTop = from + (dest - from) * easePage(t)
        syncShrink()
        if (t < 1) {
          schedule()
          return
        }
        snapping = false
      }
      const schedule = () => {
        pending += 1
        const ticket = pending
        const run = () => {
          if (ticket !== pending || token !== snapToken) return
          pending += 1
          step()
        }
        requestAnimationFrame(run)
        window.setTimeout(run, 20)
      }
      schedule()
    }

    glideRef.current = snapTo

    // The hero is one screen. A scroll that enters it finishes the trip
    // instead of resting on a half-scaled frame.
    const maybeSnap = (delta: number) => {
      if (Math.abs(delta) < 1) return false
      if (snapping) return true
      const end = heroEnd()
      const y = scroll.scrollTop
      const inHero = y < end - 2
      const atBoundary = Math.abs(y - end) <= 8
      if (inHero && delta > 0) {
        snapTo(end)
        return true
      }
      if ((inHero || atBoundary) && delta < 0 && y > 2) {
        snapTo(0)
        return true
      }
      return false
    }

    const settle = () => {
      if (snapping) return
      const end = heroEnd()
      const top = scroll.scrollTop
      if (top > 2 && top < end - 2) {
        snapTo(dir >= 0 ? end : 0)
        return
      }
      syncShrink()
    }

    const queueSettle = () => {
      if (snapping) return
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(settle, 80)
    }

    let gestureLive = false
    let gestureAtTop = false
    let gestureAtBottom = false
    let gestureSpent = false
    let gestureTimer = 0

    const atEdges = () => {
      const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight)
      const y = scroll.scrollTop
      return { atTop: y <= 2, atBottom: y >= max - 2 }
    }

    const beginGesture = () => {
      if (gestureLive) return
      gestureLive = true
      gestureSpent = false
      const edge = atEdges()
      gestureAtTop = edge.atTop
      gestureAtBottom = edge.atBottom
    }

    const spendGesture = () => {
      gestureSpent = true
    }

    const endGestureSoon = () => {
      window.clearTimeout(gestureTimer)
      gestureTimer = window.setTimeout(() => {
        gestureLive = false
      }, 280)
    }

    let last = scroll.scrollTop

    if (mode === 'mobile') {
      let latched = false
      let touchY = 0
      let pull = 0
      const pullNeeded = 16
      const sheet = stage.querySelector<HTMLElement>('.landing-sheet')
      const onSheetRest = (event: TransitionEvent) => {
        if (event.target !== sheet || event.propertyName !== 'transform' || !latched) return
        navigator.vibrate?.(15)
      }
      sheet?.addEventListener('transitionend', onSheetRest)

      openHeader = () => {
        if (latched) return
        latched = true
        pull = 0
        window.clearTimeout(idle)
        paint(1)
      }

      closeHeader = () => {
        if (!latched) return
        latched = false
        pull = 0
        window.clearTimeout(idle)
        paint(0)
      }

      openFooter = () => {
        if (held < 0) return
        latched = false
        pull = 0
        window.clearTimeout(idle)
        paint(-1)
      }

      closeFooter = () => {
        if (held >= 0) return
        pull = 0
        window.clearTimeout(idle)
        paint(0)
      }

      const onScroll = () => {
        syncShrink()
        const y = scroll.scrollTop
        const dy = y - last
        last = y
        if (Math.abs(dy) > 0.5) dir = dy > 0 ? 1 : -1
        if (gestureAtTop && !latched && y < -12) openHeader()
        if (latched && y > 1 && dy > 0) closeHeader()
        if (held < 0 && dy < -0.5) closeFooter()
        noteSection()
        if (!latched) queueSettle()
      }

      const onTouchStart = (event: TouchEvent) => {
        if (isThemeSwitchTarget(event.target)) return
        touchY = event.touches[0]?.clientY ?? 0
        pull = 0
        beginGesture()
      }

      const onTouchEnd = () => {
        gestureLive = false
        window.clearTimeout(gestureTimer)
      }

      const onTouchMove = (event: TouchEvent) => {
        if (isThemeSwitchTarget(event.target)) return
        const y = event.touches[0]?.clientY ?? touchY
        const dy = touchY - y
        touchY = y
        if (dy === 0) return
        if (gestureSpent) {
          event.preventDefault()
          return
        }
        const atTop = scroll.scrollTop <= 1
        const max = scroll.scrollHeight - scroll.clientHeight
        const atBottom = scroll.scrollTop >= max - 1
        if (held < 0) {
          if (dy < 0) {
            pull += -dy
            event.preventDefault()
            if (pull >= pullNeeded) {
              closeFooter()
              spendGesture()
            }
          } else {
            pull = 0
          }
          return
        }
        if (!latched) {
          if (gestureAtTop && atTop && dy <= -1) {
            openHeader()
            spendGesture()
            event.preventDefault()
            return
          }
          if (gestureAtBottom && atBottom && dy >= 1) {
            openFooter()
            spendGesture()
            event.preventDefault()
            return
          }
          pull = 0
          if (maybeSnap(dy)) event.preventDefault()
          return
        }
        if (dy > 0) {
          pull += dy
          event.preventDefault()
          if (pull >= pullNeeded) {
            closeHeader()
            spendGesture()
          }
        } else {
          pull = 0
        }
      }

      const onWheel = (event: WheelEvent) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1
        const delta = event.deltaY * unit
        beginGesture()
        endGestureSoon()
        if (snapping || gestureSpent) {
          event.preventDefault()
          return
        }
        const atTop = scroll.scrollTop <= 1
        const max = scroll.scrollHeight - scroll.clientHeight
        const atBottom = scroll.scrollTop >= max - 1
        if (held > 0 && delta > 0) {
          closeHeader()
          spendGesture()
          event.preventDefault()
          return
        }
        if (held < 0 && delta < 0) {
          closeFooter()
          spendGesture()
          event.preventDefault()
          return
        }
        if (gestureAtTop && atTop && delta < 0) {
          openHeader()
          spendGesture()
          event.preventDefault()
          return
        }
        if (gestureAtBottom && atBottom && delta > 0) {
          openFooter()
          spendGesture()
          event.preventDefault()
          return
        }
        if (!latched && maybeSnap(delta)) {
          event.preventDefault()
          return
        }
        const atEdge = max <= 1 || (atTop && delta < 0) || (atBottom && delta > 0)
        if (!atEdge && !scroll.contains(event.target as Node)) scroll.scrollTop += delta
      }

      scroll.addEventListener('scroll', onScroll, { passive: true })
      stage.addEventListener('wheel', onWheel, { passive: false })
      stage.addEventListener('touchstart', onTouchStart, { passive: true })
      stage.addEventListener('touchend', onTouchEnd, { passive: true })
      stage.addEventListener('touchcancel', onTouchEnd, { passive: true })
      stage.addEventListener('touchmove', onTouchMove, { passive: false })
      return () => {
        window.clearTimeout(idle)
        window.clearTimeout(classTimer)
        window.clearTimeout(settleTimer)
        snapToken += 1
        glideRef.current = () => {}
        window.clearTimeout(gestureTimer)
        sheet?.removeEventListener('transitionend', onSheetRest)
        navigator.vibrate?.(0)
        scroll.removeEventListener('scroll', onScroll)
        stage.removeEventListener('wheel', onWheel)
        stage.removeEventListener('touchstart', onTouchStart)
        stage.removeEventListener('touchend', onTouchEnd)
        stage.removeEventListener('touchcancel', onTouchEnd)
        stage.removeEventListener('touchmove', onTouchMove)
        stage.classList.remove('is-raised', 'is-lowered', 'is-closing')
        stage.style.removeProperty('--sheet-shift')
        stage.style.removeProperty('--sheet-top')
        stage.style.removeProperty('--sheet-lift')
        stage.style.removeProperty('--sheet-top-radius')
        stage.style.removeProperty('--sheet-bottom-radius')
        stage.style.removeProperty('--reveal-top-extra')
        stage.style.removeProperty('--reveal-bottom-extra')
        stage.style.removeProperty('--menu-top')
        stage.style.removeProperty('--menu-bottom')
        stage.style.removeProperty('--chrome-move')
        stage.style.removeProperty('--chrome-ease')
        document.documentElement.classList.remove('is-landing-menu')
        chromeRef.current = null
        const theme = document.querySelector('meta[name="theme-color"]')
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
        if (theme && bg && !document.documentElement.classList.contains('is-landing')) theme.setAttribute('content', bg)
      }
    }

    openHeader = () => {
      window.clearTimeout(idle)
      if (held !== 1) paint(1)
    }
    closeHeader = () => {
      window.clearTimeout(idle)
      if (held > 0) paint(0)
    }
    openFooter = () => {
      window.clearTimeout(idle)
      if (held !== -1) paint(-1)
    }
    closeFooter = () => {
      window.clearTimeout(idle)
      if (held < 0) paint(0)
    }

    const onScroll = () => {
      syncShrink()
      const y = scroll.scrollTop
      const dy = y - last
      last = y
      if (Math.abs(dy) > 0.5) dir = dy > 0 ? 1 : -1
      if (dy > 0.5) closeHeader()
      if (dy < -0.5) closeFooter()
      noteSection()
      queueSettle()
    }

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1
      const delta = event.deltaY * unit
      beginGesture()
      endGestureSoon()
      if (snapping || gestureSpent) {
        event.preventDefault()
        return
      }
      const max = scroll.scrollHeight - scroll.clientHeight
      const atTop = scroll.scrollTop <= 1
      const atBottom = scroll.scrollTop >= max - 1
      if (held > 0 && delta > 0) {
        closeHeader()
        spendGesture()
        event.preventDefault()
        return
      }
      if (held < 0 && delta < 0) {
        closeFooter()
        spendGesture()
        event.preventDefault()
        return
      }
      if (gestureAtTop && atTop && delta < 0) {
        openHeader()
        return
      }
      if (gestureAtBottom && atBottom && delta > 0) {
        openFooter()
        return
      }
      if (maybeSnap(delta)) {
        event.preventDefault()
        return
      }
      if (!scroll.contains(event.target as Node)) scroll.scrollTop += delta
    }

    let touchY = 0
    const onTouchStart = (event: TouchEvent) => {
      if (isThemeSwitchTarget(event.target)) return
      touchY = event.touches[0]?.clientY ?? 0
      beginGesture()
    }
    const onTouchEnd = () => {
      gestureLive = false
      window.clearTimeout(gestureTimer)
    }
    const onTouchMove = (event: TouchEvent) => {
      if (isThemeSwitchTarget(event.target)) return
      const y = event.touches[0]?.clientY ?? touchY
      const dy = touchY - y
      touchY = y
      if (dy === 0) return
      if (gestureSpent) {
        event.preventDefault()
        return
      }
      const max = scroll.scrollHeight - scroll.clientHeight
      const atTop = scroll.scrollTop <= 1
      const atBottom = scroll.scrollTop >= max - 1
      if (held > 0 && dy > 0) {
        closeHeader()
        spendGesture()
        event.preventDefault()
        return
      }
      if (held < 0 && dy < 0) {
        closeFooter()
        spendGesture()
        event.preventDefault()
        return
      }
      if (gestureAtTop && atTop && dy < 0) {
        openHeader()
        return
      }
      if (gestureAtBottom && (atBottom || max <= 1) && dy > 0) {
        openFooter()
        return
      }
      if (maybeSnap(dy)) event.preventDefault()
    }

    scroll.addEventListener('scroll', onScroll, { passive: true })
    stage.addEventListener('wheel', onWheel, { passive: false })
    stage.addEventListener('touchstart', onTouchStart, { passive: true })
    stage.addEventListener('touchend', onTouchEnd, { passive: true })
    stage.addEventListener('touchcancel', onTouchEnd, { passive: true })
    stage.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      window.clearTimeout(idle)
      window.clearTimeout(classTimer)
      window.clearTimeout(settleTimer)
      snapToken += 1
      glideRef.current = () => {}
      window.clearTimeout(gestureTimer)
      chromeRef.current = null
      scroll.removeEventListener('scroll', onScroll)
      stage.removeEventListener('wheel', onWheel)
      stage.removeEventListener('touchstart', onTouchStart)
      stage.removeEventListener('touchend', onTouchEnd)
      stage.removeEventListener('touchcancel', onTouchEnd)
      stage.removeEventListener('touchmove', onTouchMove)
      stage.classList.remove('is-raised', 'is-lowered', 'is-closing')
      stage.style.removeProperty('--sheet-shift')
      stage.style.removeProperty('--sheet-top')
      stage.style.removeProperty('--sheet-lift')
      stage.style.removeProperty('--sheet-top-radius')
      stage.style.removeProperty('--sheet-bottom-radius')
      stage.style.removeProperty('--reveal-top-extra')
      stage.style.removeProperty('--reveal-bottom-extra')
      stage.style.removeProperty('--menu-top')
      stage.style.removeProperty('--menu-bottom')
    }
  }, [mode])

  function scrollToId(id: string) {
    const root = scrollRef.current
    const node = document.getElementById(id)
    if (!root || !node) return
    const top = node.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
    glideRef.current(Math.max(0, top))
  }

  const screenClass = [
    'screen landing',
    mode === 'desktop' ? 'is-desktop' : '',
    intro ? 'is-intro' : '',
    shown ? 'is-shown' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={screenClass} ref={stageRef}>
      <div className="landing-reveal is-top" aria-hidden="true" />
      <div className="landing-reveal is-bottom" aria-hidden="true" />
      {mode === 'mobile' &&
        createPortal(
          <>
            <div className="landing-safari-bleed is-top" aria-hidden="true" />
            <div className="landing-safari-bleed is-bottom" aria-hidden="true" />
          </>,
          document.body,
        )}
      <button type="button" className="landing-logo" aria-label="Открыть меню" onClick={() => chromeRef.current?.open()}>
        <SvgIcon src="/logo.svg" size={26} />
        <span>
          Beta
          <br />
          Climb
        </span>
      </button>
      <div className="landing-theme is-pin">
        <ThemeToggle night={night} onNight={setNight} />
      </div>
      <div className="landing-sheet">
      <div className="landing-scroll" ref={scrollRef}>
        <section className="landing-frame landing-hero-frame" id="home" aria-label="Beta Climb">
          <div className="landing-hero-media" aria-hidden="true">
            <HeroVideo onReady={() => setVideoReady(true)} />
          </div>
          <div className="landing-hero-copy" lang={russian ? 'ru' : 'en'}>
            <HeroTitle russian={russian} night={night} plain={phone} />
            <div className="landing-hero-actions">
              <Magnet
                padding={100}
                magnetStrength={5}
                maxOffset={6}
                disabled={phone}
                wrapperClassName="landing-magnet"
                innerClassName="landing-magnet-inner"
                style={{ display: 'flex', width: '100%' }}
              >
                <button type="button" className="btn is-android" onClick={() => scrollToId('install-android')}>
                  <AndroidMark />
                  {russian ? 'Установить на Android' : 'Install on Android'}
                </button>
              </Magnet>
              <Magnet
                padding={100}
                magnetStrength={5}
                maxOffset={6}
                disabled={phone}
                wrapperClassName="landing-magnet"
                innerClassName="landing-magnet-inner"
                style={{ display: 'flex', width: '100%' }}
              >
                <button type="button" className="btn is-ios" onClick={() => scrollToId('install-ios')}>
                  <AppleMark />
                  {russian ? 'Установить на iOS' : 'Install on iOS'}
                </button>
              </Magnet>
            </div>
          </div>
        </section>

        <section
          className="landing-frame landing-install-frame"
          id="install"
          aria-labelledby="install-title"
          ref={installRef}
        >
          <div className="landing-install-inner">
            <div className="landing-story-head">
              <LandingFloat as="p" className="landing-kicker" scrollContainerRef={scrollRef} triggerRef={installRef}>
                На домашний экран
              </LandingFloat>
              <LandingFloat
                as="h2"
                id="install-title"
                className="landing-install-title"
                scrollContainerRef={scrollRef}
                triggerRef={installRef}
              >
                Как установить
              </LandingFloat>
            </div>
            <LandingFloat as="p" className="landing-install-lead" scrollContainerRef={scrollRef} triggerRef={installRef}>
              Добавьте Beta Climb на экран телефона. С иконки сразу попадёте в приложение.
            </LandingFloat>
            <div className="landing-guides">
              <Steps platform="android" scrollContainerRef={scrollRef} triggerRef={installRef} />
              <Steps platform="ios" scrollContainerRef={scrollRef} triggerRef={installRef} />
            </div>
          </div>
        </section>
      </div>
      </div>

      <SectionNav placement="top" active={active} night={night} onSelect={scrollToId} onNight={setNight} />
      <SectionNav placement="bottom" active={active} night={night} onSelect={scrollToId} onNight={setNight} />
      {intro ? (
        <SiteIntro ready={videoReady} onExit={() => setShown(true)} onDone={() => setIntro(false)} />
      ) : null}
    </div>
  )
}
