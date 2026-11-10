import { useMemo, useState } from 'react'
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
      <h2>{guide.title}</h2>
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

export function LandingPage({ mode }: { mode: 'mobile' | 'desktop' }) {
  const navigate = useNavigate()
  const [platform, setPlatform] = useState<Platform>(detectPlatform)
  const url = shareUrl()
  const local = isLocalHost(window.location.hostname)

  return (
    <div className={mode === 'desktop' ? 'screen landing is-desktop' : 'screen landing'}>
      <div className="landing-scroll">
        <header className="landing-hero">
          <div className="landing-logo">
            <SvgIcon src="/logo.svg" size={96} />
          </div>
          <h1 className="landing-title">Beta Climb</h1>
          <p className="landing-lead">Как добавить на домашний экран</p>
        </header>

        <div className="landing-grid">
          <div className="landing-guide">
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
            {mode === 'desktop' ? (
              <>
                <Steps platform="ios" />
                <Steps platform="android" />
              </>
            ) : (
              <Steps platform={platform} />
            )}
            <p className="landing-after">Дальше открывайте Beta Climb с иконки — сразу попадёте в приложение.</p>
          </div>

          {mode === 'desktop' ? (
            <aside className="landing-qr">
              <QrMark value={url} />
              <p>Приложение доступно только на мобильных устройствах. Отсканируйте QR</p>
              {local ? (
                <p className="landing-note">
                  С телефона localhost не откроется. Откройте сайт по адресу компьютера в сети и отсканируйте QR уже там.
                </p>
              ) : null}
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
