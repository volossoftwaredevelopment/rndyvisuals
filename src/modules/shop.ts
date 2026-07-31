// Our Products — product grid + detail modal (description + pricing + add).
// Cover art is a generated gradient (--poster-hue), no image files.

import { PRODUCTS } from '../data/products'
import type { Product } from '../data/products'
import { add as addToCart } from '../lib/cart'

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

function card(p: Product): string {
  return `
  <article class="product" data-reveal="fade-up">
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

/* ------------------------------------------------------- detail modal */

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

type Lenis = { stop: () => void; start: () => void }
const lenis = (): Lenis | undefined => (window as unknown as { __lenis?: Lenis }).__lenis

export function initShop(mount: HTMLElement): void {
  mount.innerHTML = PRODUCTS.map(card).join('')

  mount.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.add
      if (id) addToCart(id)
    })
  })

  const modal = buildModal()
  let lastFocus: HTMLElement | null = null

  const open = (id: string): void => {
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
    q<HTMLElement>('[data-pmodal-features]').innerHTML = p.features
      .map((f) => `<li>${f}</li>`)
      .join('')
    const addBtn = q<HTMLButtonElement>('[data-pmodal-add]')
    addBtn.onclick = (): void => addToCart(p.id)

    modal.classList.add('is-open')
    document.documentElement.classList.add('is-locked')
    lenis()?.stop()
    q<HTMLElement>('.pmodal__close').focus({ preventScroll: true })
  }

  const close = (): void => {
    modal.classList.remove('is-open')
    document.documentElement.classList.remove('is-locked')
    lenis()?.start()
    lastFocus?.focus({ preventScroll: true })
  }

  mount.querySelectorAll<HTMLButtonElement>('[data-product]').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.product) open(b.dataset.product)
    })
  })
  modal.querySelectorAll('[data-pmodal-close]').forEach((el) => el.addEventListener('click', close))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) close()
  })
}
