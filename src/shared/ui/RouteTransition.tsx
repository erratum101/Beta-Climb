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
  name?: string
  children: ReactNode
}) {
  const childrenRef = useRef(children)
  childrenRef.current = children
  const [shownKey, setShownKey] = useState(transitionKey)
  const [shownNode, setShownNode] = useState(children)
  const live = shownKey === transitionKey

  useLayoutEffect(() => {
    if (shownKey === transitionKey) return
    const nextKey = transitionKey
    const nextNode = childrenRef.current
    const commit = () => {
      flushSync(() => {
        setShownKey(nextKey)
        setShownNode(nextNode)
      })
    }
    const canTransition =
      animate &&
      !prefersReducedMotion() &&
      typeof document.startViewTransition === 'function' &&
      !transitionLock

    if (!canTransition) {
      commit()
      return
    }

    transitionLock = true
    document.documentElement.classList.add('is-vt')
    const transition = document.startViewTransition(() => {
      commit()
    })
    transition.finished.finally(() => {
      transitionLock = false
      document.documentElement.classList.remove('is-vt')
    })
  }, [animate, shownKey, transitionKey])

  return (
    <div className={animate ? 'route-transition' : 'route-transition is-static'}>
      <div
        className="route-enter-layer"
        key={shownKey}
        style={name ? { viewTransitionName: name } : undefined}
      >
        {live ? children : shownNode}
      </div>
    </div>
  )
}
