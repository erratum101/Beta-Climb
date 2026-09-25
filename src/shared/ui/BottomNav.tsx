import { NavLink, useLocation } from 'react-router-dom'
import { useSession } from '../../app/session'
import { IconPlus } from './icons'
import { SvgIcon } from './SvgIcon'

export function BottomNav() {
  const { profile, attempts } = useSession()
  const { pathname } = useLocation()
  const genderIcon = profile?.gender === 'male' ? '/male.svg' : '/female.svg'
  const pair =
    attempts.length === 0 &&
    (pathname === '/climbs' || pathname === '/home' || pathname === '/profile')

  return (
    <nav className={pair ? 'bottom-nav is-pair' : 'bottom-nav'} aria-label="Разделы">
      <NavLink to="/climbs" className={({ isActive }) => (isActive ? 'nav-btn is-active' : 'nav-btn')}>
        <SvgIcon src="/male-climbing-icon.svg" size={pair ? 36 : 28} />
        <span>Пролазы</span>
      </NavLink>
      {pair ? null : (
        <NavLink to="/attempt/new" className="nav-add">
          <span className="nav-plus">
            <IconPlus size={24} />
          </span>
          <span>Новая запись</span>
        </NavLink>
      )}
      <NavLink to="/profile" className={({ isActive }) => (isActive ? 'nav-btn is-active' : 'nav-btn')}>
        <SvgIcon src={genderIcon} size={pair ? 36 : 28} />
        <span>Профиль</span>
      </NavLink>
    </nav>
  )
}
