import type { NavigateFunction } from 'react-router-dom'

/** Same name on the pressed card and the screen it opens, so the object travels instead of fading in place. */
export const SHARED_ATTEMPT = 'shared-attempt'

export function sharedNavigate(navigate: NavigateFunction, to: string, source?: HTMLElement | null) {
  if (source) source.style.viewTransitionName = SHARED_ATTEMPT
  navigate(to)
}
