// Cart — localStorage state + header badge + slide-in drawer + "added" toast.
// Static site: no checkout, the drawer's checkout button is disabled.

import { products } from '../data/products'
import type { Product } from '../data/products'
import { esc } from './esc'
import { lockScroll, unlockScroll, trapFocus } from './ui'

const KEY = 'rndy.cart'
type State = Record<string, number>

let state: State = load()
const listeners = new Set<() => void>()
let drawer: HTMLElement | null = null
let toastEl: HTMLElement | null = null
let toastTimer = 0
let lastFocus: HTMLElement | null = null

function load(): State {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    return v && typeof v === 'object' ? (v as State) : {}
  } catch {
    return {}
  }
}
function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* private mode — cart is session-only, fine */
  }
  listeners.forEach((f) => f())
}
function product(id: string): Product | undefined {
  return products().find((p) => p.id === id)
}
const money = (n: number): string => `€${n}`

export function count(): number {
  // only count ids that still resolve to a product (guards stale localStorage)
  return items().reduce((s, i) => s + i.qty, 0)
}
export function items(): Array<{ product: Product; qty: number }> {
  return Object.entries(state)
    .map(([id, qty]) => {
      const p = product(id)
      return p ? { product: p, qty } : null
    })
    .filter((x): x is { product: Product; qty: number } => x !== null)
}
export function subtotal(): number {
  return items().reduce((s, i) => s + i.product.price * i.qty, 0)
}
export function onChange(fn: () => void): void {
  listeners.add(fn)
}

export function add(id: string): void {
  const p = product(id)
  if (!p) return
  state[id] = (state[id] ?? 0) + 1
  persist()
  toast(`Added — ${p.title}`)
  renderDrawer()
}
function setQty(id: string, qty: number): void {
  if (qty <= 0) delete state[id]
  else state[id] = qty
  persist()
  renderDrawer()
}

/* --------------------------------------------------------------- UI */

function toast(msg: string): void {
  if (!toastEl) return
  toastEl.textContent = msg
  toastEl.classList.add('is-in')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastEl?.classList.remove('is-in'), 2200)
}

function openDrawer(): void {
  if (!drawer || drawer.classList.contains('is-open')) return
  lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  drawer.classList.add('is-open')
  lockScroll()
  renderDrawer()
  drawer.querySelector<HTMLElement>('.cart__close')?.focus({ preventScroll: true })
}
function closeDrawer(): void {
  if (!drawer || !drawer.classList.contains('is-open')) return
  drawer.classList.remove('is-open')
  unlockScroll()
  lastFocus?.focus({ preventScroll: true })
}

function renderDrawer(): void {
  if (!drawer) return
  const body = drawer.querySelector<HTMLElement>('.cart__body')
  const foot = drawer.querySelector<HTMLElement>('.cart__foot')
  if (!body || !foot) return
  const list = items()

  if (!list.length) {
    body.innerHTML = '<p class="cart__empty">Your cart is empty.</p>'
    foot.innerHTML = ''
    return
  }

  body.innerHTML = list
    .map(
      ({ product: p, qty }) => `
      <div class="cart__item">
        <span class="cart__cover" style="--poster-hue:${p.hue}" aria-hidden="true"></span>
        <div class="cart__meta">
          <span class="cart__title">${esc(p.title)}</span>
          <span class="cart__cat micro">${esc(p.category)}</span>
          <div class="cart__qty">
            <button type="button" aria-label="Decrease quantity" data-dec="${p.id}">−</button>
            <span aria-label="Quantity">${qty}</span>
            <button type="button" aria-label="Increase quantity" data-inc="${p.id}">+</button>
          </div>
        </div>
        <span class="cart__price">${money(p.price * qty)}</span>
      </div>`,
    )
    .join('')

  foot.innerHTML = `
    <div class="cart__sub"><span>Subtotal</span><span>${money(subtotal())}</span></div>
    <button type="button" class="cart__checkout" disabled>Checkout — coming soon</button>`

  body.querySelectorAll<HTMLButtonElement>('[data-inc]').forEach((b) => {
    b.onclick = (): void => setQty(b.dataset.inc ?? '', (state[b.dataset.inc ?? ''] ?? 0) + 1)
  })
  body.querySelectorAll<HTMLButtonElement>('[data-dec]').forEach((b) => {
    b.onclick = (): void => setQty(b.dataset.dec ?? '', (state[b.dataset.dec ?? ''] ?? 0) - 1)
  })
}

export function initCart(): void {
  const btn = document.querySelector<HTMLElement>('[data-cart-toggle]')
  const badge = document.querySelector<HTMLElement>('[data-cart-count]')
  const paint = (): void => {
    const c = count()
    if (badge) {
      badge.textContent = String(c)
      badge.hidden = c === 0
    }
    btn?.classList.toggle('has-items', c > 0)
    btn?.setAttribute('aria-label', c > 0 ? `Open cart, ${c} item${c === 1 ? '' : 's'}` : 'Open cart')
  }
  onChange(paint)
  paint()
  btn?.addEventListener('click', openDrawer)

  drawer = document.createElement('div')
  drawer.className = 'cart'
  drawer.innerHTML = `
    <div class="cart__scrim" data-cart-close></div>
    <aside class="cart__panel" role="dialog" aria-modal="true" aria-label="Shopping cart">
      <div class="cart__head">
        <h2 class="cart__h">Cart</h2>
        <button type="button" class="cart__close" aria-label="Close cart" data-cart-close>×</button>
      </div>
      <div class="cart__body"></div>
      <div class="cart__foot"></div>
    </aside>`
  document.body.appendChild(drawer)
  drawer.querySelectorAll('[data-cart-close]').forEach((el) => el.addEventListener('click', closeDrawer))
  document.addEventListener('keydown', (e) => {
    if (!drawer?.classList.contains('is-open')) return
    if (e.key === 'Escape') closeDrawer()
    else trapFocus(drawer.querySelector<HTMLElement>('.cart__panel')!, e)
  })
  renderDrawer()

  toastEl = document.createElement('div')
  toastEl.className = 'cart-toast'
  toastEl.setAttribute('role', 'status')
  toastEl.setAttribute('aria-live', 'polite')
  document.body.appendChild(toastEl)
}
