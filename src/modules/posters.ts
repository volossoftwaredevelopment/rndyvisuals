// Generated poster art (§8) — pure CSS/DOM, no image assets per item.

import type { VideoEntry } from '../types'

// Cool/editorial hue per category — kept in the 168–300° range so posters stay
// cohesive with the cold palette + teal accent while varying by work type (§8).
const HUE_BY_CATEGORY: Record<string, number> = {
  Commercial: 205,
  'Brand Film': 190,
  'Music Video': 280,
  'Event Film': 235,
  Fashion: 300,
  Product: 168,
  Documentary: 250,
  Corporate: 215,
}

/** Deterministic ±8° jitter from the id hash (§8). */
function hueJitter(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return (h % 17) - 8
}

export function posterHue(entry: VideoEntry): number {
  const base = (entry.category && HUE_BY_CATEGORY[entry.category]) || 200
  return base + hueJitter(entry.id)
}

export interface PosterOptions {
  /** index watermark + duration chip + client line; off for the showreel frame */
  chrome?: boolean
}

export function createPoster(entry: VideoEntry, index: number, opts: PosterOptions = {}): HTMLElement {
  const { chrome = true } = opts

  const root = document.createElement('div')
  root.className = 'poster'
  root.style.setProperty('--poster-hue', String(posterHue(entry)))
  root.setAttribute('aria-hidden', 'true')

  const gradient = document.createElement('div')
  gradient.className = 'poster__gradient'
  root.appendChild(gradient)

  // §10 resolution rules: explicit poster, else YouTube hqdefault, else gradient only
  const thumbSrc =
    entry.poster ||
    (entry.source.type === 'youtube' && entry.source.id
      ? `https://i.ytimg.com/vi/${entry.source.id}/hqdefault.jpg`
      : '')
  if (thumbSrc) {
    const img = document.createElement('img')
    img.className = 'poster__thumb'
    img.src = thumbSrc
    img.alt = ''
    img.loading = 'lazy'
    img.decoding = 'async'
    root.appendChild(img)
  }

  const grain = document.createElement('div')
  grain.className = 'poster__grain'
  root.appendChild(grain)

  if (chrome) {
    const watermark = document.createElement('span')
    watermark.className = 'poster__index'
    watermark.textContent = String(index + 1).padStart(2, '0')
    root.appendChild(watermark)

    const line = [entry.client, entry.year].filter(Boolean).join(' · ')
    if (line) {
      const client = document.createElement('span')
      client.className = 'poster__client'
      client.textContent = line
      root.appendChild(client)
    }

    if (entry.duration) {
      const chip = document.createElement('span')
      chip.className = 'chip poster__chip'
      chip.textContent = entry.duration
      root.appendChild(chip)
    }
  }

  return root
}
