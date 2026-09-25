export function Logo({ size = 112 }: { size?: number }) {
  return (
    <svg
      className="logo-splash"
      width={size}
      height={size * 0.78}
      viewBox="0 0 128 100"
      fill="none"
      role="img"
      aria-label="Beta Climb"
    >
      <path
        d="M18 82 V24 H46 C63 24 70 36 70 47 C70 60 61 68 46 68 H32"
        stroke="white"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M38 66 L60 82" stroke="white" strokeWidth="12" strokeLinecap="round" />
      <path fill="white" d="M78 84 L98 30 c1.2-2.4 4.6-2.4 5.8 0 L124 84 H78 Z" />
    </svg>
  )
}
