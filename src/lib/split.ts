// SplitType helper — line masks + aria fixes + width-only debounced re-split (§6).

import SplitType from 'split-type'

export interface LineSplit {
  el: HTMLElement
  lines: HTMLElement[]
  masks: HTMLElement[]
  /** reveals.ts re-applies hidden states / rebuilds tweens here */
  onResplit: (() => void) | null
}

interface RegistryEntry extends LineSplit {
  instance: SplitType
}

const registry: RegistryEntry[] = []
const afterAll: Array<() => void> = []

let lastWidth = 0
let resizeTimer: number | undefined
let resizeBound = false

function wrapLines(instance: SplitType): { lines: HTMLElement[]; masks: HTMLElement[] } {
  const lines = instance.lines ?? []
  const masks = lines.map((line) => {
    const mask = document.createElement('div')
    mask.className = 'line-mask'
    mask.setAttribute('aria-hidden', 'true')
    line.parentNode?.insertBefore(mask, line)
    mask.appendChild(line)
    return mask
  })
  return { lines, masks }
}

function resplit(entry: RegistryEntry): void {
  // revert restores the original innerHTML, which drops our mask wrappers too
  entry.instance.revert()
  entry.instance.split({})
  const { lines, masks } = wrapLines(entry.instance)
  entry.lines = lines
  entry.masks = masks
  entry.onResplit?.()
}

function bindResize(): void {
  if (resizeBound) return
  resizeBound = true
  lastWidth = window.innerWidth
  window.addEventListener('resize', () => {
    // §13 — ignore height-only resizes (mobile URL bar)
    if (window.innerWidth === lastWidth) return
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      lastWidth = window.innerWidth
      registry.forEach(resplit)
      afterAll.forEach((cb) => cb())
    }, 200)
  })
}

/** Split an element into masked lines; original text stays accessible via aria-label. */
export function splitLines(el: HTMLElement): LineSplit {
  const existing = registry.find((e) => e.el === el)
  if (existing) return existing
  const original = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  el.setAttribute('aria-label', original)
  const instance = new SplitType(el, { types: 'lines' })
  const { lines, masks } = wrapLines(instance)
  const entry: RegistryEntry = { el, lines, masks, onResplit: null, instance }
  registry.push(entry)
  bindResize()
  return entry
}

/** Runs after every re-split pass (e.g. ScrollTrigger.refresh). */
export function onAfterResplit(cb: () => void): void {
  afterAll.push(cb)
}

/** Force a re-split (used once after document.fonts.ready — metrics change). */
export function resplitAll(): void {
  registry.forEach(resplit)
  afterAll.forEach((cb) => cb())
}

/**
 * Manual char split for fixed copy (hero H1) — avoids SplitType edge cases
 * with multi-span markup. Returns the char spans, spaces preserved as nbsp.
 */
export function charSpans(el: HTMLElement): HTMLElement[] {
  const text = el.textContent ?? ''
  el.textContent = ''
  return [...text].map((ch) => {
    const span = document.createElement('span')
    span.className = 'char'
    span.textContent = ch === ' ' ? ' ' : ch
    el.appendChild(span)
    return span
  })
}
