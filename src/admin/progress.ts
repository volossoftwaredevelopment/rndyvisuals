// Upload progress read-out: a bar plus "120 MB of 260 MB · 45% · 2 min left".
// A long upload with no feedback feels broken, so this is deliberately explicit
// about how much is done, how fast it is going and how long is left.

import { formatBytes, formatDuration, formatSpeed } from './r2upload'
import type { UploadProgress } from './r2upload'

export interface ProgressUi {
  /** Show the bar and set the file being sent. */
  start(filename: string): void
  update(p: UploadProgress): void
  /** Hide the bar; pass a message to leave a line behind. */
  done(message?: string, kind?: 'ok' | 'error'): void
}

/** Builds (once) and returns the progress UI attached after `anchor`. */
export function createProgress(anchor: HTMLElement): ProgressUi {
  const box = document.createElement('div')
  box.className = 'uprog'
  box.hidden = true
  box.innerHTML = `
    <div class="uprog__top">
      <span class="uprog__name"></span>
      <span class="uprog__pct">0%</span>
    </div>
    <div class="uprog__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <span class="uprog__fill"></span>
    </div>
    <div class="uprog__stats"></div>`
  anchor.insertAdjacentElement('afterend', box)

  const nameEl = box.querySelector<HTMLElement>('.uprog__name')!
  const pctEl = box.querySelector<HTMLElement>('.uprog__pct')!
  const trackEl = box.querySelector<HTMLElement>('.uprog__track')!
  const fillEl = box.querySelector<HTMLElement>('.uprog__fill')!
  const statsEl = box.querySelector<HTMLElement>('.uprog__stats')!

  return {
    start(filename: string): void {
      box.hidden = false
      box.classList.remove('is-done', 'is-error')
      nameEl.textContent = filename
      pctEl.textContent = '0%'
      fillEl.style.width = '0%'
      statsEl.textContent = 'Starting…'
      trackEl.setAttribute('aria-valuenow', '0')
    },
    update(p: UploadProgress): void {
      const pct = Math.min(100, Math.round(p.fraction * 100))
      pctEl.textContent = `${pct}%`
      fillEl.style.width = `${pct}%`
      trackEl.setAttribute('aria-valuenow', String(pct))
      const parts = [`${formatBytes(p.loaded)} of ${formatBytes(p.total)}`]
      if (p.bytesPerSecond > 0) parts.push(formatSpeed(p.bytesPerSecond))
      if (p.secondsLeft !== null && p.secondsLeft > 0) parts.push(`${formatDuration(p.secondsLeft)} left`)
      statsEl.textContent = parts.join(' · ')
    },
    done(message, kind = 'ok'): void {
      if (!message) {
        box.hidden = true
        return
      }
      box.classList.add('is-done')
      box.classList.toggle('is-error', kind === 'error')
      if (kind === 'ok') {
        pctEl.textContent = '100%'
        fillEl.style.width = '100%'
      }
      statsEl.textContent = message
    },
  }
}
