import type { ButtonHTMLAttributes } from 'react'

type ChipButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }

export function ChipButton({ selected, className = '', ...props }: ChipButtonProps) {
  return <button type="button" aria-pressed={selected}
    className={['chip', selected && 'is-on', className].filter(Boolean).join(' ')} {...props} />
}
