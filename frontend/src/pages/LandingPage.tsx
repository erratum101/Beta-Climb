import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../app/session'
import { SvgIcon } from '../shared/ui/SvgIcon'
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
  { id: 'how', label: 'Как это работает?' },
  { id: 'install', label: 'Установка' },
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
const CHROME_IDLE_MS = 160
const CHROME_CLOSE_MS = 640
const ctaAt = 120

const NAV_INK = 'var(--landing-ink)'
const NAV_FILL_MS = 720

function navFillImage(accentOnLeft: boolean) {
  const accent = 'var(--accent)'
  const mix = `color-mix(in srgb, var(--accent) 50%, ${NAV_INK})`
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
          </button>
        ))}
        <span className="landing-nav-bar" aria-hidden="true" />
      </div>
      <div className="landing-theme" role="group" aria-label="Тема">
        <button type="button" aria-pressed={!night} aria-label="Светлая тема" onClick={() => night && onNight(false)}>
          <SvgIcon src="/light-mode.svg" size={18} />
        </button>
        <button type="button" aria-pressed={night} aria-label="Тёмная тема" onClick={() => !night && onNight(true)}>
          <SvgIcon src="/dark-mode.svg" size={18} />
        </button>
      </div>
      </div>
    </nav>
  )
}

function AndroidMark() {
  return (
    <svg className="landing-store-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.6 9.48 19.44 6.3a.637.637 0 0 0-1.11-.59l-1.88 3.24a11.46 11.46 0 0 0-8.94 0L5.65 5.67a.643.643 0 0 0-1.11.63l1.84 3.18C2.7 11.25 1 14.44 1 18h22c0-3.56-1.7-6.75-5.4-8.52z"
      />
      <circle cx="7" cy="14" r="1.15" fill="#fff" />
      <circle cx="17" cy="14" r="1.15" fill="#fff" />
      <path
        fill="currentColor"
        d="M6 18.2c0 .55.45 1 1 1h1v3.3c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19.2h2v3.3c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19.2h1c.55 0 1-.45 1-1V16H6v2.2zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5z"
      />
    </svg>
  )
}

function AppleMark() {
  return (
    <svg className="landing-store-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      />
    </svg>
  )
}

function Steps({ platform }: { platform: GuideId }) {
  const guide = GUIDES[platform]
  return (
    <section className="landing-block" id={`install-${platform}`} aria-labelledby={`install-${platform}-title`}>
      <h3 id={`install-${platform}-title`}>{guide.title}</h3>
      <ol className="landing-steps">
        {guide.steps.map((step, index) => (
          <li key={step}>
            <span>{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </section>
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
  const navigate = useNavigate()
  const { night, setNight } = useSession()
  const stageRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [intro, setIntro] = useState(shouldPlayIntro)
  const [shown, setShown] = useState(() => !shouldPlayIntro())
  const [active, setActive] = useState<SectionId>('home')

  useEffect(() => {
    const stage = stageRef.current
    const scroll = scrollRef.current
    if (!stage || !scroll) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let held = 0
    let idle = 0
    let classTimer = 0
    let pinned = false
    let hoverX: number | null = null
    let hoverY: number | null = null
    const activeId = { current: 'home' as SectionId }

    const band = (side: 'top' | 'bottom') => {
      const nav = stage.querySelector<HTMLElement>(
        side === 'top' ? '.landing-nav.is-top' : '.landing-nav:not(.is-top)',
      )
      return nav?.getBoundingClientRect().height || SHEET_SHIFT
    }

    const pointerOnWhite = () => {
      if (hoverX == null || hoverY == null || held === 0) return false
      const bounds = stage.getBoundingClientRect()
      const inOpenedBand =
        held < 0 ? hoverY >= bounds.bottom - band('bottom') : hoverY <= bounds.top + band('top')
      if (inOpenedBand) return true
      const hit = document.elementFromPoint(hoverX, hoverY)
      return Boolean(hit && stage.contains(hit) && !hit.closest('.landing-sheet'))
    }

    const syncMenuChrome = (open: boolean) => {
      if (mode !== 'mobile') return
      const root = document.documentElement
      root.classList.toggle('is-landing-menu', open)
      const theme = document.querySelector('meta[name="theme-color"]')
      const next = open
        ? root.classList.contains('is-night') ? '#343434' : '#dfdfdf'
        : getComputedStyle(root).getPropertyValue('--bg').trim()
      if (theme && next) theme.setAttribute('content', next)
    }

    const paint = (next: number) => {
      const wasOpen = held !== 0
      held = next
      const raised = next < 0
      const lowered = next > 0
      const shift = raised ? band('bottom') : lowered ? band('top') : SHEET_SHIFT
      window.clearTimeout(classTimer)
      if (next === 0) {
        if (wasOpen) stage.classList.add('is-closing')
        classTimer = window.setTimeout(() => {
          stage.classList.remove('is-raised', 'is-lowered', 'is-closing')
          syncMenuChrome(false)
        }, CHROME_CLOSE_MS)
      } else {
        stage.classList.remove('is-closing')
        stage.classList.toggle('is-raised', raised)
        stage.classList.toggle('is-lowered', lowered)
        syncMenuChrome(lowered)
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

    const armIdle = () => {
      window.clearTimeout(idle)
      idle = window.setTimeout(release, CHROME_IDLE_MS)
    }

    const release = () => {
      if (held === 0) return
      if (pointerOnWhite()) {
        pinned = true
        return
      }
      pinned = false
      paint(0)
    }

    const hold = (deltaY: number) => {
      if (Math.abs(deltaY) < 1) return
      const next = deltaY > 0 ? -1 : 1
      if (next !== held) paint(next)
      if (pointerOnWhite()) {
        pinned = true
        window.clearTimeout(idle)
        return
      }
      armIdle()
    }

    const noteSection = () => {
      const next = currentSection(scroll)
      if (next === activeId.current) return
      activeId.current = next
      setActive(next)
    }

    let last = scroll.scrollTop

    if (mode === 'mobile') {
      let latched = false
      let touchY = 0
      let pull = 0
      const pullNeeded = 16
      const openPullNeeded = 96
      const sheet = stage.querySelector<HTMLElement>('.landing-sheet')
      const onSheetRest = (event: TransitionEvent) => {
        if (event.target !== sheet || event.propertyName !== 'transform' || !latched) return
        navigator.vibrate?.(15)
      }
      sheet?.addEventListener('transitionend', onSheetRest)

      const openHeader = () => {
        if (latched) return
        latched = true
        pull = 0
        window.clearTimeout(idle)
        paint(1)
      }

      const closeHeader = () => {
        if (!latched) return
        latched = false
        pull = 0
        window.clearTimeout(idle)
        paint(0)
      }

      const onScroll = () => {
        const y = scroll.scrollTop
        const dy = y - last
        last = y
        if (!latched && y < -openPullNeeded) openHeader()
        if (latched && y > 1 && dy > 0) closeHeader()
        noteSection()
      }

      const onTouchStart = (event: TouchEvent) => {
        touchY = event.touches[0]?.clientY ?? 0
        pull = 0
      }

      const onTouchMove = (event: TouchEvent) => {
        const y = event.touches[0]?.clientY ?? touchY
        const dy = touchY - y
        touchY = y
        if (dy === 0) return
        const atTop = scroll.scrollTop <= 1
        if (!latched) {
          if (atTop && dy < 0) {
            pull += -dy
            if (pull >= openPullNeeded) openHeader()
          } else {
            pull = 0
          }
          return
        }
        if (dy > 0) {
          pull += dy
          if (pull >= pullNeeded) closeHeader()
        } else {
          pull = 0
        }
      }

      const onWheel = (event: WheelEvent) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1
        const delta = event.deltaY * unit
        const atTop = scroll.scrollTop <= 1
        if (!latched && atTop && delta < 0) openHeader()
        else if (latched && delta > 0) closeHeader()
        const max = scroll.scrollHeight - scroll.clientHeight
        const atBottom = scroll.scrollTop >= max - 1
        const atEdge = max <= 1 || (atTop && delta < 0) || (atBottom && delta > 0)
        if (!atEdge && !scroll.contains(event.target as Node)) scroll.scrollTop += delta
      }

      scroll.addEventListener('scroll', onScroll, { passive: true })
      stage.addEventListener('wheel', onWheel, { passive: true })
      stage.addEventListener('touchstart', onTouchStart, { passive: true })
      stage.addEventListener('touchmove', onTouchMove, { passive: true })
      return () => {
        window.clearTimeout(idle)
        window.clearTimeout(classTimer)
        sheet?.removeEventListener('transitionend', onSheetRest)
        navigator.vibrate?.(0)
        scroll.removeEventListener('scroll', onScroll)
        stage.removeEventListener('wheel', onWheel)
        stage.removeEventListener('touchstart', onTouchStart)
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
        document.documentElement.classList.remove('is-landing-menu')
        const theme = document.querySelector('meta[name="theme-color"]')
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
        if (theme && bg) theme.setAttribute('content', bg)
      }
    }

    const onScroll = () => {
      const y = scroll.scrollTop
      const dy = y - last
      last = y
      if (Math.abs(dy) > 0.5) hold(dy)
      noteSection()
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      hoverX = event.clientX
      hoverY = event.clientY
      if (held === 0) return
      if (pointerOnWhite()) {
        pinned = true
        window.clearTimeout(idle)
        return
      }
      if (!pinned) return
      pinned = false
      armIdle()
    }

    const onPointerLeave = () => {
      hoverX = null
      hoverY = null
      if (pinned) {
        pinned = false
        armIdle()
      }
    }

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      hoverX = event.clientX
      hoverY = event.clientY
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1
      const delta = event.deltaY * unit
      hold(delta)
      const max = scroll.scrollHeight - scroll.clientHeight
      const atTop = scroll.scrollTop <= 0
      const atBottom = scroll.scrollTop >= max - 1
      const atEdge = max <= 1 || (atTop && delta < 0) || (atBottom && delta > 0)
      if (!atEdge && !scroll.contains(event.target as Node)) scroll.scrollTop += delta
    }

    let touchY = 0
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchY
      const dy = touchY - y
      touchY = y
      const max = scroll.scrollHeight - scroll.clientHeight
      const atTop = scroll.scrollTop <= 0
      const atBottom = scroll.scrollTop >= max - 1
      if (max <= 1 || (atTop && dy < 0) || (atBottom && dy > 0)) hold(dy)
    }

    scroll.addEventListener('scroll', onScroll, { passive: true })
    stage.addEventListener('wheel', onWheel, { passive: true })
    stage.addEventListener('pointermove', onPointerMove)
    stage.addEventListener('pointerleave', onPointerLeave)
    stage.addEventListener('touchstart', onTouchStart, { passive: true })
    stage.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      window.clearTimeout(idle)
      window.clearTimeout(classTimer)
      scroll.removeEventListener('scroll', onScroll)
      stage.removeEventListener('wheel', onWheel)
      stage.removeEventListener('pointermove', onPointerMove)
      stage.removeEventListener('pointerleave', onPointerLeave)
      stage.removeEventListener('touchstart', onTouchStart)
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
    root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
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
      {mode === 'desktop' ? <div className="landing-reveal is-bottom" aria-hidden="true" /> : null}
      <div className="landing-sheet">
      <div className="landing-scroll" ref={scrollRef}>
        <section className="landing-frame landing-hero-frame" id="home" aria-label="Beta Climb">
          <div className="landing-hero-art" role="img" aria-label="Телефон на скалодроме снимает пролаз" />
          <div className="landing-hero-copy" lang={russian ? 'ru' : 'en'}>
            <h1 className="landing-title">
              {russian ? (
                <>
                  С Beta Climb
                  <br />
                  будешь лазать
                  <br />
                  бетее!
                </>
              ) : (
                <>
                  With Beta
                  <br />
                  Climb you’ll
                  <br />
                  climb better!
                </>
              )}
            </h1>
            <div className="landing-hero-actions">
              <button type="button" className="btn" onClick={() => scrollToId('install-android')}>
                <AndroidMark />
                {russian ? 'Установить на Android' : 'Install on Android'}
              </button>
              <button type="button" className="btn" onClick={() => scrollToId('install-ios')}>
                <AppleMark />
                {russian ? 'Установить на iOS' : 'Install on iOS'}
              </button>
            </div>
          </div>
        </section>

        <section className="landing-frame landing-install-frame" id="install" aria-labelledby="install-title">
          <div className="landing-install-inner">
            <div className="landing-story-head">
              <p className="landing-kicker">На домашний экран</p>
              <h2 id="install-title">Как установить</h2>
            </div>
            <p className="landing-install-lead">
              Добавьте Beta Climb на экран телефона. С иконки сразу попадёте в приложение.
            </p>
            <div className="landing-guides">
              <Steps platform="android" />
              <Steps platform="ios" />
            </div>
          </div>
        </section>
      </div>

      {mode === 'mobile' ? (
        <button
          type="button"
          className="btn btn-light landing-cta"
          style={{ animationDelay: `${ctaAt}ms` }}
          onClick={() => navigate('/app', { replace: true })}
        >
          В приложение
        </button>
      ) : null}
      </div>

      <SectionNav placement="top" active={active} night={night} onSelect={scrollToId} onNight={setNight} />
      {mode === 'desktop' ? (
        <SectionNav placement="bottom" active={active} night={night} onSelect={scrollToId} onNight={setNight} />
      ) : null}
      {intro ? <SiteIntro onExit={() => setShown(true)} onDone={() => setIntro(false)} /> : null}
    </div>
  )
}
