import { useUi } from '../i18n'

function Hold({ x, y, r = 20 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y + 5} rx={r} ry={r * 0.78} fill="#e24d00" />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.78} fill="#ff9340" />
      <ellipse cx={x - r * 0.28} cy={y - r * 0.28} rx={r * 0.28} ry={r * 0.16} fill="#ffe3c8" />
    </g>
  )
}

function Figure({ color, reach }: { color: string; reach: number }) {
  return (
    <g fill="none" stroke={color} strokeWidth="18" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="168" cy={156 - reach * 0.15} r="16" fill={color} stroke="none" />
      <path d={`M168 ${174 - reach * 0.1} C166 206 160 220 158 234`} />
      <path d="M166 192 L118 224" />
      <path d={`M168 188 L${228 + reach} ${132 - reach}`} />
      <path d="M158 234 L118 302" />
      <path d={`M160 234 L${206 + reach * 0.3} ${292 - reach * 0.45}`} />
    </g>
  )
}

export function ClimberArt() {
  const t = useUi()
  return (
    <svg className="climber-art" viewBox="0 0 360 420" role="img" aria-label={t.climberArt}>
      <Hold x={118} y={312} />
      <Hold x={214} y={286} r={18} />
      <Hold x={122} y={228} r={16} />
      <Hold x={250} y={124} />
      <Hold x={312} y={72} r={17} />
      <g transform="translate(34 -42)">
        <Figure color="#d7f2fb" reach={28} />
      </g>
      <Figure color="#1a1a1a" reach={0} />
    </svg>
  )
}
