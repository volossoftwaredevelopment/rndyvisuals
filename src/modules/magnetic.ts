// Magnetic CTAs (§7) — 80px activation radius around the element bounds,
// 0.35 pull / 0.15 label counter-pull, 24px clamp, elastic snap-back.

import gsap from 'gsap'

const RADIUS = 80
const STRENGTH = 0.35
const LABEL_STRENGTH = 0.15
const CLAMP = 24

interface MagItem {
  el: HTMLElement
  label: HTMLElement | null
  active: boolean
  x: number
  y: number
}

const items: MagItem[] = []
let bound = false

function release(item: MagItem): void {
  item.active = false
  item.x = 0
  item.y = 0
  gsap.to(item.el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)', overwrite: 'auto' })
  if (item.label) {
    gsap.to(item.label, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)', overwrite: 'auto' })
  }
}

function onMove(e: PointerEvent): void {
  for (const item of items) {
    const r = item.el.getBoundingClientRect()
    // rect reflects the current translation — subtract it to get the resting box
    const left = r.left - item.x
    const top = r.top - item.y
    const within =
      e.clientX >= left - RADIUS &&
      e.clientX <= left + r.width + RADIUS &&
      e.clientY >= top - RADIUS &&
      e.clientY <= top + r.height + RADIUS

    if (within) {
      item.active = true
      const cx = left + r.width / 2
      const cy = top + r.height / 2
      let dx = (e.clientX - cx) * STRENGTH
      let dy = (e.clientY - cy) * STRENGTH
      const len = Math.hypot(dx, dy)
      if (len > CLAMP) {
        dx *= CLAMP / len
        dy *= CLAMP / len
      }
      item.x = dx
      item.y = dy
      gsap.to(item.el, { x: dx, y: dy, duration: 0.3, ease: 'power3.out', overwrite: 'auto' })
      if (item.label) {
        const ratio = LABEL_STRENGTH / STRENGTH
        gsap.to(item.label, {
          x: -dx * ratio,
          y: -dy * ratio,
          duration: 0.3,
          ease: 'power3.out',
          overwrite: 'auto',
        })
      }
    } else if (item.active) {
      release(item)
    }
  }
}

function bind(): void {
  if (bound) return
  bound = true
  window.addEventListener('pointermove', onMove, { passive: true })
}

/** Register one element (overlay close button uses this directly). */
export function magnetize(el: HTMLElement): () => void {
  const item: MagItem = {
    el,
    label: el.querySelector<HTMLElement>('[data-magnetic-label]'),
    active: false,
    x: 0,
    y: 0,
  }
  items.push(item)
  bind()
  return () => {
    const i = items.indexOf(item)
    if (i >= 0) items.splice(i, 1)
    gsap.set(item.el, { x: 0, y: 0 })
    if (item.label) gsap.set(item.label, { x: 0, y: 0 })
  }
}

/** Register every [data-magnetic] element in the document, except those inside
 * the overlay — the overlay owns its close button's magnetize/unmagnetize
 * lifecycle (only while open), so it must not be double-registered here on a
 * matchMedia re-eval. */
export function initMagnetics(): () => void {
  const offs = gsap.utils
    .toArray<HTMLElement>('[data-magnetic]')
    .filter((el) => !el.closest('.overlay'))
    .map(magnetize)
  return () => offs.forEach((off) => off())
}
