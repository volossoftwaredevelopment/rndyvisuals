// Shared chrome for every page — header (centered nav + hover swap), footer
// (with Privacy Policy), cookie consent banner, skip link and film grain.
// One source of truth so all pages stay identical.

import { SITE } from '../site.config'
import { CONTACTS, PRODUCTS_ENABLED, REVIEWS_ENABLED, contentReady } from '../data/content'
import { iconLabel } from './icons'
import { initCart } from './cart'
import { lockScroll, unlockScroll, trapFocus } from './ui'

export type PageId = 'home' | 'products' | 'kind-words' | 'about' | 'contact' | 'privacy'

const COOKIE_KEY = 'rndy.cookie.ok'

interface NavItem {
  id: PageId
  label: string
  href: string
}

const NAV: NavItem[] = [
  { id: 'home', label: 'Home', href: './' },
  { id: 'products', label: 'Products', href: './products.html' },
  { id: 'kind-words', label: 'Kind Words', href: './kind-words.html' },
  { id: 'about', label: 'About', href: './about.html' },
  { id: 'contact', label: 'Contact', href: './contact.html' },
]

/** Nav minus any section switched off in the admin. */
function visibleNav(): NavItem[] {
  return NAV.filter(
    (n) => (n.id !== 'products' || PRODUCTS_ENABLED()) && (n.id !== 'kind-words' || REVIEWS_ENABLED()),
  )
}

// two stacked copies of the label — the header hover swap slides them up
function navLink(item: NavItem, active: boolean): string {
  return `
    <a class="nav-link${active ? ' is-active' : ''}" href="${item.href}"${active ? ' aria-current="page"' : ''}>
      <span class="nav-link__swap">
        <span class="nav-link__label">${item.label}</span>
        <span class="nav-link__label" aria-hidden="true">${item.label}</span>
      </span>
    </a>`
}

function buildHeader(page: PageId): HTMLElement {
  const header = document.createElement('header')
  header.className = 'site-header'
  header.setAttribute('data-header', '')
  // cart lives only on the Products page (per request)
  const cart =
    page === 'products'
      ? `<button class="cart-btn" type="button" data-cart-toggle aria-label="Open cart">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
      <span class="cart-btn__count" data-cart-count hidden>0</span>
    </button>`
      : '<span aria-hidden="true"></span>'
  header.innerHTML = `
    <a class="site-header__brand" href="./" aria-label="${SITE.brand} — home">RNDY<sup>®</sup></a>
    <nav class="site-nav" aria-label="Primary">
      ${visibleNav().map((n) => navLink(n, n.id === page)).join('')}
    </nav>
    <div class="site-header__right">
      ${cart}
      <button class="nav-toggle" type="button" data-nav-toggle aria-label="Open menu" aria-expanded="false">
        <span></span><span></span>
      </button>
    </div>
  `
  return header
}

function footerHTML(): string {
  const ext = 'target="_blank" rel="noopener noreferrer"'
  const nt = '<span class="sr-only"> (opens in a new tab)</span>'
  return `
    <span class="rule-line" data-reveal="rule" aria-hidden="true"></span>
    <div class="site-footer__grid">
      <div class="site-footer__col site-footer__brandcol">
        <span class="site-footer__brand">RNDY VISUALS<sup>®</sup></span>
        <p class="site-footer__tag micro">Videography — available worldwide</p>
      </div>

      <nav class="site-footer__col" aria-label="Social">
        <h2 class="site-footer__h micro">Social</h2>
        <a href="${CONTACTS().instagram}" ${ext}>${iconLabel('instagram', 'Instagram')}${nt}</a>
        <a href="${CONTACTS().youtube}" ${ext}>${iconLabel('youtube', 'YouTube')}${nt}</a>
        <a href="${CONTACTS().linkedin}" ${ext}>${iconLabel('linkedin', 'LinkedIn')}${nt}</a>
        <a href="${CONTACTS().x}" ${ext}>${iconLabel('x', 'X')}${nt}</a>
      </nav>

      <nav class="site-footer__col" aria-label="Contact">
        <h2 class="site-footer__h micro">Contact</h2>
        <a href="${CONTACTS().whatsapp}" ${ext}>${iconLabel('whatsapp', 'WhatsApp')}${nt}</a>
        <a href="${CONTACTS().telegram}" ${ext}>${iconLabel('telegram', 'Telegram')}${nt}</a>
        <a href="mailto:${CONTACTS().email}">${iconLabel('email', 'Email')}</a>
      </nav>

      <div class="site-footer__col">
        <h2 class="site-footer__h micro">Info</h2>
        <span class="site-footer__copy">© 2026 RNDY VISUALS</span>
        <a href="./privacy.html">Privacy Policy</a>
        <a class="site-footer__credit" href="${SITE.creditUrl}" ${ext}>Made with ${SITE.credit}${nt}</a>
        <button type="button" class="site-footer__top" data-to-top>Back to top</button>
      </div>
    </div>
  `
}

function buildFooter(): HTMLElement {
  const footer = document.createElement('footer')
  footer.className = 'site-footer'
  footer.innerHTML = footerHTML()
  return footer
}

/** Re-render the footer after live content arrives (contact links may differ). */
export function refreshFooter(footer: HTMLElement): void {
  footer.innerHTML = footerHTML()
  wireBackToTop(footer)
}

function buildCookie(): HTMLElement {
  const el = document.createElement('aside')
  el.className = 'cookie'
  el.setAttribute('aria-label', 'Cookie notice')
  el.hidden = true
  el.innerHTML = `
    <p class="cookie__text" id="cookie-desc">We use cookies to improve your experience and analyze traffic. By accepting, you consent to the use of cookies in accordance with our <a href="./privacy.html">Privacy Policy</a>.</p>
    <button type="button" class="cookie__accept" data-cookie-accept aria-describedby="cookie-desc">Accept</button>
  `
  return el
}

function wireCookie(el: HTMLElement): void {
  let accepted = false
  try {
    accepted = localStorage.getItem(COOKIE_KEY) === '1'
  } catch {
    /* private mode — treat as not-yet-accepted, banner is harmless */
  }
  if (accepted) return

  const accept = el.querySelector<HTMLButtonElement>('[data-cookie-accept]')

  el.hidden = false
  // reveal on next frame so the CSS transition runs, then move focus onto the
  // Accept control so AT users are told a consent action has appeared (req. 4).
  // Non-modal — focus is not trapped; preventScroll avoids a viewport jump.
  requestAnimationFrame(() => {
    el.classList.add('is-in')
    accept?.focus({ preventScroll: true })
  })

  accept?.addEventListener('click', () => {
    try {
      localStorage.setItem(COOKIE_KEY, '1')
    } catch {
      /* ignore */
    }
    el.classList.remove('is-in')
    el.addEventListener('transitionend', () => (el.hidden = true), { once: true })
    // fallback if transitionend never fires (reduced motion / display none)
    window.setTimeout(() => (el.hidden = true), 500)
  })
}

function wireHeader(header: HTMLElement): void {
  const onScroll = (): void => {
    header.classList.toggle('is-condensed', window.scrollY > 40)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
}

function wireBackToTop(footer: HTMLElement): void {
  footer.querySelector<HTMLButtonElement>('[data-to-top]')?.addEventListener('click', () => {
    const lenis = (window as unknown as { __lenis?: { scrollTo: (t: number) => void } }).__lenis
    if (lenis) lenis.scrollTo(0)
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function buildNavMenu(page: PageId): HTMLElement {
  const menu = document.createElement('div')
  menu.className = 'nav-menu'
  menu.innerHTML = `
    <nav class="nav-menu__list" aria-label="Menu">
      ${visibleNav().map(
        (n) =>
          `<a class="nav-menu__link${n.id === page ? ' is-active' : ''}" href="${n.href}"${n.id === page ? ' aria-current="page"' : ''}>${n.label}</a>`,
      ).join('')}
    </nav>`
  return menu
}

export interface ShellParts {
  header: HTMLElement
  footer: HTMLElement
}

/**
 * Insert the shared chrome. Home injects the footer itself (it lives inside the
 * scroll flow after the grid); other pages let the shell append it. Pass
 * `footer: false` to skip footer insertion.
 */
export function mountShell(page: PageId, opts: { footer?: boolean } = {}): ShellParts {
  const withFooter = opts.footer !== false

  // skip link (first focusable)
  const skip = document.createElement('a')
  skip.className = 'skip-link'
  skip.href = '#content'
  skip.textContent = 'Skip to content'
  document.body.prepend(skip)
  // make the skip target focusable so activating the link moves focus into the
  // main region in all browsers (base.css suppresses the ring on [tabindex='-1'])
  document.getElementById('content')?.setAttribute('tabindex', '-1')

  const header = buildHeader(page)
  skip.after(header)
  wireHeader(header)

  // mobile menu (hamburger) — the 5-item nav can't fit narrow screens inline
  const menu = buildNavMenu(page)
  document.body.appendChild(menu)
  const toggle = header.querySelector<HTMLButtonElement>('[data-nav-toggle]')
  // keep Tab inside the open full-screen menu so focus can't reach the page
  // controls sitting behind the opaque overlay
  const onMenuKeydown = (e: KeyboardEvent): void => {
    if (menu.classList.contains('is-open')) trapFocus(menu, e)
  }
  const setMenu = (open: boolean): void => {
    if (open === menu.classList.contains('is-open')) return
    menu.classList.toggle('is-open', open)
    toggle?.classList.toggle('is-active', open)
    toggle?.setAttribute('aria-expanded', String(open))
    if (open) {
      lockScroll()
      document.addEventListener('keydown', onMenuKeydown)
      menu.querySelector<HTMLElement>('a')?.focus()
    } else {
      unlockScroll()
      document.removeEventListener('keydown', onMenuKeydown)
      toggle?.focus()
    }
  }
  toggle?.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')))
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false)
  })
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) setMenu(false)
  })

  const footer = buildFooter()
  if (withFooter) {
    document.body.appendChild(footer)
  }
  wireBackToTop(footer)

  const cookie = buildCookie()
  document.body.appendChild(cookie)
  wireCookie(cookie)

  const grain = document.createElement('div')
  grain.className = 'grain'
  grain.setAttribute('aria-hidden', 'true')
  document.body.appendChild(grain)

  if (page === 'products') initCart()

  // Contact links come from the database; refresh them once live content lands.
  // The home page drives its own loadContent() — this is a no-op second call
  // there because the result is shared module state.
  const beforeContacts = JSON.stringify(CONTACTS())
  const beforeNav = visibleNav().map((n) => n.id).join(',')
  void contentReady().then(() => {
    if (JSON.stringify(CONTACTS()) !== beforeContacts) refreshFooter(footer)
    // a section switched off in the admin disappears from both navs
    if (visibleNav().map((n) => n.id).join(',') !== beforeNav) {
      const nav = header.querySelector('.site-nav')
      if (nav) nav.innerHTML = visibleNav().map((n) => navLink(n, n.id === page)).join('')
      const list = menu.querySelector('.nav-menu__list')
      if (list) {
        list.innerHTML = visibleNav()
          .map(
            (n) =>
              `<a class="nav-menu__link${n.id === page ? ' is-active' : ''}" href="${n.href}"${n.id === page ? ' aria-current="page"' : ''}>${n.label}</a>`,
          )
          .join('')
        list.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)))
      }
    }
  })

  return { header, footer }
}
