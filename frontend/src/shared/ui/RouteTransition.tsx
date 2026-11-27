import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

let routeGeneration = 0

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
  const shellRef = useRef<HTMLDivElement>(null)
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
      typeof document.startViewTransition === 'function'

    if (!canTransition) {
      setShownKey(transitionKey)
      return
    }

    // Strict Mode runs this effect twice before paint. Wait a frame so the
    // cleanup can drop the duplicate and only one transition starts.
    let cancel = false
    const frame = requestAnimationFrame(() => {
      if (cancel) return
      const ticket = ++routeGeneration
      const root = document.documentElement
      const shell = shellRef.current
      root.dataset.routeTransition = name
      let transition: ViewTransition
      try {
        transition = document.startViewTransition(() => {
          flushSync(() => setShownKey(transitionKey))
        })
      } catch {
        delete root.dataset.routeTransition
        setShownKey(transitionKey)
        return
      }
      transition.finished.finally(() => {
        if (ticket !== routeGeneration) return
        delete root.dataset.routeTransition
        shell?.classList.add('is-settled')
      })
    })

    return () => {
      cancel = true
      cancelAnimationFrame(frame)
    }
  }, [animate, name, shownKey, transitionKey])

  return (
    <div className="route-transition" ref={shellRef}>
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
