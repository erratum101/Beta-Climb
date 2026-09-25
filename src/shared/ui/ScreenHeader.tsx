import type { ReactNode } from 'react'
import { IconBack } from './icons'

export function ScreenHeader({
  title,
  onBack,
  trailing,
}: {
  title: string
  onBack?: () => void
  trailing?: ReactNode
}) {
  return (
    <header className="topbar">
      {onBack ? (
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Назад">
          <IconBack />
        </button>
      ) : (
        <span />
      )}
      <h1>{title}</h1>
      {trailing ?? <span />}
    </header>
  )
}
