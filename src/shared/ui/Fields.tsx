import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { IconChevron } from './icons'
import { SvgIcon } from './SvgIcon'
import type { GenderId } from '../api'

interface Option<T extends string> {
  value: T
  label: string
}

function useRaisedMenu(open: boolean, rootRef: RefObject<HTMLDivElement | null>) {
  const [raised, setRaised] = useState(false)

  useEffect(() => {
    if (open) {
      setRaised(true)
      return
    }
    const node = rootRef.current?.querySelector('.field-menu-clip')
    if (!node) return
    const clear = (event?: Event) => {
      if (event && event.target !== node) return
      setRaised(false)
    }
    node.addEventListener('transitionend', clear)
    const timer = window.setTimeout(clear, 360)
    return () => {
      node.removeEventListener('transitionend', clear)
      window.clearTimeout(timer)
    }
  }, [open, rootRef])

  return raised
}

function fieldClass(open: boolean, raised: boolean) {
  return ['field', open ? 'is-open' : '', raised ? 'is-raised' : ''].filter(Boolean).join(' ')
}

export function SelectField<T extends string>({
  value,
  placeholder,
  options,
  error,
  onChange,
}: {
  value: T | null
  placeholder: string
  options: readonly Option<T>[]
  error?: string | null
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const raised = useRaisedMenu(open, rootRef)
  const label = options.find((option) => option.value === value)?.label

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={fieldClass(open, raised)} ref={rootRef}>
      <button
        type="button"
        className={label ? 'field-control is-filled' : 'field-control'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={label ? 'field-value' : error ? 'field-value is-placeholder is-invalid' : 'field-value is-placeholder'}>
          {label ?? error ?? placeholder}
        </span>
        <span className="chevron"><IconChevron /></span>
      </button>
      <div className="field-menu-clip" inert={open ? undefined : true}>
        <ul className="field-menu" role="listbox">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                className={option.value === value ? 'field-option is-selected' : 'field-option'}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function MultiSelectField<T extends string>({
  value,
  placeholder,
  options,
  error,
  onChange,
}: {
  value: T[]
  placeholder: string
  options: readonly Option<T>[]
  error?: string | null
  onChange: (value: T[]) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const raised = useRaisedMenu(open, rootRef)
  const label = options
    .filter((option) => value.includes(option.value))
    .map((option) => option.label)
    .join(', ')

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle(next: T) {
    onChange(value.includes(next) ? value.filter((item) => item !== next) : [...value, next])
  }

  return (
    <div className={fieldClass(open, raised)} ref={rootRef}>
      <button
        type="button"
        className={label ? 'field-control is-filled' : 'field-control'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={label ? 'field-value' : error ? 'field-value is-placeholder is-invalid' : 'field-value is-placeholder'}>
          {label || error || placeholder}
        </span>
        <span className="chevron"><IconChevron /></span>
      </button>
      <div className="field-menu-clip" inert={open ? undefined : true}>
        <ul className="field-menu is-multi" role="listbox" aria-multiselectable="true">
          {options.map((option) => {
            const selected = value.includes(option.value)
            return (
              <li key={option.value}>
                <button
                  type="button"
                  className={selected ? 'field-option is-selected' : 'field-option'}
                  aria-pressed={selected}
                  onClick={() => toggle(option.value)}
                >
                  {option.label}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export function NumberField({
  value,
  placeholder,
  invalid,
  onChange,
}: {
  value: number | null
  placeholder: string
  invalid?: boolean
  onChange: (value: number | null) => void
}) {
  const id = useId()
  return (
    <label className="field" htmlFor={id}>
      <span className="visually-hidden">{placeholder}</span>
      <input
        id={id}
        className={invalid ? 'field-control is-invalid' : 'field-control'}
        inputMode="numeric"
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, '').slice(0, 3)
          onChange(digits ? Number(digits) : null)
        }}
      />
    </label>
  )
}

export function GenderField({
  value,
  error,
  onChange,
}: {
  value: GenderId | null
  error?: string | null
  onChange: (value: GenderId) => void
}) {
  const invalid = Boolean(error) && value == null
  return (
    <div className="gender-row" role="radiogroup" aria-label="Пол">
      <GenderCard label={invalid ? error ?? 'Укажи пол' : 'Мужской'} invalid={invalid} pressed={value === 'male'} onClick={() => onChange('male')}>
        <SvgIcon src="/male.svg" size={78} />
      </GenderCard>
      <GenderCard label={invalid ? error ?? 'Укажи пол' : 'Женский'} invalid={invalid} pressed={value === 'female'} onClick={() => onChange('female')}>
        <SvgIcon src="/female.svg" size={78} />
      </GenderCard>
    </div>
  )
}

function GenderCard({
  label,
  pressed,
  invalid,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  invalid?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const className = ['gender-card', pressed ? 'is-on' : '', invalid ? 'is-invalid' : ''].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      className={className}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

export function ConsentField({
  checked,
  error,
  onChange,
}: {
  checked: boolean
  error?: string | null
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  const invalid = Boolean(error) && !checked
  return (
    <label className={invalid ? 'consent is-invalid' : 'consent'} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="consent-box">
        <span className="consent-prompt" aria-hidden={invalid ? undefined : true}>
          Согласитесь
        </span>
      </span>
      <span className="consent-text">Согласен на обработку персональных данных</span>
    </label>
  )
}
