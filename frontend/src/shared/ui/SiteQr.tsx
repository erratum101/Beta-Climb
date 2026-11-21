import { useMemo } from 'react'
import { SITE_QR_URL, siteQrGraphic } from './siteQrGraphic'

export function SiteQr() {
  const graphic = useMemo(() => siteQrGraphic(SITE_QR_URL), [])

  return (
    <figure className="landing-qr">
      <svg viewBox={graphic.viewBox} role="img" aria-label="QR-код: https://www.betaclimb.ru/">
        <path d={graphic.dots} fill="#1c1c1e" />
        {graphic.finders.map((finder) => (
          <g key={finder.key}>
            <rect x={finder.x} y={finder.y} width={7} height={7} rx={1.15} fill="#1c1c1e" />
            <rect x={finder.x + 1} y={finder.y + 1} width={5} height={5} rx={0.7} fill="#ffffff" />
            <rect x={finder.x + 2} y={finder.y + 2} width={3} height={3} rx={0.55} fill="#1c1c1e" />
          </g>
        ))}
        {graphic.plate ? (
          <g>
            <rect
              x={graphic.plate.x}
              y={graphic.plate.y}
              width={graphic.plate.size}
              height={graphic.plate.size}
              rx={graphic.plate.rx}
              fill="#ffffff"
            />
            <g transform={graphic.plate.transform} fill="#FD7115">
              {graphic.mark.map((d) => (
                <path key={d.slice(0, 24)} d={d} />
              ))}
            </g>
          </g>
        ) : null}
      </svg>
      <p>betaclimb.ru</p>
    </figure>
  )
}
