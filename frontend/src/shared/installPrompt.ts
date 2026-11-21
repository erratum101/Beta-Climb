interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

let listening = false
let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

/** Stash Chrome's install dialog so a button can open it later. */
export function captureInstallPrompt() {
  if (listening) return
  listening = true

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    notify()
  })
}

export function isAppInstalled() {
  return installed
}

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opens the browser install dialog. Must run inside a click. */
export async function promptInstall(): Promise<InstallOutcome> {
  const event = deferred
  if (!event) return 'unavailable'
  deferred = null
  notify()
  try {
    await event.prompt()
    const choice = await event.userChoice
    if (choice.outcome === 'accepted') installed = true
    return choice.outcome
  } catch {
    return 'unavailable'
  }
}
