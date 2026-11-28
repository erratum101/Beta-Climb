import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from '../app/session'
import { readPhonePlatform } from '../shared/clientKind'
import { isAppInstalled, promptInstall, subscribeInstallPrompt } from '../shared/installPrompt'
import { SiteQr } from '../shared/ui/SiteQr'
import { SvgIcon } from '../shared/ui/SvgIcon'
import Magnet from '../shared/ui/Magnet'
import ScrollFloat from '../shared/ui/ScrollFloat'
import VariableProximity from '../shared/ui/VariableProximity'
import { useLang } from '../shared/i18n'
import { SiteIntro } from './SiteIntro'

const INSTALL_PAGES = {
  ru: {
    android: [
      {
        title: 'Откройте эту страницу в Chrome',
        text: 'Установка идёт из браузера. Откройте Beta Climb именно в Chrome — другие браузеры этот пункт не покажут.',
      },
      {
        title: 'Нажмите меню ⋮ справа вверху',
        text: 'Три точки в углу Chrome открывают действия со страницей.',
      },
      {
        title: 'Выберите «Добавить на главный экран» или «Установить приложение»',
        text: 'Chrome может назвать пункт по-разному. Оба варианта ставят иконку Beta Climb.',
      },
      {
        title: 'Подтвердите — иконка появится на экране',
        text: 'Нажмите «Добавить» или «Установить». С иконки сразу откроется приложение.',
      },
    ],
    ios: [
      {
        title: 'Откройте эту страницу в Safari',
        text: 'На iPhone сайт ставится только из Safari. В Chrome и других браузерах этого шага нет.',
      },
      {
        title: 'Нажмите «Поделиться» внизу экрана',
        text: 'Это квадрат со стрелкой вверх в центре нижней панели Safari.',
        shot: 'share',
      },
      {
        title: 'Выберите «На экран „Домой“»',
        text: 'Если пункта не видно, пролистайте меню вниз. По-английски он называется Add to Home Screen.',
        shot: 'menu',
      },
      {
        title: 'Нажмите «Добавить»',
        text: 'Иконка появится на домашнем экране и откроет Beta Climb как приложение.',
        shot: 'add',
      },
    ],
  },
  en: {
    android: [
      {
        title: 'Open this page in Chrome',
        text: 'Install starts in the browser. Open Beta Climb in Chrome — other browsers will not show this option.',
      },
      {
        title: 'Tap the ⋮ menu at the top right',
        text: 'The three dots in the corner of Chrome open actions for this page.',
      },
      {
        title: 'Choose “Add to Home screen” or “Install app”',
        text: 'Chrome may name the item differently. Both put the Beta Climb icon on your screen.',
      },
      {
        title: 'Confirm — the icon appears on your screen',
        text: 'Tap Add or Install. The icon opens the app right away.',
      },
    ],
    ios: [
      {
        title: 'Open this page in Safari',
        text: 'On iPhone the site installs only from Safari. Chrome and other browsers do not have this step.',
      },
      {
        title: 'Tap Share at the bottom of the screen',
        text: 'It is the square with an upward arrow, in the center of Safari’s bottom bar.',
        shot: 'share',
      },
      {
        title: 'Choose “Add to Home Screen”',
        text: 'If you do not see it, scroll the menu down.',
        shot: 'menu',
      },
      {
        title: 'Tap Add',
        text: 'The icon appears on the Home Screen and opens Beta Climb as an app.',
        shot: 'add',
      },
    ],
  },
} as const

type GuideId = keyof (typeof INSTALL_PAGES)['ru']
type InstallPage = (typeof INSTALL_PAGES)['ru'][GuideId][number] | (typeof INSTALL_PAGES)['en'][GuideId][number]
type AppleShot = 'share' | 'menu' | 'add'

function pageShot(page: InstallPage): AppleShot | null {
  return 'shot' in page ? page.shot : null
}

function AppleStepShot({ kind }: { kind: AppleShot }) {
  if (kind === 'share') {
    return (
      <figure className="apple-step-shot is-share">
        <img src="/shere-apple.webp" alt="" />
      </figure>
    )
  }
  if (kind === 'menu') {
    return (
      <figure className="apple-step-shot is-menu">
        <img className="is-light" src="/add%20to%20home%20screen%20light.webp" alt="" />
        <img className="is-dark" src="/add%20to%20home%20screen%20darck.webp" alt="" />
      </figure>
    )
  }
  return (
    <figure className="apple-step-shot is-add">
      <img className="is-light" src="/add-white-apple.webp" alt="" />
      <img className="is-dark" src="/add-black-apple.webp" alt="" />
    </figure>
  )
}

const NAV = [
  { id: 'home', ru: 'Главная', en: 'Home' },
  { id: 'install', ru: 'Установка', en: 'Install' },
  { id: 'how', ru: 'Как это работает?', en: 'How it works' },
  { id: 'about', ru: 'О нас', en: 'About' },
] as const

type SectionId = (typeof NAV)[number]['id']
type CopyLang = 'ru' | 'en'

function copyLang(russian: boolean): CopyLang {
  return russian ? 'ru' : 'en'
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

function ThemeToggle({ night, onNight, russian }: { night: boolean; onNight: (next: boolean) => void; russian: boolean }) {
  return (
    <button
      type="button"
      className="landing-switch landing-theme-switch"
      data-theme={night ? 'night' : 'day'}
      aria-pressed={night}
      aria-label={russian ? 'Переключить тему' : 'Switch theme'}
      onClick={() => onNight(!night)}
    >
      <span className="landing-switch-thumb" aria-hidden="true" />
      <span className="landing-theme-side is-sun" aria-hidden="true">
        <SvgIcon src="/light-mode.svg" size={18} />
      </span>
      <span className="landing-theme-side is-moon" aria-hidden="true">
        <SvgIcon src="/dark-mode.svg" size={18} />
      </span>
    </button>
  )
}

function SectionNav({
  placement,
  active,
  night,
  russian,
  onSelect,
  onNight,
}: {
  placement: 'top' | 'bottom'
  active: SectionId
  night: boolean
  russian: boolean
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
    <nav className={placement === 'top' ? 'landing-nav is-top' : 'landing-nav'} aria-label={russian ? 'Разделы страницы' : 'Page sections'}>
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
        {NAV.map((item) => {
          const label = item[copyLang(russian)]
          return (
          <button
            key={item.id}
            type="button"
            data-label={label}
            aria-current={active === item.id ? 'true' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span>{label}</span>
            <span aria-hidden="true">{label}</span>
          </button>
          )
        })}
        <span className="landing-nav-bar" aria-hidden="true" />
      </div>
      <div className="landing-theme">
        <ThemeToggle night={night} onNight={onNight} russian={russian} />
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

function IosShareHint({ russian, onClose }: { russian: boolean; onClose: () => void }) {
  const [open, setOpen] = useState(true)
  const copy = russian
    ? { tap: 'Нажмите', then: 'затем', add: 'На экран «Домой»', close: 'Закрыть', label: 'Нажмите «Поделиться», затем «На экран Домой»' }
    : { tap: 'Tap', then: ', then', add: 'Add to Home Screen', close: 'Close', label: 'Tap Share, then Add to Home Screen' }
  if (!open) return null
  return createPortal(
    <div className="ios-share-hint" role="note" aria-label={copy.label} lang={russian ? 'ru' : 'en'}>
      <div className="ios-share-hint-pill">
        <button
          type="button"
          className="ios-share-hint-close"
          aria-label={copy.close}
          onClick={(event) => {
            event.currentTarget.blur()
            onClose()
            setOpen(false)
          }}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M1.2 1.2l9.6 9.6M10.8 1.2L1.2 10.8" />
          </svg>
        </button>
        <span className="ios-share-hint-line">
          <span className="ios-share-hint-text">{copy.tap}</span>
          <svg className="ios-share-hint-icon" viewBox="2.5 3.8 15.2 19.1" aria-hidden="true">
            <path
              fill="currentColor"
              d="M5.22 22.81h9.55c1.8 0 2.73-.92 2.73-2.69V11.95c0-1.77-.93-2.69-2.73-2.69h-2.4v1.63h2.3c.77 0 1.2.39 1.2 1.2v7.89c0 .81-.43 1.21-1.2 1.21H5.32c-.77 0-1.2-.4-1.2-1.21V12.09c0-.81.43-1.2 1.2-1.2H7.63V9.26H5.22c-1.79 0-2.72.92-2.72 2.69v8.17c0 1.77.93 2.69 2.72 2.69ZM9.99 16.2c.42 0 .77-.35.77-.76V7.08L10.7 5.85l.51.6L12.38 7.7c.14.15.33.22.52.22.37 0 .68-.27.68-.66 0-.2-.08-.35-.22-.49L10.57 4.09c-.19-.2-.37-.27-.58-.27-.2 0-.38.07-.57.27L6.63 6.77c-.14.14-.22.29-.22.49 0 .39.3.66.68.66.19 0 .39-.07.52-.22L8.77 6.45l.52-.6-.06 1.23v8.36c0 .41.35.76.76.76Z"
            />
          </svg>
          <span className="ios-share-hint-text">{copy.then}</span>
        </span>
        <span className="ios-share-hint-line">
          <svg className="ios-share-hint-icon" viewBox="2 6 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M16.72 7.28c.86.86 1.02 2.03 1.02 3.54v6.37c0 1.52-.16 2.69-1.02 3.54-.85.85-2.03 1.01-3.54 1.01H6.81c-1.51 0-2.69-.16-3.55-1.01-.85-.85-1-2.02-1-3.54V10.8c0-1.49.15-2.66 1.01-3.52.84-.84 2.03-1.01 3.52-1.01h6.39c1.51 0 2.69.16 3.54 1.01Zm-.61 3.32c0-.87-.11-1.66-.57-2.12-.47-.47-1.27-.59-2.13-.59H6.6c-.87 0-1.69.12-2.15.58-.46.47-.57 1.26-.57 2.14v6.81c0 .86.11 1.65.58 2.12.46.46 1.27.58 2.12.58h6.83c.86 0 1.66-.12 2.13-.58.45-.47.57-1.26.57-2.12V10.6ZM6.17 14.01c0-.47.31-.79.78-.79H9.22V10.94c0-.46.32-.78.77-.78.46 0 .79.32.79.78v2.28h2.28c.46 0 .78.32.78.79 0 .45-.33.76-.78.76H10.78v2.28c0 .46-.33.78-.79.78-.45 0-.77-.32-.77-.78V14.77H6.95c-.46 0-.78-.31-.78-.76Z"
            />
          </svg>
          <span className="ios-share-hint-text">{copy.add}</span>
        </span>
      </div>
      <svg className="ios-share-hint-tip" viewBox="0 0 19 8" aria-hidden="true">
        <path
          fill="currentColor"
          d="M0 1c2.1 0 5.41 3.11 7.5 5.33.74.78 1.1 1.17 1.46 1.28.33.12.62.12.96.01.35-.12.72-.51 1.46-1.29C13.48 4.11 16.82 1 19 1V0H0Z"
        />
      </svg>
    </div>,
    document.body,
  )
}

function PhoneInstall({
  russian,
  onGuide,
  onHintClose,
}: {
  russian: boolean
  onGuide: (platform: GuideId) => void
  onHintClose: () => void
}) {
  const platform = useState(readPhonePlatform)[0]
  const [done, setDone] = useState(isAppInstalled)

  useEffect(() => subscribeInstallPrompt(() => setDone(isAppInstalled())), [])

  if (platform === 'ios' && !done) {
    return (
      <IosShareHint russian={russian} onClose={onHintClose} />
    )
  }

  async function onClick() {
    if (done) return
    onGuide(platform)
    if (platform !== 'android') return
    const outcome = await promptInstall()
    if (outcome === 'accepted') setDone(true)
  }

  return (
    <button
      type="button"
      className={platform === 'android' ? 'btn is-android' : 'btn is-ios'}
      onClick={onClick}
      disabled={done}
    >
      {platform === 'android' ? <AndroidMark /> : <AppleMark />}
      {done ? (russian ? 'Установлено' : 'Installed') : russian ? 'Установить' : 'Install'}
    </button>
  )
}

function PlatformSwitch({
  platform,
  russian,
  onPlatform,
}: {
  platform: GuideId
  russian: boolean
  onPlatform: (platform: GuideId) => void
}) {
  return (
    <div className="landing-switch" role="tablist" aria-label={russian ? 'Платформа' : 'Platform'} data-platform={platform}>
      <span className="landing-switch-thumb" aria-hidden="true" />
      <button
        type="button"
        role="tab"
        aria-selected={platform === 'android'}
        aria-label="Android"
        onClick={() => onPlatform('android')}
      >
        <AndroidMark />
        <span className="landing-switch-label">Android</span>
      </button>
      <button type="button" role="tab" aria-selected={platform === 'ios'} aria-label="iOS" onClick={() => onPlatform('ios')}>
        <AppleMark />
        <span className="landing-switch-label">iOS</span>
      </button>
    </div>
  )
}

function LandingFloat({
  as = 'p',
  id,
  className = '',
  scrollContainerRef,
  triggerRef,
  fadeFirst = false,
  children,
}: {
  as?: 'h2' | 'h3' | 'p' | 'span'
  id?: string
  className?: string
  scrollContainerRef: { readonly current: HTMLElement | null } | null
  triggerRef: { readonly current: HTMLElement | null }
  fadeFirst?: boolean
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
      animationDuration={0.2}
      ease="back.inOut(2)"
      scrollStart="top 65%"
      scrollEnd="top 12%"
      startDelay={0}
      fadeFirst={fadeFirst}
      playOnEnter
      stagger={0.02}
      distance={120}
      stretch={2.3}
      smoothing={0}
    >
      {children}
    </ScrollFloat>
  )
}

function InstallStep({
  page,
  index,
  anchor,
  showQr,
  swap,
  scrollContainerRef,
}: {
  page: InstallPage
  index: number
  anchor: boolean
  showQr: boolean
  swap: GuideId | null
  scrollContainerRef: { readonly current: HTMLElement | null } | null
}) {
  const pageRef = useRef<HTMLElement>(null)
  const shot = pageShot(page)
  const shotLeft = index % 2 === 0
  const pageClass = [
    'install-page',
    shot ? `has-shot ${shotLeft ? 'is-shot-left' : 'is-shot-right'}` : showQr ? 'has-qr' : '',
    swap ? `is-swap is-swap-${swap}` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <article
      ref={pageRef}
      className="landing-frame install-step-page"
      id={anchor ? 'install' : undefined}
      aria-labelledby={anchor ? 'install-title' : undefined}
    >
      <div className={pageClass}>
        {shot && shotLeft ? <AppleStepShot kind={shot} /> : null}
        <div className="install-page-copy">
          <LandingFloat
            as="h3"
            id={anchor ? 'install-title' : undefined}
            scrollContainerRef={scrollContainerRef}
            triggerRef={pageRef}
          >
            {page.title}
          </LandingFloat>
          <LandingFloat
            as="p"
            className="install-page-lead"
            scrollContainerRef={scrollContainerRef}
            triggerRef={pageRef}
          >
            {page.text}
          </LandingFloat>
        </div>
        {shot && !shotLeft ? <AppleStepShot kind={shot} /> : null}
        {showQr ? <SiteQr /> : null}
      </div>
    </article>
  )
}

function InstallSteps({
  platform,
  russian,
  omitIntro,
  onPlatform,
  scrollContainerRef,
}: {
  platform: GuideId
  russian: boolean
  omitIntro: boolean
  onPlatform: (platform: GuideId) => void
  scrollContainerRef: { readonly current: HTMLElement | null } | null
}) {
  const pages = INSTALL_PAGES[copyLang(russian)][platform]
  const start = omitIntro ? 1 : 0
  const prevPlatform = useRef(platform)
  const [swap, setSwap] = useState<GuideId | null>(null)
  if (prevPlatform.current !== platform) {
    prevPlatform.current = platform
    setSwap(platform)
  }
  useEffect(() => {
    if (swap == null) return
    const id = window.setTimeout(() => setSwap(null), 520)
    return () => window.clearTimeout(id)
  }, [swap])
  return (
    <div className="install-steps">
      <div className="install-step-top">
        <PlatformSwitch platform={platform} russian={russian} onPlatform={onPlatform} />
      </div>
      {pages.slice(start).map((page, index) => (
        <InstallStep
          key={index}
          page={page}
          index={start + index}
          anchor={index === 0}
          showQr={start === 0 && index === 0}
          swap={swap}
          scrollContainerRef={scrollContainerRef}
        />
      ))}
    </div>
  )
}

const HERO_VIDEO_HTML =
  '<video id="hero-bg" autoplay muted loop playsinline webkit-playsinline="true" preload="auto" disablepictureinpicture src="/bg.mp4"></video>'

let heroVideo: HTMLVideoElement | null = null

function ensureHeroVideo(host: HTMLElement) {
  if (!heroVideo) {
    const existing = document.getElementById('hero-bg')
    if (existing instanceof HTMLVideoElement) heroVideo = existing
  }
  if (!heroVideo) {
    const wrap = document.createElement('div')
    wrap.innerHTML = HERO_VIDEO_HTML
    const created = wrap.querySelector('video')
    if (created instanceof HTMLVideoElement) heroVideo = created
  }
  const video = heroVideo
  if (!video) return null
  video.muted = true
  video.defaultMuted = true
  video.volume = 0
  video.playsInline = true
  video.autoplay = true
  video.controls = false
  video.removeAttribute('controls')
  if (video.parentElement !== host) host.appendChild(video)
  return video
}

function HeroVideo({ onReady }: { onReady: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useLayoutEffect(() => {
    const host = hostRef.current
    if (host) ensureHeroVideo(host)
  })

  useLayoutEffect(() => {
    const host = hostRef.current
    const video = host ? ensureHeroVideo(host) : null
    if (!video) return
    let alive = true
    let done = false
    let painted = !video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    let pending = false
    let blocked = false

    const finish = () => {
      if (!alive || done) return
      done = true
      onReadyRef.current()
    }

    const sync = () => {
      if (!done && painted && !video.paused && !video.ended) finish()
    }

    const start = (force = false) => {
      if (!alive) return
      video.muted = true
      video.defaultMuted = true
      if (!video.paused && !video.ended) {
        sync()
        return
      }
      if (pending || (blocked && !force)) return
      pending = true
      const task = video.play()
      if (!task) {
        pending = false
        return
      }
      task.then(() => {
        pending = false
        blocked = false
        sync()
      }).catch((error: unknown) => {
        pending = false
        if (error instanceof DOMException && error.name === 'NotAllowedError') blocked = true
      })
    }

    const unlock = () => {
      blocked = false
      start(true)
    }

    const markPaint = () => {
      painted = true
      sync()
    }

    const onPause = () => {
      if (!alive || video.ended || document.visibilityState === 'hidden') return
      start()
    }

    const onEnded = () => {
      if (!alive) return
      if (Number.isFinite(video.duration)) video.currentTime = 0
      blocked = false
      start(true)
    }

    const onVisible = () => {
      if (document.visibilityState === 'hidden') return
      blocked = false
      start(true)
    }

    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(() => markPaint())
    }

    const kick = () => start(false)
    video.addEventListener('loadeddata', kick)
    video.addEventListener('canplay', kick)
    video.addEventListener('playing', markPaint)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true })
    window.addEventListener('touchstart', unlock, { capture: true, passive: true })
    const timer = window.setInterval(() => {
      if (!alive || document.visibilityState === 'hidden') return
      if (video.paused) start(false)
      else {
        painted = true
        sync()
        if (done) window.clearInterval(timer)
      }
    }, 300)
    start(true)

    return () => {
      alive = false
      window.clearInterval(timer)
      video.removeEventListener('loadeddata', kick)
      video.removeEventListener('canplay', kick)
      video.removeEventListener('playing', markPaint)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('touchstart', unlock, true)
    }
  }, [])

  return <div ref={hostRef} className="landing-hero-video" />
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

function PlainHeroTitle({ label }: { label: string }) {
  const lines = label.split('\n').map((line) => line.trim()).filter(Boolean)

  return (
    <h1 className="landing-title is-plain is-lines">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </h1>
  )
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
    return <PlainHeroTitle label={label} />
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

/** Hero video above the first screen. It sits under Safari's top bar, so the page never rests above it. */
function landingOverhang() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--landing-overhang')) || 0
}

/** On phones the document scrolls so Safari can show the page through its toolbars.
    The same overhang sits below the last page, under Safari's bottom bar. */
function landingView(el: HTMLElement, page: boolean) {
  const height = () => (page ? window.innerHeight : el.clientHeight)
  const overhang = page ? landingOverhang() : 0
  return {
    page,
    min: () => overhang,
    target: (page ? window : el) as EventTarget,
    top: () => (page ? window.scrollY : el.scrollTop),
    setTop: (value: number) => {
      if (page) window.scrollTo({ top: value, behavior: 'instant' })
      else el.scrollTop = value
    },
    height,
    max: () => (page ? document.documentElement.scrollHeight - overhang : el.scrollHeight) - height(),
    edge: () => el.getBoundingClientRect().top + (page ? window.scrollY : 0),
  }
}

function currentSection(viewTop: number) {
  const edge = viewTop + 56
  let current: SectionId = 'home'
  for (const item of NAV) {
    const node = document.getElementById(item.id)
    if (node && node.getBoundingClientRect().top <= edge) current = item.id
  }
  return current
}

type ShotBox = { left: number; top: number; width: number; height: number }

function smoothRange(from: number, to: number, value: number) {
  const span = to - from
  if (span <= 0) return value >= to ? 1 : 0
  const k = Math.min(1, Math.max(0, (value - from) / span))
  return k * k * (3 - 2 * k)
}

/** Visual bounds of an object-fit: contain screenshot, in viewport pixels. */
function containedShot(img: HTMLImageElement): ShotBox | null {
  const box = img.getBoundingClientRect()
  if (box.width < 2 || box.height < 2) return null
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  if (!nw || !nh) return { left: box.left, top: box.top, width: box.width, height: box.height }
  const scale = Math.min(box.width / nw, box.height / nh)
  const width = nw * scale
  const height = nh * scale
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  }
}

function visibleShot(figure: HTMLElement) {
  const imgs = [...figure.querySelectorAll('img')]
  const themed = imgs.filter((img) => img.classList.contains('is-light') || img.classList.contains('is-dark'))
  if (themed.length === 0) return imgs[0] ?? null
  const night = document.documentElement.classList.contains('is-night')
  return themed.find((img) => img.classList.contains(night ? 'is-dark' : 'is-light')) ?? themed[0]
}

/**
 * While a page turn moves between two install screenshots, one copy leaves the
 * settled slot of the old picture, arcs to the settled slot of the new one,
 * and crossfades into it. It tips a few degrees downhill, then stands back up.
 * The scroll position is already eased by the page turn.
 */
function InstallShotMorph({
  scrollRef,
  pageScroll,
}: {
  scrollRef: { readonly current: HTMLDivElement | null }
  pageScroll: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const scroll = scrollRef.current
    if (!host || !scroll) return
    const fromImg = host.querySelector<HTMLImageElement>('.is-from')
    const toImg = host.querySelector<HTMLImageElement>('.is-to')
    if (!fromImg || !toImg) return

    const ghosts = new Set<HTMLElement>()
    let raf = 0
    let lastTop = Number.NaN
    let alive = true

    const clearGhosts = () => {
      ghosts.forEach((node) => node.classList.remove('is-shot-ghost'))
      ghosts.clear()
    }

    const hide = () => {
      host.style.visibility = 'hidden'
      host.style.filter = 'none'
      clearGhosts()
    }

    const readTop = () => (pageScroll ? window.scrollY : scroll.scrollTop)

    const paint = () => {
      clearGhosts()
      if (!alive || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        hide()
        return
      }

      const port = scroll.getBoundingClientRect()
      const top = readTop()
      const pages = [...scroll.querySelectorAll<HTMLElement>('.landing-frame')]
      const stops = pages.map((page) => {
        const box = page.getBoundingClientRect()
        const snap = pageScroll ? box.top - port.top : box.top - port.top + scroll.scrollTop
        return { page, snap }
      })

      let index = -1
      for (let i = 0; i < stops.length; i += 1) {
        if (top + 1 >= stops[i].snap) index = i
      }
      const current = stops[index]
      const next = stops[index + 1]
      const span = current && next ? next.snap - current.snap : 0
      const progress = span > 8 ? (top - current.snap) / span : 0
      if (!current || !next || !(progress > 0.001 && progress < 0.999)) {
        hide()
        return
      }

      const fromFigure = current.page.querySelector<HTMLElement>('.apple-step-shot')
      const toFigure = next.page.querySelector<HTMLElement>('.apple-step-shot')
      const fromShot = fromFigure ? visibleShot(fromFigure) : null
      const toShot = toFigure ? visibleShot(toFigure) : null
      const fromLive = fromShot ? containedShot(fromShot) : null
      const toLive = toShot ? containedShot(toShot) : null
      if (!toFigure || !toShot || !toLive) {
        hide()
        return
      }

      const pageTop = pageScroll ? port.top + window.scrollY : port.top
      const shiftOf = (page: HTMLElement) => pageTop - page.getBoundingClientRect().top
      const park = (live: ShotBox, page: HTMLElement): ShotBox => {
        const shift = shiftOf(page)
        return { left: live.left, top: live.top + shift, width: live.width, height: live.height }
      }
      const to = park(toLive, next.page)
      if (to.width < 2) {
        hide()
        return
      }

      if (!fromFigure || !fromShot || !fromLive) {
        // The first picture stays hidden through the first part of the page
        // turn, then drops straight down into its slot and fades in.
        toFigure.classList.add('is-shot-ghost')
        ghosts.add(toFigure)
        const appearFrom = 0.46
        if (progress < appearFrom) {
          fromImg.style.opacity = '0'
          toImg.style.opacity = '0'
          host.style.visibility = 'hidden'
          return
        }
        const local = (progress - appearFrom) / (1 - appearFrom)
        const eased = local * local * (3 - 2 * local)
        const drop = Math.max(120, Math.min(220, port.height * 0.28))
        const cx = toLive.left + toLive.width / 2
        const cy = toLive.top + toLive.height / 2 - (1 - eased) * drop
        const src = toShot.currentSrc || toShot.src
        if (toImg.src !== src) toImg.src = src
        fromImg.style.opacity = '0'
        toImg.style.opacity = String(eased)
        host.style.visibility = 'visible'
        host.style.width = `${toLive.width}px`
        host.style.height = `${toLive.height}px`
        host.style.filter = 'none'
        host.style.transform = `translate(${cx}px, ${cy}px) translate(${-toLive.width / 2}px, ${-toLive.height / 2}px)`
        return
      }

      const from = park(fromLive, current.page)
      if (from.width < 2) {
        hide()
        return
      }

      const ax = from.left + from.width / 2
      const ay = from.top + from.height / 2
      const bx = to.left + to.width / 2
      const by = to.top + to.height / 2
      const len = Math.hypot(bx - ax, by - ay)
      const lift = Math.max(72, Math.min(160, 36 + len * 0.28))
      const side = (ax <= bx ? -1 : 1) * (len < 80 ? 28 : Math.min(42, Math.abs(by - ay) * 0.12))
      // sin² starts and ends flat, so the flight leaves the slot and lands without a kink.
      const bump = Math.sin(Math.PI * progress) ** 2
      const x = ax + (bx - ax) * progress + side * bump
      const y = ay + (by - ay) * progress - lift * bump
      // A small downhill tip toward the way the picture is traveling, back to 0° at both slots.
      const downhill = bx < ax - 24 ? 1 : bx > ax + 24 ? -1 : 1
      const tilt = downhill * 8 * Math.sin(Math.PI * progress)
      const w = from.width + (to.width - from.width) * progress
      const h = from.height + (to.height - from.height) * progress
      const pulse = 1 - Math.sin(Math.PI * progress) * 0.06
      const fade = smoothRange(0.32, 0.68, progress)

      const fromSrc = fromShot.currentSrc || fromShot.src
      const toSrc = toShot.currentSrc || toShot.src
      if (fromImg.src !== fromSrc) fromImg.src = fromSrc
      if (toImg.src !== toSrc) toImg.src = toSrc
      fromImg.style.opacity = String(1 - fade)
      toImg.style.opacity = String(fade)

      host.style.visibility = 'visible'
      host.style.width = `${w}px`
      host.style.height = `${h}px`
      host.style.filter = 'none'
      host.style.transform = `translate(${x}px, ${y}px) rotate(${tilt}deg) scale(${pulse}) translate(${-w / 2}px, ${-h / 2}px)`
      fromFigure.classList.add('is-shot-ghost')
      toFigure.classList.add('is-shot-ghost')
      ghosts.add(fromFigure)
      ghosts.add(toFigure)
    }

    const kick = () => {
      if (raf || !alive) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        if (!alive) return
        const top = readTop()
        paint()
        if (top !== lastTop) {
          lastTop = top
          kick()
        }
      })
    }

    const onScroll = () => kick()
    kick()
    const scroller: EventTarget = pageScroll ? window : scroll
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    scroll.addEventListener('load', onScroll, true)
    const observer = new MutationObserver(onScroll)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    observer.observe(scroll, { childList: true, subtree: true })

    return () => {
      alive = false
      window.cancelAnimationFrame(raf)
      scroller.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      scroll.removeEventListener('load', onScroll, true)
      observer.disconnect()
      clearGhosts()
    }
  }, [pageScroll, scrollRef])

  return createPortal(
    <div ref={hostRef} className="install-shot-morph" aria-hidden="true">
      <img className="is-from" alt="" draggable={false} />
      <img className="is-to" alt="" draggable={false} />
    </div>,
    document.body,
  )
}

const INTRO_SEEN_KEY = 'beta-climb.intro-seen'

function isThemeSwitchTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('.landing-theme'))
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
  const russian = useLang() === 'ru'
  const phone = usePhoneLayout(mode)
  const { night, setNight } = useSession()

  useLayoutEffect(() => {
    if (mode !== 'mobile') return
    const root = document.documentElement
    root.classList.add('is-landing')
    window.scrollTo(0, landingOverhang())
    if (!root.classList.contains('is-landing-menu')) {
      root.style.colorScheme = 'normal'
      document.querySelectorAll('meta[name="theme-color"], meta[name="color-scheme"]').forEach((node) => node.remove())
    }
    return () => {
      root.classList.remove('is-landing')
      window.scrollTo(0, 0)
      const on = root.classList.contains('is-night')
      const scheme = on ? 'dark' : 'light'
      root.style.colorScheme = scheme
      document.querySelectorAll('meta[name="theme-color"], meta[name="color-scheme"]').forEach((node) => node.remove())
      const colorScheme = document.createElement('meta')
      colorScheme.setAttribute('name', 'color-scheme')
      colorScheme.setAttribute('content', scheme)
      document.head.appendChild(colorScheme)
    }
  }, [mode])
  const stageRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollLockRef = useRef(0)
  const scrollPinRef = useRef(0)
  const chromeRef = useRef<{ open: () => void } | null>(null)
  const glideRef = useRef<(top: number) => void>(() => {})
  const [intro, setIntro] = useState(shouldPlayIntro)
  const [shown, setShown] = useState(() => !shouldPlayIntro())
  const [videoReady, setVideoReady] = useState(false)
  const [active, setActive] = useState<SectionId>('home')
  const [guidePlatform, setGuidePlatform] = useState<GuideId>(readPhonePlatform)
  const [hintClosed, setHintClosed] = useState(false)

  function closeShareHint() {
    const stage = stageRef.current
    if (!stage || hintClosed) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const viewport = window.visualViewport
    const visible = viewport?.height || window.innerHeight
    const pages = [...stage.querySelectorAll<HTMLElement>('.install-page.has-shot')]
    const shifts = pages.map((page) => {
      const step = page.closest('.install-step-page')
      const shot = page.querySelector('.apple-step-shot')
      const copy = page.querySelector('.install-page-copy')
      if (!step || !shot || !copy) return 0
      const shotBox = shot.getBoundingClientRect()
      const copyBox = copy.getBoundingClientRect()
      const center = (Math.min(shotBox.top, copyBox.top) + Math.max(shotBox.bottom, copyBox.bottom)) / 2
      const pageTop = step.getBoundingClientRect().top
      return visible / 2 - (center - pageTop)
    })
    setHintClosed(true)
    const ease = 'transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)'
    const apply = (animate: boolean) => {
      pages.forEach((page, index) => {
        const dy = shifts[index] ?? 0
        if (Math.abs(dy) < 0.5) return
        page.style.transition = animate ? ease : 'none'
        page.style.transform = `translateY(${dy}px)`
      })
    }
    if (reduce) {
      apply(false)
      return
    }
    pages.forEach((page) => {
      page.style.transition = 'none'
      page.style.transform = 'translateY(0)'
    })
    requestAnimationFrame(() => {
      requestAnimationFrame(() => apply(true))
    })
  }

  useEffect(() => {
    const stage = stageRef.current
    const scroll = scrollRef.current
    if (!stage || !scroll) return
    const view = landingView(scroll, mode === 'mobile')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      glideRef.current = (top) => {
        view.setTop(Math.max(view.min(), top))
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
      const closeWait = mode === 'mobile' ? pageTurnMs(shift, view.height()) + 80 : CHROME_CLOSE_MS
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
        stage.style.setProperty('--chrome-move', `${pageTurnMs(shift, view.height())}ms`)
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
      const next = currentSection(view.edge())
      if (next === activeId.current) return
      activeId.current = next
      setActive(next)
    }

    const heroFrame = () => scroll.querySelector<HTMLElement>('.landing-hero-frame')
    let snapping = false
    let dir = 0
    let settleTimer = 0
    let snapToken = 0

    const frameStops = () => {
      const root = view.edge()
      const max = Math.max(0, view.max())
      const stops = [...scroll.querySelectorAll<HTMLElement>('.landing-frame')].map((node) => {
        const top = node.getBoundingClientRect().top - root + view.top()
        return Math.min(max, Math.max(view.min(), Math.round(top)))
      })
      return [...new Set(stops)].sort((a, b) => a - b)
    }

    const syncShrink = () => {
      const frame = heroFrame()
      if (!frame) return
      const end = frame.offsetHeight - view.min() || view.height()
      const value = end <= 0 ? 0 : Math.min(1, Math.max(0, (view.top() - view.min()) / end))
      frame.style.setProperty('--hero-shrink', value.toFixed(4))
    }

    const snapTo = (top: number) => {
      window.clearTimeout(settleTimer)
      snapToken += 1
      const token = snapToken
      snapping = true
      const max = Math.max(0, view.max())
      const dest = Math.min(max, Math.max(view.min(), top))
      const from = view.top()
      if (Math.abs(dest - from) < 2) {
        view.setTop(dest)
        syncShrink()
        snapping = false
        return
      }
      const duration = pageTurnMs(dest - from, view.height())
      const start = performance.now()
      let pending = 0
      const step = () => {
        if (token !== snapToken) return
        const t = Math.min(1, (performance.now() - start) / duration)
        view.setTop(from + (dest - from) * easePage(t))
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

    // Every frame is one screen, same as the hero. A scroll finishes the trip
    // to the next or previous page instead of resting halfway.
    const maybeSnap = (delta: number) => {
      if (Math.abs(delta) < 1) return false
      if (snapping) return true
      const stops = frameStops()
      if (stops.length < 2) return false
      const y = view.top()
      const max = Math.max(0, view.max())
      let index = 0
      for (let i = 0; i < stops.length; i++) {
        if (y + 8 >= stops[i]) index = i
      }
      const here = stops[index]
      const next = stops[index + 1]
      const prev = index > 0 ? stops[index - 1] : null
      const aligned = Math.abs(y - here) <= 8

      if (delta > 0) {
        if (next == null || here >= max - 2 || next - y <= 2) return false
        snapTo(next)
        spendGesture()
        return true
      }

      if (aligned) {
        if (prev == null) return false
        snapTo(prev)
        spendGesture()
        return true
      }
      if (y - here > 2) {
        snapTo(here)
        spendGesture()
        return true
      }
      return false
    }

    // Platform switch rebuilds the step text and ScrollTrigger refreshes by
    // scrolling the container. Pin the current page so that does not turn it.
    const keepPinned = () => {
      if (performance.now() >= scrollLockRef.current) return false
      const pin = scrollPinRef.current
      if (Math.abs(view.top() - pin) > 1) view.setTop(pin)
      return true
    }

    const settle = () => {
      if (snapping || keepPinned()) return
      const stops = frameStops()
      const y = view.top()
      if (y < view.min() - 2) {
        snapTo(view.min())
        return
      }
      const max = Math.max(0, view.max())
      if (y > max + 2) {
        snapTo(max)
        return
      }
      if (stops.length === 0) {
        syncShrink()
        return
      }
      let index = 0
      for (let i = 0; i < stops.length; i++) {
        if (y + 2 >= stops[i]) index = i
      }
      const here = stops[index]
      const next = stops[index + 1]
      if (next != null && y > here + 2 && y < next - 2) {
        snapTo(dir >= 0 ? next : here)
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
      const max = Math.max(0, view.max())
      const y = view.top()
      return { atTop: y <= view.min() + 2, atBottom: y >= max - 2 }
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

    let last = view.top()

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
        if (keepPinned()) {
          last = view.top()
          return
        }
        const y = view.top()
        const dy = y - last
        last = y
        if (Math.abs(dy) > 0.5) dir = dy > 0 ? 1 : -1
        if (gestureAtTop && !latched && y < view.min() - 12) openHeader()
        if (latched && y > view.min() + 1 && dy > 0) closeHeader()
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
        const atTop = view.top() <= view.min() + 1
        const atBottom = view.top() >= view.max() - 1
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
            pull = 0
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
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.height() : 1
        const delta = event.deltaY * unit
        beginGesture()
        endGestureSoon()
        if (snapping || gestureSpent) {
          event.preventDefault()
          return
        }
        const atTop = view.top() <= view.min() + 1
        const atBottom = view.top() >= view.max() - 1
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
          return
        }
        if (!latched && maybeSnap(delta)) {
          event.preventDefault()
        }
      }

      view.target.addEventListener('scroll', onScroll, { passive: true })
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
        view.target.removeEventListener('scroll', onScroll)
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
      if (keepPinned()) {
        last = scroll.scrollTop
        return
      }
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
    const view = landingView(root, mode === 'mobile')
    const top = node.getBoundingClientRect().top - view.edge() + view.top()
    glideRef.current(Math.max(0, top))
  }

  function selectGuide(platform: GuideId) {
    const scroll = scrollRef.current
    if (scroll) {
      scrollPinRef.current = landingView(scroll, mode === 'mobile').top()
      scrollLockRef.current = performance.now() + 700
    }
    setGuidePlatform(platform)
  }

  function showGuide(platform: GuideId) {
    setGuidePlatform(platform)
    scrollToId('install')
  }

  const screenClass = [
    'screen landing',
    mode === 'desktop' ? 'is-desktop' : '',
    intro ? 'is-intro' : '',
    shown ? 'is-shown' : '',
    hintClosed ? 'is-hint-closed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={screenClass} ref={stageRef}>
      <div className="landing-reveal is-top" aria-hidden="true" />
      <div className="landing-reveal is-bottom" aria-hidden="true" />
      <button type="button" className="landing-logo" aria-label={russian ? 'Открыть меню' : 'Open menu'} onClick={() => chromeRef.current?.open()}>
        <SvgIcon src="/logo.svg" size={26} />
        <span>
          Beta
          <br />
          Climb
        </span>
      </button>
      <div className="landing-theme is-pin">
        <ThemeToggle night={night} onNight={setNight} russian={russian} />
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
              {mode === 'mobile' ? (
                <PhoneInstall russian={russian} onGuide={showGuide} onHintClose={closeShareHint} />
              ) : (
                <>
                  <Magnet
                    padding={100}
                    magnetStrength={5}
                    maxOffset={6}
                    disabled={phone}
                    wrapperClassName="landing-magnet"
                    innerClassName="landing-magnet-inner"
                    style={{ display: 'flex', width: '100%' }}
                  >
                    <button type="button" className="btn is-android" onClick={() => showGuide('android')}>
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
                    <button type="button" className="btn is-ios" onClick={() => showGuide('ios')}>
                      <AppleMark />
                      {russian ? 'Установить на iOS' : 'Install on iOS'}
                    </button>
                  </Magnet>
                </>
              )}
            </div>
          </div>
        </section>

        <InstallSteps
          platform={guidePlatform}
          russian={russian}
          omitIntro={mode === 'mobile'}
          onPlatform={selectGuide}
          scrollContainerRef={mode === 'mobile' ? null : scrollRef}
        />
      </div>
      </div>

      <InstallShotMorph scrollRef={scrollRef} pageScroll={mode === 'mobile'} />
      <SectionNav placement="top" active={active} night={night} russian={russian} onSelect={scrollToId} onNight={setNight} />
      {mode === 'desktop' ? (
        <SectionNav placement="bottom" active={active} night={night} russian={russian} onSelect={scrollToId} onNight={setNight} />
      ) : null}
      {intro ? (
        <SiteIntro ready={videoReady} onExit={() => setShown(true)} onDone={() => setIntro(false)} />
      ) : null}
    </div>
  )
}
