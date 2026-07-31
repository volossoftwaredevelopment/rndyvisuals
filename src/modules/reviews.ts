// Client reviews — a single large rotating testimonial with star rating,
// dot navigation and gentle auto-advance (paused on hover/focus).

import { REVIEWS } from '../data/reviews'

function starsMarkup(n: number): string {
  return Array.from({ length: 5 }, (_, i) => `<span class="star${i < n ? ' is-on' : ''}">★</span>`).join('')
}

export function initReviews(mount: HTMLElement): void {
  if (!REVIEWS.length) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  mount.innerHTML = `
    <span class="reviews__mark" aria-hidden="true">&ldquo;</span>
    <div class="reviews__card" data-card aria-live="polite" aria-atomic="true">
      <div class="reviews__stars" data-stars aria-hidden="true"></div>
      <blockquote class="reviews__quote" data-quote></blockquote>
      <div class="reviews__by">
        <span class="reviews__name" data-name></span>
        <span class="reviews__role micro" data-role></span>
      </div>
    </div>
    <div class="reviews__dots" data-dots role="group" aria-label="Choose a testimonial"></div>
  `

  const card = mount.querySelector<HTMLElement>('[data-card]')!
  const starsEl = mount.querySelector<HTMLElement>('[data-stars]')!
  const quoteEl = mount.querySelector<HTMLElement>('[data-quote]')!
  const nameEl = mount.querySelector<HTMLElement>('[data-name]')!
  const roleEl = mount.querySelector<HTMLElement>('[data-role]')!
  const dotsEl = mount.querySelector<HTMLElement>('[data-dots]')!

  dotsEl.innerHTML = REVIEWS.map(
    (_, i) => `<button type="button" class="reviews__dot" data-i="${i}" aria-label="Testimonial ${i + 1}"></button>`,
  ).join('')
  const dots = Array.from(dotsEl.querySelectorAll<HTMLButtonElement>('.reviews__dot'))

  let index = 0
  let timer = 0

  const paint = (): void => {
    const r = REVIEWS[index]
    if (!r) return
    starsEl.innerHTML = starsMarkup(r.rating)
    quoteEl.textContent = r.quote
    nameEl.textContent = r.name
    roleEl.textContent = r.role
    dots.forEach((d, di) => {
      d.classList.toggle('is-on', di === index)
      if (di === index) d.setAttribute('aria-current', 'true')
      else d.removeAttribute('aria-current')
    })
  }

  const go = (n: number): void => {
    const next = (n + REVIEWS.length) % REVIEWS.length
    if (next === index) return
    if (reduced) {
      index = next
      paint()
      return
    }
    card.classList.add('is-out')
    window.setTimeout(() => {
      index = next
      paint()
      card.classList.remove('is-out')
    }, 260)
  }

  const stop = (): void => window.clearInterval(timer)
  const start = (): void => {
    if (reduced) return
    stop()
    timer = window.setInterval(() => go(index + 1), 6000)
  }

  dots.forEach((d) =>
    d.addEventListener('click', () => {
      go(Number(d.dataset.i))
      start()
    }),
  )
  mount.addEventListener('pointerenter', stop)
  mount.addEventListener('pointerleave', start)
  mount.addEventListener('focusin', stop)
  mount.addEventListener('focusout', start)

  paint()
  start()
}
