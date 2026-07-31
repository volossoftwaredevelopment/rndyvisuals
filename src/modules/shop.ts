// Our Products — a coverflow carousel (centre product largest, neighbours scale
// down) with a "View all" catalog toggle, plus a detail modal (description +
// pricing + add to cart). Cover art is a generated gradient (no image files).

import { PRODUCTS } from '../data/products'
import type { Product } from '../data/products'
import { add as addToCart } from '../lib/cart'
import { lockScroll, unlockScroll, trapFocus } from '../lib/ui'

const money = (n: number): string => `€${n}`

const ICON = {
  course:
    '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/></svg>',
  presets:
    '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 8h8M17 8h3M4 16h3M12 16h8"/><circle cx="14" cy="8" r="2.3" fill="currentColor" stroke="none"/><circle cx="9" cy="16" r="2.3" fill="currentColor" stroke="none"/></svg>',
  assets:
    '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
}

function iconFor(category: string): string {
  if (category === 'Presets') return ICON.presets
  if (category === 'Assets') return ICON.assets
  return ICON.course
}

function coverInner(p: Product): string {
  return `<span class="product__grad" aria-hidden="true"></span><span class="product__grain" aria-hidden="true"></span><span class="product__icon" aria-hidden="true">${iconFor(p.category)}</span>`
}

function cardHTML(p: Product, i: number): string {
  return `
  <article class="product" data-i="${i}">
    <button class="product__cover" data-product="${p.id}" style="--poster-hue:${p.hue}" aria-label="${p.title} — view details">
      ${coverInner(p)}
      <span class="product__badge micro">${p.category}</span>
    </button>
    <div class="product__row">
      <div class="product__info">
        <h3 class="product__title">${p.title}</h3>
        <span class="product__price">${money(p.price)}</span>
      </div>
      <button type="button" class="product__add" data-add="${p.id}">Add to cart</button>
    </div>
  </article>`
}

function buildModal(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'pmodal'
  el.innerHTML = `
    <div class="pmodal__scrim" data-pmodal-close></div>
    <div class="pmodal__panel" role="dialog" aria-modal="true" aria-label="Product details">
      <button type="button" class="pmodal__close" aria-label="Close" data-pmodal-close>×</button>
      <div class="pmodal__cover" data-pmodal-cover></div>
      <div class="pmodal__body">
        <span class="pmodal__cat micro" data-pmodal-cat></span>
        <h3 class="pmodal__title display" data-pmodal-title></h3>
        <p class="pmodal__price" data-pmodal-price></p>
        <p class="pmodal__blurb" data-pmodal-blurb></p>
        <ul class="pmodal__features" data-pmodal-features></ul>
        <button type="button" class="btn btn--lg pmodal__add" data-pmodal-add>
          <span class="btn__label">Add to cart</span>
        </button>
      </div>
    </div>`
  document.body.appendChild(el)
  return el
}

export function initShop(mount: HTMLElement): void {
  mount.innerHTML = `
    <div class="shop__toolbar">
      <button type="button" class="shop__toggle" data-toggle aria-pressed="false">View all</button>
    </div>
    <div class="pcar" data-carousel>
      <button type="button" class="pcar__nav pcar__prev" data-prev aria-label="Previous product">←</button>
      <div class="pcar__stage" data-stage>
        ${PRODUCTS.map((p, i) => cardHTML(p, i)).join('')}
      </div>
      <button type="button" class="pcar__nav pcar__next" data-next aria-label="Next product">→</button>
      <div class="pcar__dots" data-dots role="tablist" aria-label="Products"></div>
    </div>
    <div class="shop__grid" data-grid hidden>
      ${PRODUCTS.map((p, i) => cardHTML(p, i)).join('')}
    </div>`

  const stage = mount.querySelector<HTMLElement>('[data-stage]')!
  const cards = Array.from(stage.querySelectorAll<HTMLElement>('.product'))
  const dotsEl = mount.querySelector<HTMLElement>('[data-dots]')!
  const prevBtn = mount.querySelector<HTMLButtonElement>('[data-prev]')!
  const nextBtn = mount.querySelector<HTMLButtonElement>('[data-next]')!
  const carousel = mount.querySelector<HTMLElement>('[data-carousel]')!
  const grid = mount.querySelector<HTMLElement>('[data-grid]')!
  const toggle = mount.querySelector<HTMLButtonElement>('[data-toggle]')!

  dotsEl.innerHTML = PRODUCTS.map(
    (_, i) => `<button type="button" class="pcar__dot" data-i="${i}" role="tab" aria-label="Product ${i + 1}"></button>`,
  ).join('')
  const dots = Array.from(dotsEl.querySelectorAll<HTMLButtonElement>('.pcar__dot'))

  let active = 0

  const layout = (): void => {
    cards.forEach((card, i) => {
      const off = i - active
      const a = Math.min(Math.abs(off), 3)
      card.style.transform = `translateX(calc(-50% + ${off * 58}%)) scale(${(1 - a * 0.14).toFixed(3)})`
      card.style.opacity = String(Math.max(0, 1 - a * 0.34))
      card.style.zIndex = String(50 - a)
      card.style.pointerEvents = a > 2 ? 'none' : 'auto'
      card.setAttribute('aria-hidden', off === 0 ? 'false' : 'true')
      card.classList.toggle('is-active', off === 0)
    })
    dots.forEach((d, di) => {
      d.classList.toggle('is-on', di === active)
      d.setAttribute('aria-selected', di === active ? 'true' : 'false')
    })
    prevBtn.disabled = active === 0
    nextBtn.disabled = active === cards.length - 1
  }

  const setActive = (n: number): void => {
    active = Math.max(0, Math.min(cards.length - 1, n))
    layout()
  }

  prevBtn.addEventListener('click', () => setActive(active - 1))
  nextBtn.addEventListener('click', () => setActive(active + 1))
  dots.forEach((d) => d.addEventListener('click', () => setActive(Number(d.dataset.i))))
  carousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') setActive(active - 1)
    if (e.key === 'ArrowRight') setActive(active + 1)
  })
  layout()

  /* ------------------------------------------------------- detail modal */

  const modal = buildModal()
  let lastFocus: HTMLElement | null = null

  const openModal = (id: string): void => {
    const p = PRODUCTS.find((x) => x.id === id)
    if (!p) return
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const q = <T extends Element>(sel: string): T => modal.querySelector<T>(sel)!
    const cover = q<HTMLElement>('[data-pmodal-cover]')
    cover.style.setProperty('--poster-hue', String(p.hue))
    cover.innerHTML = coverInner(p)
    q<HTMLElement>('[data-pmodal-cat]').textContent = p.category
    q<HTMLElement>('[data-pmodal-title]').textContent = p.title
    q<HTMLElement>('[data-pmodal-price]').textContent = money(p.price)
    q<HTMLElement>('[data-pmodal-blurb]').textContent = p.blurb
    q<HTMLElement>('[data-pmodal-features]').innerHTML = p.features.map((f) => `<li>${f}</li>`).join('')
    q<HTMLButtonElement>('[data-pmodal-add]').onclick = (): void => addToCart(p.id)

    modal.classList.add('is-open')
    lockScroll()
    q<HTMLElement>('.pmodal__close').focus({ preventScroll: true })
  }

  const closeModal = (): void => {
    if (!modal.classList.contains('is-open')) return
    modal.classList.remove('is-open')
    unlockScroll()
    lastFocus?.focus({ preventScroll: true })
  }

  // cover click: in the carousel a side card comes to centre first; the active
  // card (and any catalog card) opens the modal
  mount.querySelectorAll<HTMLButtonElement>('[data-product]').forEach((b) => {
    b.addEventListener('click', () => {
      const card = b.closest<HTMLElement>('.product')
      const inStage = card?.parentElement === stage
      const i = card ? Number(card.dataset.i) : -1
      // a non-centred carousel card just slides to the middle first
      if (inStage && i !== active) {
        setActive(i)
        return
      }
      if (b.dataset.product) openModal(b.dataset.product)
    })
  })
  mount.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.add) addToCart(b.dataset.add)
    })
  })
  modal.querySelectorAll('[data-pmodal-close]').forEach((el) => el.addEventListener('click', closeModal))
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('is-open')) return
    if (e.key === 'Escape') closeModal()
    else trapFocus(modal.querySelector<HTMLElement>('.pmodal__panel')!, e)
  })

  /* ------------------------------------------------------ catalog toggle */

  let all = false
  toggle.addEventListener('click', () => {
    all = !all
    carousel.hidden = all
    grid.hidden = !all
    toggle.textContent = all ? 'Carousel' : 'View all'
    toggle.setAttribute('aria-pressed', String(all))
  })
}
