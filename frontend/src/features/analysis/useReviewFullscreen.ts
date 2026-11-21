import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type Mode = 'inline' | 'fullscreen' | 'window'

export function useReviewFullscreen() {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<{ screen: HTMLElement; top: number } | null>(null)
  const [mode, setMode] = useState<Mode>('inline')

  useEffect(() => {
    function syncFullscreen() {
      if (workspaceRef.current && document.fullscreenElement === workspaceRef.current) setMode('fullscreen')
      else setMode((current) => current === 'fullscreen' ? 'inline' : current)
    }
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  useLayoutEffect(() => {
    const root = workspaceRef.current
    if (!root) return
    if (mode === 'inline') {
      if (returnTo.current) {
        returnTo.current.screen.scrollTop = returnTo.current.top
        buttonRef.current?.focus({ preventScroll: true })
        returnTo.current = null
      }
      return
    }

    // A manual popover puts this same video above transformed or clipped app containers on iPhone.
    if (mode === 'window' && typeof root.showPopover === 'function') {
      root.popover = 'manual'
      root.showPopover()
    }
    const background: HTMLElement[] = []
    for (let node: HTMLElement | null = root; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true
          background.push(sibling)
        }
      }
    }
    buttonRef.current?.focus({ preventScroll: true })
    function escape(event: KeyboardEvent) {
      if (mode === 'window' && event.key === 'Escape') {
        event.preventDefault()
        setMode('inline')
      }
    }
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('keydown', escape)
      for (const sibling of background) sibling.inert = false
      if (root.popover === 'manual') {
        if (root.matches(':popover-open')) root.hidePopover()
        root.removeAttribute('popover')
      }
    }
  }, [mode])

  async function toggleFullscreen() {
    const root = workspaceRef.current
    if (!root) return
    if (document.fullscreenElement === root) {
      await document.exitFullscreen()
      return
    }
    if (mode === 'window') {
      setMode('inline')
      return
    }
    const screen = root.closest<HTMLElement>('.screen')
    if (screen) returnTo.current = { screen, top: screen.scrollTop }
    if (document.fullscreenEnabled && root.requestFullscreen) {
      try {
        await root.requestFullscreen()
        return
      } catch {
        // Embedded browsers can expose the API while declining the actual request.
      }
    }
    if (root.isConnected) setMode('window')
  }

  return { workspaceRef, buttonRef, expanded: mode !== 'inline', toggleFullscreen }
}
