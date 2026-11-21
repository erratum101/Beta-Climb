interface IconProps {
  size?: number
}

export function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M13.5 5.5 L7.5 11 L13.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconChevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M4.5 7 L9 11.5 L13.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconEye({ crossed }: { crossed: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.8" />
      {crossed && <path d="m3 3 18 18" />}
    </svg>
  )
}

export function IconHome() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M4.5 12.5 L13 5 L21.5 12.5 V21.5 H16 V15.5 H10 V21.5 H4.5 V12.5 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

export function IconClimbs() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14.5" y="4" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="14.5" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14.5" y="14.5" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function IconPlus({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M14 6.5 V21.5 M6.5 14 H21.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconHistory() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M13 8.5 V13.2 L16.2 15.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconProfile() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="9" r="3.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.8 20.5 C7.2 16.6 9.8 15 13 15 C16.2 15 18.8 16.6 20.2 20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function IconFilter() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3.5 5 H16.5 L11.5 10.5 V15.5 L8.5 16.8 V10.5 L3.5 5 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function IconPlay() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M10 7.5 L21 14 L10 20.5 Z" fill="currentColor" />
    </svg>
  )
}

export function IconPause() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="8" y="7" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="16" y="7" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

export function IconMale() {
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
      <circle cx="23" cy="15" r="7" fill="currentColor" />
      <path d="M8 40 c2.4-8 7.4-11.5 15-11.5 S35.6 32 38 40" fill="currentColor" />
    </svg>
  )
}

export function IconFemale() {
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
      <circle cx="30" cy="12" r="3.3" fill="currentColor" />
      <circle cx="22" cy="16" r="6.4" fill="currentColor" />
      <path d="M9 40 c2.2-8 6.8-11.5 14-11.5 S34.8 32 37 40" fill="currentColor" />
    </svg>
  )
}
