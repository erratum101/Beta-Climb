import { NavLink, useLocation } from 'react-router-dom'
import { useSession } from '../../app/session'
import type { HomeGuideControls } from '../../features/capture/CaptureGuide'
import { SvgIcon } from './SvgIcon'

export function BottomNav({ guide = null }: { guide?: HomeGuideControls | null }) {
  const { profile, attempts } = useSession()
  const { pathname } = useLocation()
  const genderIcon = profile?.gender === 'male' ? '/male.svg' : '/female.svg'
  const pair =
    attempts.length === 0 &&
    (pathname === '/climbs' || pathname === '/home' || pathname === '/profile')

  const climbs = (
    <NavLink
      to="/climbs"
      tabIndex={guide?.open ? -1 : undefined}
      className={({ isActive }) => (isActive ? 'nav-btn is-active' : 'nav-btn')}
    >
      <SvgIcon src="/male-climbing-icon.svg" size={46} />
      <span>Пролазы</span>
    </NavLink>
  )
  const profileLink = (
    <NavLink
      to="/profile"
      tabIndex={guide?.open ? -1 : undefined}
      className={({ isActive }) => (isActive ? 'nav-btn is-active' : 'nav-btn')}
    >
      <SvgIcon src={genderIcon} size={46} />
      <span>Профиль</span>
    </NavLink>
  )

  const navClass = ['bottom-nav', guide ? 'can-guide' : '', guide?.open ? 'is-guide' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <nav className={navClass} aria-label={guide?.open ? 'Инструкция' : 'Разделы'}>
      <div className="nav-face" aria-hidden={guide?.open} inert={Boolean(guide?.open)}>
        {climbs}
        {pair ? null : (
          <button type="button" className="nav-add" onClick={() => guide?.start()}>
            <span className="nav-plus">
              <svg width="75" height="50" viewBox="150 10 75 50" aria-hidden="true">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M210 10C218.284 10 225 16.7157 225 25V45C225 53.2843 218.284 60 210 60H165C156.716 60 150 53.2843 150 45V25C150 16.7157 156.716 10 165 10H210ZM187.501 23.1445C186.673 23.1445 186.001 23.8161 186.001 24.6445V33.5H176.405C175.577 33.5 174.905 34.1716 174.905 35C174.905 35.8283 175.577 36.5 176.405 36.5H186.001V45.3555C186.001 46.1837 186.673 46.8555 187.501 46.8555C188.329 46.855 189.001 46.1834 189.001 45.3555V36.5H198.596C199.424 36.4997 200.096 35.8281 200.096 35C200.096 34.1718 199.424 33.5003 198.596 33.5H189.001V24.6445C189.001 23.8164 188.329 23.145 187.501 23.1445Z"
                />
              </svg>
            </span>
            <span>Новая запись</span>
          </button>
        )}
        {profileLink}
      </div>
      {guide ? (
        <div className="nav-actions" aria-hidden={!guide.open} inert={!guide.open}>
          <button type="button" className="btn capture-guide-back" onClick={() => guide.back()}>
            Назад
          </button>
          <button type="button" className="btn capture-guide-next" onClick={() => guide.next()}>
            Далее
          </button>
        </div>
      ) : null}
    </nav>
  )
}
