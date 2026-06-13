// Named scroll effects (§6 table) — data-attribute driven, created inside
// gsap.matchMedia() contexts so viewport/motion changes revert cleanly (§13).

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { splitLines, charSpans } from '../lib/split'

export interface RevealOpts {
  reduced: boolean
  mobile: boolean
  /** gsap.matchMedia context — async re-split rebuilds are recorded into it */
  ctx?: gsap.Context
}

/* ------------------------------------------------------------ hero intro */

let heroChars: HTMLElement[] = []
let heroPrepared = false

function heroFadeEls(): HTMLElement[] {
  return gsap.utils.toArray<HTMLElement>('[data-hero-fade]')
}

/** Set hidden states while the preloader still covers the page. */
export function prepareHero(reduced: boolean): void {
  if (heroPrepared) return
  heroPrepared = true
  const title = document.querySelector<HTMLElement>('.hero__title')
  const header = document.querySelector<HTMLElement>('.header')
  const fades = heroFadeEls()

  if (reduced) {
    gsap.set([title, header, ...fades].filter(Boolean), { opacity: 0 })
    return
  }

  if (title) {
    title.setAttribute('aria-label', (title.textContent ?? '').replace(/\s+/g, ' ').trim())
    const lines = title.querySelectorAll<HTMLElement>('.hero__title-line')
    lines.forEach((line) => {
      line.setAttribute('aria-hidden', 'true')
      heroChars.push(...charSpans(line))
    })
    gsap.set(heroChars, { yPercent: 100 })
  }
  gsap.set(fades, { y: 24, autoAlpha: 0 })
  if (header) gsap.set(header, { autoAlpha: 0 })
  const inner = document.querySelector<HTMLElement>('.hero__media-inner')
  if (inner) gsap.set(inner, { scale: 1.25 })
}

/** Fired by the preloader at curtain start (t=1.3 of the intro sequence). */
export function playHeroIntro(reduced: boolean): void {
  const title = document.querySelector<HTMLElement>('.hero__title')
  const header = document.querySelector<HTMLElement>('.header')
  const fades = heroFadeEls()

  if (reduced) {
    gsap.to([title, header, ...fades].filter(Boolean), { opacity: 1, duration: 0.4, ease: 'none' })
    return
  }

  const tl = gsap.timeline()
  const inner = document.querySelector<HTMLElement>('.hero__media-inner')
  // hero-media-settle — t=1.3 (curtain start)
  if (inner) tl.to(inner, { scale: 1, duration: 1.4, ease: 'expo.out' }, 0)
  // hero-title-rise — t=1.5
  if (heroChars.length) {
    tl.to(heroChars, { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.022 }, 0.2)
  }
  tl.to(fades, { y: 0, autoAlpha: 1, duration: 0.8, ease: 'expo.out', stagger: 0.08 }, 0.55)
  if (header) tl.to(header, { autoAlpha: 1, duration: 0.8, ease: 'expo.out' }, 0.7)
}

/* -------------------------------------------------------- scroll reveals */

export function initReveals({ reduced, mobile, ctx }: RevealOpts): void {
  const fadeUps = gsap.utils.toArray<HTMLElement>('[data-reveal="fade-up"]')
  const headlines = gsap.utils.toArray<HTMLElement>('[data-reveal="headline-lines"]')
  const clips = gsap.utils.toArray<HTMLElement>('[data-reveal="clip"]')
  const rules = gsap.utils.toArray<HTMLElement>('[data-reveal="rule"]')
  const rows = gsap.utils.toArray<HTMLElement>('.work-row')
  const parallaxInners = gsap.utils.toArray<HTMLElement>('[data-parallax-media]')
  const hero = document.querySelector<HTMLElement>('#top')
  const heroMedia = document.querySelector<HTMLElement>('.hero__media')
  const lockup = document.querySelector<HTMLElement>('.hero__lockup')

  if (reduced) {
    // §13 — every reveal becomes a 0.3s opacity fade, no transforms, no parallax
    const all = [...fadeUps, ...headlines, ...clips, ...rules, ...rows]
    all.forEach((el) => {
      gsap.set(el, { opacity: 0 })
      ScrollTrigger.create({
        trigger: el,
        start: 'top 92%',
        once: true,
        onEnter: () => gsap.to(el, { opacity: 1, duration: 0.3, ease: 'none' }),
      })
    })
    return
  }

  // §13 mobile factors: distance ×0.5, durations ×0.85, staggers ×0.7
  const FY = mobile ? 0.5 : 1
  const FD = mobile ? 0.85 : 1
  const FS = mobile ? 0.7 : 1
  const PARALLAX = mobile ? 6 : 12

  /* fade-up — y 40→0, batch 0.08, max 6, top 85% */
  if (fadeUps.length) {
    gsap.set(fadeUps, { y: 40 * FY, autoAlpha: 0 })
    ScrollTrigger.batch(fadeUps, {
      start: 'top 85%',
      once: true,
      batchMax: 6,
      onEnter: (batch) =>
        gsap.to(batch, {
          y: 0,
          autoAlpha: 1,
          duration: 0.8 * FD,
          ease: 'expo.out',
          stagger: 0.08 * FS,
          overwrite: true,
        }),
    })
  }

  /* headline-lines — masked lines rise + unrotate, top 88% */
  headlines.forEach((el) => {
    const split = splitLines(el)
    let played = false
    const build = (): ScrollTrigger => {
      gsap.set(split.lines, { yPercent: 110, rotate: 4, transformOrigin: '0 100%' })
      return ScrollTrigger.create({
        trigger: el,
        start: 'top 88%',
        once: true,
        onEnter: () => {
          played = true
          gsap.to(split.lines, {
            yPercent: 0,
            rotate: 0,
            duration: 1.0 * FD,
            ease: 'expo.out',
            stagger: 0.09 * FS,
          })
        },
      })
    }
    let st = build()
    split.onResplit = () => {
      if (played) return
      st.kill()
      // re-splits fire async (fonts.ready, debounced resize) — record the
      // rebuilt trigger in the matchMedia context so it reverts with it (§13)
      if (ctx) {
        ctx.add(() => {
          st = build()
        })
      } else {
        st = build()
      }
    }
  })

  /* clip-reveal — container clip + inner counter-scale, top 80% */
  clips.forEach((el) => {
    const inner = el.querySelector<HTMLElement>('[data-clip-inner]')
    gsap.set(el, { clipPath: 'inset(0% 0% 100% 0%)' })
    if (inner) gsap.set(inner, { scale: 1.25 })
    ScrollTrigger.create({
      trigger: el,
      start: 'top 80%',
      once: true,
      onEnter: () => {
        gsap.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1 * FD, ease: 'power4.out' })
        if (inner) gsap.to(inner, { scale: 1, duration: 1.1 * FD, ease: 'power4.out' })
      },
    })
  })

  /* rule-draw — scaleX 0→1 origin left, top 92% */
  if (rules.length) {
    gsap.set(rules, { scaleX: 0, transformOrigin: 'left center' })
    rules.forEach((el) =>
      ScrollTrigger.create({
        trigger: el,
        start: 'top 92%',
        once: true,
        onEnter: () => gsap.to(el, { scaleX: 1, duration: 1.2 * FD, ease: 'expo.out' }),
      }),
    )
  }

  /* work-row-reveal — fade-up y60 + per-row rule-draw + index-slide */
  if (rows.length) {
    rows.forEach((row) => {
      gsap.set(row, { y: 60 * FY, autoAlpha: 0 })
      const rule = row.querySelector<HTMLElement>('.work-row__rule')
      if (rule) gsap.set(rule, { scaleX: 0, transformOrigin: 'left center' })
      const slide = row.querySelector<HTMLElement>('.work-row__index-slide')
      if (slide) gsap.set(slide, { xPercent: -100 })
    })
    ScrollTrigger.batch(rows, {
      start: 'top 85%',
      once: true,
      batchMax: 6,
      onEnter: (batch) => {
        batch.forEach((target, i) => {
          const row = target as HTMLElement
          const tl = gsap.timeline({ delay: i * 0.1 * FS })
          tl.to(row, { y: 0, autoAlpha: 1, duration: 0.8 * FD, ease: 'expo.out' }, 0)
          const rule = row.querySelector<HTMLElement>('.work-row__rule')
          if (rule) tl.to(rule, { scaleX: 1, duration: 1.2 * FD, ease: 'expo.out' }, 0)
          const slide = row.querySelector<HTMLElement>('.work-row__index-slide')
          if (slide) tl.to(slide, { xPercent: 0, duration: 0.7 * FD, ease: 'power3.out' }, 0.05)
        })
      },
    })
  }

  /* parallax-media — inner ±12% (±6% mobile), scrubbed across the viewport */
  parallaxInners.forEach((inner) => {
    const frame = inner.closest<HTMLElement>('[data-parallax-frame]') ?? inner.parentElement
    if (!frame) return
    gsap.fromTo(
      inner,
      { yPercent: -PARALLAX },
      {
        yPercent: PARALLAX,
        ease: 'none',
        scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true },
      },
    )
  })

  /* hero exit — media parallax 0→12% scrubbed, lockup fades at 60% exit (§4.2) */
  if (hero && heroMedia) {
    gsap.to(heroMedia, {
      yPercent: PARALLAX,
      ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
    })
    if (lockup) {
      gsap.to(lockup, {
        autoAlpha: 0,
        ease: 'none',
        scrollTrigger: { trigger: hero, start: '60% top', end: 'bottom top', scrub: true },
      })
    }
  }
}
