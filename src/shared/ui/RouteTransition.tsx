import type { ReactNode } from 'react'

export function RouteTransition({
  transitionKey,
  animate = true,
  children,
}: {
  transitionKey: string
  animate?: boolean
  children: ReactNode
}) {
  return (
    <div key={transitionKey} className={animate ? 'route-transition' : 'route-transition is-static'}>
      {children}
    </div>
  )
}
