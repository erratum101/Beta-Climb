import type { ReactNode } from 'react'
import { useUi } from '../i18n'
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
  const t = useUi()
  return (
    <header className="topbar">
      {onBack ? (
        <button type="button" className="icon-btn" onClick={onBack} aria-label={t.back}>
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
