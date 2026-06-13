// RNDYVISUALS — bootstrap: fonts, styles, gsap/lenis wiring, matchMedia
// contexts (§6/§13), preloader, work index, overlay lazy-load.

import '@fontsource-variable/archivo/standard.css'
import '@fontsource-variable/space-grotesk'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import rawManifest from './data/videos.json'
import type { Manifest } from './types'
import { runPreloader } from './modules/preloader'
import { initCursor } from './modules/cursor'
import { initMagnetics } from './modules/magnetic'
import { prepareHero, playHeroIntro, initReveals } from './modules/reveals'
import { renderWorkIndex } from './modules/workIndex'
import { initHoverPreview } from './modules/hoverPreview'
import { createPoster } from './modules/posters'
import { onAfterResplit, resplitAll } from './lib/split'
import type { OverlayApi } from './modules/overlayPlayer'

gsap.registerPlugin(ScrollTrigger)
// §13 — width-only resize policy: ignore mobile URL-bar height changes
ScrollTrigger.config({ ignoreMobileResize: true })
gsap.ticker.lagSmoothing(500, 33)

const videos = (rawManifest as Manifest).videos
const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)')
const fineMq = window.matchMedia('(hover: hover) and (pointer: fine)')
const reducedAtInit = reducedMq.matches

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

/* -------------------------------------------------------- static mounts */

// work index rows from the manifest (§4.4)
const workSection = document.getElementById('work') as HTMLElement
const workList = workSection.querySelector<HTMLElement>('.work__list')!
const rows = renderWorkIndex(workList, videos)

// §4.4 — keep the heading count in sync with the manifest (admin edits);
// the hardcoded '(08)' in index.html stays as the no-JS fallback
const workTitle = document.getElementById('work-title')
if (workTitle) workTitle.textContent = `WORK INDEX (${String(videos.length).padStart(2, '0')})`

// showreel — first featured entry feeds the frame (§4.3/§10)
const featuredIndex = Math.max(
  0,
  videos.findIndex((v) => v.featured),
)
const reelFrame = document.querySelector<HTMLElement>('.reel__frame')
const reelInner = document.querySelector<HTMLElement>('.reel__inner')
const featured = videos[featuredIndex]
if (reelFrame && reelInner && featured) {
  reelFrame.dataset.workIndex = String(featuredIndex)
  reelInner.appendChild(createPoster(featured, featuredIndex, { chrome: false }))
}

/* --------------------------------------------------- hero initial state */

prepareHero(reducedAtInit)

/* ----------------------------------------------- matchMedia contexts §13 */

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

    // Lenis — desktop + motion ok only (§6/§13), driven by gsap.ticker
    if (c.desktop && c.motionOk) {
      lenis = new Lenis({
        duration: 1.1,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        wheelMultiplier: 1.0,
        touchMultiplier: 1.5,
        syncTouch: false,
        autoRaf: false,
      })
      if (lockCount > 0) lenis.stop() // preloader/overlay already holding the lock
      lenis.on('scroll', ScrollTrigger.update)
      const raf = (time: number): void => {
        lenis?.raf(time * 1000)
      }
      gsap.ticker.add(raf)
      cleanups.push(() => {
        gsap.ticker.remove(raf)
        lenis?.destroy()
        lenis = null
      })
    }

    // cursor + magnetic + hover previews — fine pointers, motion ok (§7/§13)
    if (c.fine && c.motionOk) {
      cleanups.push(initCursor())
      cleanups.push(initMagnetics())
      if (c.desktop) cleanups.push(initHoverPreview(rows, workSection))
    }

    // scroll reveals — gsap tweens/triggers auto-revert with the context;
    // mmCtx lets async re-split rebuilds register in the same context
    initReveals({ reduced: !c.motionOk, mobile: !c.desktop, ctx: mmCtx })

    return () => cleanups.forEach((off) => off())
  },
)

/* ----------------------------------------------------- header condense */

const header = document.querySelector<HTMLElement>('.header')
const onScroll = (): void => {
  header?.classList.toggle('is-condensed', window.scrollY > 40)
}
window.addEventListener('scroll', onScroll, { passive: true })
onScroll()

/* ----------------------------------------------------- anchor scrolling */

document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href') ?? ''
    if (href.length < 2 || href.startsWith('#work/')) return
    const target = document.querySelector<HTMLElement>(href)
    if (!target) return
    if (lenis) {
      e.preventDefault()
      // -64 mirrors the CSS scroll-margin-top under the fixed header
      lenis.scrollTo(target, { offset: href === '#top' ? 0 : -64 })
      // preventDefault suppresses the native focus/hash handoff — restore it
      // so the skip link actually moves keyboard focus (a11y)
      target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
      history.replaceState(null, '', href)
    }
    // otherwise native anchor + CSS smooth-scroll fallback (mobile)
  })
})

/* --------------------------------------------------- overlay lazy-load */

let overlayApi: OverlayApi | null = null
let overlayLoading: Promise<OverlayApi> | null = null

async function openOverlay(index: number, push = true): Promise<void> {
  if (!overlayApi) {
    overlayLoading ??= import('./modules/overlayPlayer').then((mod) =>
      mod.createOverlay(videos, {
        // live getters — §13: reduced motion re-checked on change, not frozen
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
      overlayLoading = null // failed chunk fetch — let the next click retry
      return
    }
  }
  overlayApi.open(index, push)
}

document.addEventListener('click', (e) => {
  const trigger =
    e.target instanceof Element ? e.target.closest<HTMLElement>('[data-work-index]') : null
  if (!trigger) return
  const index = Number(trigger.dataset.workIndex)
  if (Number.isFinite(index)) void openOverlay(index)
})

// deep link '#work/<id>' — open after init (§4.4)
const hashMatch = location.hash.match(/^#work\/(.+)$/)
if (hashMatch) {
  const deepIndex = videos.findIndex((v) => v.id === hashMatch[1])
  if (deepIndex >= 0) void openOverlay(deepIndex, false)
}

/* ------------------------------------------------------------ preloader */

runPreloader({
  reduced: reducedAtInit,
  lock: scrollCtl.stop,
  unlock: scrollCtl.start,
  onReveal: () => playHeroIntro(reducedAtInit),
  onDone: () => ScrollTrigger.refresh(),
})

/* ------------------------------------------------------------- refresh */

onAfterResplit(() => ScrollTrigger.refresh())
// line metrics change once the variable fonts land — re-split, then refresh
void document.fonts.ready.then(() => resplitAll())

/* ------------------------------------------------------ tab visibility */

document.addEventListener('visibilitychange', () => {
  document.documentElement.classList.toggle('is-tab-hidden', document.hidden)
  const heroVideo = document.querySelector<HTMLVideoElement>('.hero__video')
  if (heroVideo) {
    if (document.hidden) heroVideo.pause()
    else void heroVideo.play().catch(() => {})
  }
})

/* -------------------------------------------------------------- QA hook */

// Headless QA only (?qa in the URL): expose internals so end states can be
// driven in environments without rAF. Never used by the site itself.
if (new URLSearchParams(location.search).has('qa')) {
  ;(window as unknown as { __qa: object }).__qa = {
    gsap,
    ScrollTrigger,
    scrollTo: (y: number): void => {
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true })
      else window.scrollTo(0, y)
    },
  }
}
