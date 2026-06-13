// Work index (§4.4) — renders manifest rows into the edit-bin list.

import type { VideoEntry } from '../types'
import { createPoster } from './posters'

export interface WorkRow {
  el: HTMLElement
  button: HTMLButtonElement
  index: number
  entry: VideoEntry
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export function renderWorkIndex(list: HTMLElement, videos: VideoEntry[]): WorkRow[] {
  const rows = videos.map((entry, i) => {
    const num = String(i + 1).padStart(2, '0')

    const li = document.createElement('li')
    li.className = 'work-row'

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'work-row__btn'
    btn.dataset.cursor = 'play'
    btn.dataset.workIndex = String(i)
    btn.setAttribute('aria-label', `${entry.title} — ${entry.category}, ${entry.year}. Open player`)
    btn.innerHTML = `
      <span class="work-row__rule" aria-hidden="true"></span>
      <span class="work-row__poster-box" aria-hidden="true"></span>
      <span class="work-row__index micro tabular" aria-hidden="true"><span class="work-row__index-slide"><span class="work-row__index-stack"><span>${num}</span><span class="work-row__index-hi">${num}</span></span></span></span>
      <span class="work-row__title display">${esc(entry.title)}</span>
      <span class="work-row__meta work-row__client micro">${esc(entry.client)}</span>
      <span class="work-row__meta work-row__category micro">${esc(entry.category)}</span>
      <span class="work-row__meta work-row__duration micro tabular">${esc(entry.duration)}</span>
      <span class="work-row__meta work-row__year micro tabular">${entry.year}</span>
    `

    // static gradient/thumb poster — visible as the stacked card on touch (§13)
    btn.querySelector('.work-row__poster-box')?.appendChild(createPoster(entry, i))

    li.appendChild(btn)
    list.appendChild(li)
    return { el: li, button: btn, index: i, entry }
  })

  // closing hairline under the last row
  const end = document.createElement('li')
  end.setAttribute('aria-hidden', 'true')
  end.innerHTML = '<span class="rule-line" data-reveal="rule"></span>'
  list.appendChild(end)

  return rows
}
