export function SvgIcon({ src, size = 24 }: { src: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="svg-icon"
      style={{
        width: size,
        height: size,
        maskImage: `url("${src}")`,
        WebkitMaskImage: `url("${src}")`,
      }}
    />
  )
}
