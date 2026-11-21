import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

let transitionLock = false

export function RouteTransition({
  transitionKey,
  animate = true,
  name,
  children,
}: {
  transitionKey: string
  animate?: boolean
  name: 'screen' | 'pane'
  children: ReactNode
}) {
  const [shownKey, setShownKey] = useState(transitionKey)
  const previousView = useRef(children)
  const live = shownKey === transitionKey

  // A group of tabs keeps the same outer key while its visible route changes.
  useLayoutEffect(() => {
    if (live) previousView.current = children
  }, [live, children])

  useLayoutEffect(() => {
    if (shownKey === transitionKey) return
    const canTransition =
      animate &&
      !prefersReducedMotion() &&
      typeof document.startViewTransition === 'function' &&
      !transitionLock

    if (!canTransition) {
      setShownKey(transitionKey)
      return
    }

    transitionLock = true
    const root = document.documentElement
    root.dataset.routeTransition = name
    let current = true
    const transition = document.startViewTransition(() => {
      if (current) flushSync(() => setShownKey(transitionKey))
    })
    transition.finished.finally(() => {
      transitionLock = false
      delete root.dataset.routeTransition
    })
    return () => { current = false }
  }, [animate, name, shownKey, transitionKey])

  return (
    <div className="route-transition">
      <div
        className="route-enter-layer"
        key={shownKey}
        data-route-layer={name}
      >
        {live ? children : previousView.current}
      </div>
    </div>
  )
}
