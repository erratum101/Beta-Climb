import { NavLink, useLocation } from 'react-router-dom'
import { useSession } from '../../app/session'
import type { HomeGuideControls } from '../../features/capture/CaptureGuide'
import { IconPlus } from './icons'
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
      <SvgIcon src="/male-climbing-icon.svg" size={pair ? 36 : 28} />
      <span>Пролазы</span>
    </NavLink>
  )
  const profileLink = (
    <NavLink
      to="/profile"
      tabIndex={guide?.open ? -1 : undefined}
      className={({ isActive }) => (isActive ? 'nav-btn is-active' : 'nav-btn')}
    >
      <SvgIcon src={genderIcon} size={pair ? 36 : 28} />
      <span>Профиль</span>
    </NavLink>
  )

  const navClass = ['bottom-nav', pair ? 'is-pair' : '', guide ? 'can-guide' : '', guide?.open ? 'is-guide' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <nav className={navClass} aria-label={guide?.open ? 'Инструкция' : 'Разделы'}>
      <div className="nav-face" aria-hidden={guide?.open} inert={Boolean(guide?.open)}>
        {climbs}
        {pair ? null : (
          <button type="button" className="nav-add" onClick={() => guide?.start()}>
            <span className="nav-plus">
              <IconPlus size={24} />
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
