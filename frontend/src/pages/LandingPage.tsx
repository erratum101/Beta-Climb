import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { encode } from 'uqr'
import { SvgIcon } from '../shared/ui/SvgIcon'

type Platform = 'ios' | 'android'

const GUIDES: Record<Platform, { title: string; steps: string[] }> = {
  ios: {
    title: 'iPhone',
    steps: [
      'Откройте эту страницу в Safari',
      'Нажмите «Поделиться» внизу экрана',
      'Выберите «На экран „Домой“»',
      'Нажмите «Добавить»',
    ],
  },
  android: {
    title: 'Android',
    steps: [
      'Откройте эту страницу в Chrome',
      'Нажмите меню ⋮ справа вверху',
      'Выберите «Добавить на главный экран» или «Установить приложение»',
      'Подтвердите — иконка появится на экране',
    ],
  },
}

const FEATURES = [
  {
    title: 'По секундам',
    text: 'Замечание стоит на своём отрезке видео: что не так, что произошло и что сделать.',
  },
  {
    title: 'Одно действие',
    text: 'На следующую попытку остаётся одно движение, а не список советов.',
  },
  {
    title: 'Было и стало',
    text: 'Повтор той же трассы сравнивает одно движение. Общей оценки техники нет.',
  },
  {
    title: 'Честный кадр',
    text: 'Если камера, цвет или стена не подходят, разбора не будет. Система не придумывает.',
  },
]

const REEL = [
  {
    at: '0:12',
    title: 'Работа ног',
    text: 'Оставь левую ногу на опоре, пока рука не возьмёт зацепку.',
  },
  {
    at: '0:09',
    title: 'Баланс',
    text: 'Смести таз над стопой и только потом тянись вверх.',
  },
  {
    at: '0:19',
    title: 'Перехват',
    text: 'Возьми промежуточную зацепку и укороти движение.',
  },
]

const LOOP = [
  { n: '01', text: 'Снимаешь пролаз. Ролик остаётся на телефоне.' },
  { n: '02', text: 'Получаешь 1–3 момента, привязанных к секундам.' },
  { n: '03', text: 'Повторяешь трассу и сравниваешь то же движение.' },
]

function detectPlatform(): Platform {
  return /Android/i.test(navigator.userAgent) ? 'android' : 'ios'
}

function shareUrl() {
  return `${window.location.origin}/`
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function QrMark({ value }: { value: string }) {
  const { data, size } = useMemo(() => encode(value, { ecc: 'M', border: 2 }), [value])
  const path = data
    .flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1H${x}Z` : '')))
    .join('')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR-код со ссылкой на Beta Climb">
      <path d={path} fill="#111111" />
    </svg>
  )
}

function Steps({ platform }: { platform: Platform }) {
  const guide = GUIDES[platform]
  return (
    <section className="landing-block">
      <h3>{guide.title}</h3>
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

function MomentReel() {
  return (
    <div className="reel">
      <div className="reel-top">
        <span>6a · болдеринг</span>
        <b>попытка</b>
      </div>
      <div className="reel-bar" aria-hidden="true">
        <i />
      </div>
      <div className="reel-frame">
        {REEL.map((moment) => (
          <article className="reel-card" key={moment.title}>
            <p>
              <strong>{moment.title}</strong>
              <em>{moment.at}</em>
            </p>
            <span>{moment.text}</span>
          </article>
        ))}
      </div>
      <p className="reel-note">Пример разбора, не результат с вашей стены.</p>
    </div>
  )
}

export function LandingPage({ mode }: { mode: 'mobile' | 'desktop' }) {
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [platform, setPlatform] = useState<Platform>(detectPlatform)
  const url = shareUrl()
  const local = isLocalHost(window.location.hostname)

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const nodes = [...root.querySelectorAll('.reveal')]
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((node) => node.classList.add('is-in'))
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        })
      },
      { root, threshold: 0.08 },
    )
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [mode])

  return (
    <div className={mode === 'desktop' ? 'screen landing is-desktop' : 'screen landing'}>
      <div className="landing-scroll" ref={scrollRef}>
        <div className="landing-layout">
          <div className="landing-main">
            <section className="landing-hero">
              <div className="landing-copy">
                <p className="landing-brand">
                  <SvgIcon src="/logo.svg" size={36} />
                  Beta Climb
                </p>
                <h1 className="landing-title">
                  Сними попытку.
                  <em>Увидь момент.</em>
                </h1>
                <p className="landing-lead">
                  Разбор одного пролаза на скалодроме. Не балл за технику — моменты на видео и одно движение,
                  с которого начинается следующая попытка.
                </p>
                <ol className="landing-loop">
                  {LOOP.map((step) => (
                    <li key={step.n}>
                      <b>{step.n}</b>
                      <span>{step.text}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <figure className="landing-poster">
                <span className="hold hold-a" aria-hidden="true" />
                <span className="hold hold-b" aria-hidden="true" />
                <span className="hold hold-c" aria-hidden="true" />
                <img src="/male-onboarding.webp" alt="Скалолаз тянется к зацепке, контур показывает следующее положение" />
                <figcaption>Следующее положение</figcaption>
              </figure>
            </section>

            <section className="landing-story reveal">
              <div className="landing-story-head">
                <p className="landing-kicker">Что внутри</p>
                <h2>Разбор, который можно повторить</h2>
              </div>
              <div className="landing-bento">
                <MomentReel />
                {FEATURES.map((feature) => (
                  <article className="landing-feature" key={feature.title}>
                    <h3>{feature.title}</h3>
                    <p>{feature.text}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="landing-install reveal">
              <div className="landing-story-head">
                <p className="landing-kicker">На домашний экран</p>
                <h2>Открывайте как приложение</h2>
              </div>
              <p className="landing-install-lead">
                Добавьте Beta Climb на экран телефона. С иконки сразу попадёте в приложение, без этой страницы.
              </p>
              {mode === 'mobile' ? (
                <div className="landing-switch" role="tablist" aria-label="Инструкция для телефона">
                  <button type="button" role="tab" aria-selected={platform === 'ios'} onClick={() => setPlatform('ios')}>
                    iPhone
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={platform === 'android'}
                    onClick={() => setPlatform('android')}
                  >
                    Android
                  </button>
                </div>
              ) : null}
              <div className="landing-guides">
                {mode === 'desktop' ? (
                  <>
                    <Steps platform="ios" />
                    <Steps platform="android" />
                  </>
                ) : (
                  <Steps platform={platform} />
                )}
              </div>
            </section>
          </div>

          {mode === 'desktop' ? (
            <aside className="landing-side">
              <div className="landing-qr">
                <QrMark value={url} />
                <p>Приложение доступно только на мобильных устройствах. Отсканируйте QR</p>
                {local ? (
                  <p className="landing-note">
                    С телефона localhost не откроется. Откройте сайт по адресу компьютера в сети и отсканируйте QR уже
                    там.
                  </p>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      {mode === 'mobile' ? (
        <button type="button" className="btn btn-light landing-cta" onClick={() => navigate('/app', { replace: true })}>
          В приложение
        </button>
      ) : null}
    </div>
  )
}
