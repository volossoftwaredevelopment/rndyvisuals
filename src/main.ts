// Home entry — video hero + tight film grid, shared chrome, cinematic system
// (Lenis smooth scroll, custom cursor, scroll reveals, overlay player).

import '@fontsource-variable/archivo/standard.css'
import '@fontsource-variable/space-grotesk'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/shell.css'
import './styles/home.css'
import './styles/sections.css'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import rawManifest from './data/videos.json'
import type { Manifest } from './types'
import { HERO, SPONSORS, SPONSORS_ENABLED } from './data/content'
import { mountShell } from './lib/shell'
import { initMagnetics } from './modules/magnetic'
import { initReveals } from './modules/reveals'
import { renderVideoGrid } from './modules/videoGrid'
import type { OverlayApi } from './modules/overlayPlayer'

gsap.registerPlugin(ScrollTrigger)
ScrollTrigger.config({ ignoreMobileResize: true })
gsap.ticker.lagSmoothing(500, 33)

const videos = (rawManifest as Manifest).videos
const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)')
const fineMq = window.matchMedia('(hover: hover) and (pointer: fine)')
const reduced = reducedMq.matches

/* ------------------------------------------------------- scroll control */

let lenis: Lenis | null = null
let lockCount = 0

const scrollCtl = {
  stop(): void {
    lockCount += 1
    lenis?.stop()
    document.documentElement.classList.add('is-locked')
  },
  start(): void {
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) {
      lenis?.start()
      document.documentElement.classList.remove('is-locked')
    }
  },
}

/* ------------------------------------------------------------ shell + grid */

mountShell('home')

const gridMount = document.querySelector<HTMLElement>('[data-video-grid]')
if (gridMount) {
  renderVideoGrid(gridMount, videos, { reduced, onOpen: (i) => void openOverlay(i) })
}

// sponsor marquee (from the editable sponsors manifest). When the panel is off
// in the admin, or there are no sponsors, show a slim divider instead.
const sponsorsSection = document.querySelector<HTMLElement>('.sponsors')
const sponsorTrack = document.querySelector<HTMLElement>('[data-sponsors]')
if (sponsorsSection) {
  if (!SPONSORS_ENABLED || SPONSORS.length === 0) {
    sponsorsSection.classList.add('sponsors--off')
    sponsorsSection.innerHTML = '<span class="sponsors__divider" aria-hidden="true"></span>'
  } else if (sponsorTrack) {
    const logo = (s: { name: string; logo: string }, dup: boolean): string =>
      `<img class="sponsors__logo${dup ? ' is-dup' : ''}" src="./sponsors/${s.logo}" alt="${dup ? '' : s.name}"${dup ? ' aria-hidden="true"' : ''} loading="lazy" />`
    const setAlt = SPONSORS.map((s) => logo(s, false)).join('')
    const setDup = SPONSORS.map((s) => logo(s, true)).join('')
    // Each half = REPEAT sets so the track is wide enough that even a 27"+ screen
    // never shows a gap; both halves are identical for a seamless -50% loop.
    const REPEAT = 3
    const half = setAlt + setDup.repeat(REPEAT - 1)
    sponsorTrack.innerHTML = half + setDup.repeat(REPEAT)
  }
}

// hero brand + slogan from the editable site manifest
const heroBrandLine = document.querySelector<HTMLElement>('.hero__brand-line')
if (heroBrandLine) heroBrandLine.textContent = HERO.brand
const heroSloganEl = document.querySelector<HTMLElement>('.hero__slogan')
if (heroSloganEl) heroSloganEl.textContent = HERO.slogan

/* ----------------------------------------------- matchMedia contexts */

const mm = gsap.matchMedia()

mm.add(
  {
    desktop: '(min-width: 769px)',
    motionOk: '(prefers-reduced-motion: no-preference)',
    fine: '(hover: hover) and (pointer: fine)',
  },
  (mmCtx) => {
    const c = (mmCtx.conditions ?? {}) as { desktop?: boolean; motionOk?: boolean; fine?: boolean }
    const cleanups: Array<() => void> = []

    if (c.desktop && c.motionOk) {
      lenis = new Lenis({
        duration: 1.1,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        wheelMultiplier: 1.0,
        touchMultiplier: 1.5,
        syncTouch: false,
        autoRaf: false,
      })
      ;(window as unknown as { __lenis?: Lenis }).__lenis = lenis
      if (lockCount > 0) lenis.stop()
      lenis.on('scroll', ScrollTrigger.update)
      const raf = (time: number): void => {
        lenis?.raf(time * 1000)
      }
      gsap.ticker.add(raf)
      cleanups.push(() => {
        gsap.ticker.remove(raf)
        lenis?.destroy()
        lenis = null
        delete (window as unknown as { __lenis?: Lenis }).__lenis
      })
    }

    if (c.fine && c.motionOk) {
      cleanups.push(initMagnetics())
    }

    initReveals({ reduced: !c.motionOk, mobile: !c.desktop, ctx: mmCtx })

    return () => cleanups.forEach((off) => off())
  },
)

/* ----------------------------------------------------- anchor scrolling */

document.addEventListener('click', (e) => {
  const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href^="#"]') : null
  if (!a) return
  const href = a.getAttribute('href') ?? ''
  if (href.length < 2 || href.startsWith('#work/')) return
  const target = document.querySelector<HTMLElement>(href)
  if (!target || !lenis) return
  e.preventDefault()
  lenis.scrollTo(target, { offset: -10 })
})

/* --------------------------------------------------- overlay lazy-load */

let overlayApi: OverlayApi | null = null
let overlayLoading: Promise<OverlayApi> | null = null

async function openOverlay(index: number, push = true): Promise<void> {
  if (!overlayApi) {
    overlayLoading ??= import('./modules/overlayPlayer').then((mod) =>
      mod.createOverlay(videos, {
        get reduced() {
          return reducedMq.matches
        },
        get fine() {
          return fineMq.matches && !reducedMq.matches
        },
        lock: scrollCtl.stop,
        unlock: scrollCtl.start,
      }),
    )
    try {
      overlayApi = await overlayLoading
    } catch {
      overlayLoading = null
      return
    }
  }
  overlayApi.open(index, push)
}

// deep link '#work/<id>'
const hashMatch = location.hash.match(/^#work\/(.+)$/)
if (hashMatch) {
  const deepIndex = videos.findIndex((v) => v.id === hashMatch[1])
  if (deepIndex >= 0) void openOverlay(deepIndex, false)
}

/* -------------------------------------------------------- hero intro */

const heroVideo = document.querySelector<HTMLVideoElement>('.hero__video')
const heroLine = document.querySelector<HTMLElement>('.hero__brand-line')
const heroSlogan = document.querySelector<HTMLElement>('.hero__slogan')
const heroInner = document.querySelector<HTMLElement>('.hero__media-inner')
const heroFades = [heroSlogan].filter(Boolean) as HTMLElement[]

// Pre-hide the hero lockup synchronously at module eval — before first paint —
// so the wordmark / slogan / video never flash at their final state while
// document.fonts.ready is still pending. Uncached variable fonts settle well
// after first paint on a cold load, so applying these only inside the
// fonts.ready callback caused a visible FOUC. The .to() entrance still runs
// once fonts are ready; under reduced motion nothing is hidden.
if (!reduced) {
  gsap.set(heroLine, { yPercent: 110 })
  gsap.set(heroFades, { autoAlpha: 0, y: 16 })
  gsap.set(heroInner, { scale: 1.12 })
}

function playHero(): void {
  if (reduced) {
    gsap.set([heroLine, ...heroFades].filter(Boolean), { clearProps: 'all' })
    heroVideo?.pause()
    return
  }

  // Start the muted loop only for motion-ok visitors. The <video> autoplay
  // attribute was removed so reduced-motion users keep the still poster (no
  // unwanted motion, and the 16MB file is not force-downloaded to be watched).
  void heroVideo?.play().catch(() => {})

  const tl = gsap.timeline()
  if (heroInner) tl.to(heroInner, { scale: 1, duration: 1.6, ease: 'expo.out' }, 0)
  if (heroLine) tl.to(heroLine, { yPercent: 0, duration: 1.0, ease: 'expo.out' }, 0.2)
  tl.to(heroFades, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.12 }, 0.5)

  // Safety net: the hero must never stay hidden. If the rAF ticker was throttled
  // (e.g. loaded in a background tab) the tween can freeze at its start state —
  // force the timeline to its end after a beat (setTimeout fires even when
  // rAF is paused; progress(1) applies the final state without the ticker).
  window.setTimeout(() => {
    if (tl.progress() < 1) tl.progress(1)
  }, 2600)
}

void document.fonts.ready.then(() => {
  playHero()
  ScrollTrigger.refresh()
})

/* ------------------------------------------------------ tab visibility */

document.addEventListener('visibilitychange', () => {
  if (!heroVideo) return
  if (document.hidden) heroVideo.pause()
  else if (!reduced) void heroVideo.play().catch(() => {})
})
