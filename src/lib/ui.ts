// Shared UI helpers — refcounted scroll lock (so nested dialogs don't unlock
// early) and a basic focus trap for modals/drawers.

type Lenis = { stop: () => void; start: () => void }
const lenis = (): Lenis | undefined => (window as unknown as { __lenis?: Lenis }).__lenis

let locks = 0

export function lockScroll(): void {
  locks += 1
  if (locks === 1) {
    document.documentElement.classList.add('is-locked')
    lenis()?.stop()
  }
}

export function unlockScroll(): void {
  locks = Math.max(0, locks - 1)
  if (locks === 0) {
    document.documentElement.classList.remove('is-locked')
    lenis()?.start()
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/** Call from a keydown handler while a dialog is open to keep Tab inside it. */
export function trapFocus(container: HTMLElement, e: KeyboardEvent): void {
  if (e.key !== 'Tab') return
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
