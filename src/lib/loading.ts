// A quiet loading hint for the public site.
//
// Content comes from the API, which is normally fast enough that showing
// anything would just be noise. So the bar only appears once a load is taking
// longer than usual — a slow connection, a cold start — and then it says so
// rather than leaving the visitor looking at an empty page.

const SHOW_AFTER_MS = 450

let bar: HTMLElement | null = null
let showTimer = 0
let depth = 0

function ensureBar(): HTMLElement {
  if (bar) return bar
  bar = document.createElement('div')
  bar.className = 'loadbar'
  bar.setAttribute('role', 'status')
  bar.setAttribute('aria-live', 'polite')
  bar.innerHTML = '<span class="loadbar__fill"></span><span class="sr-only">Loading…</span>'
  document.body.appendChild(bar)
  return bar
}

function show(): void {
  ensureBar().classList.add('is-on')
}

function hide(): void {
  bar?.classList.remove('is-on')
}

/**
 * Wrap any promise the page is waiting on. Shows the bar only if the work is
 * still running after SHOW_AFTER_MS, and clears it when everything is done.
 */
export function withLoading<T>(work: Promise<T>): Promise<T> {
  depth += 1
  if (depth === 1) {
    window.clearTimeout(showTimer)
    showTimer = window.setTimeout(show, SHOW_AFTER_MS)
  }
  const settle = (): void => {
    depth = Math.max(0, depth - 1)
    if (depth === 0) {
      window.clearTimeout(showTimer)
      hide()
    }
  }
  return work.then(
    (v) => {
      settle()
      return v
    },
    (e) => {
      settle()
      throw e
    },
  )
}
