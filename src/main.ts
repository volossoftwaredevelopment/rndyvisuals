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

import type { VideoEntry } from './types'
import { HERO, SPONSORS, SPONSORS_ENABLED, content, contentReady } from './data/content'
import { esc } from './lib/esc'
import { mountShell } from './lib/shell'
import { initMagnetics } from './modules/magnetic'
import { initReveals } from './modules/reveals'
import { renderVideoGrid } from './modules/videoGrid'
import type { OverlayApi } from './modules/overlayPlayer'

gsap.registerPlugin(ScrollTrigger)
ScrollTrigger.config({ ignoreMobileResize: true })
gsap.ticker.lagSmoothing(500, 33)

// Live list — starts as the bundled snapshot, refreshed from the API below.
let videos: VideoEntry[] = content().videos
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

function renderGrid(): void {
  if (!gridMount) return
  videos = content().videos
  gridMount.textContent = ''
  renderVideoGrid(gridMount, videos, { reduced, onOpen: (i) => void openOverlay(i) })
}

// Sponsor marquee. A logo is either an uploaded absolute URL or a filename that
// still lives in public/sponsors/. When the strip is switched off in the admin,
// or there are no sponsors, show a slim divider instead.
function renderSponsors(): void {
  const section = document.querySelector<HTMLElement>('.sponsors')
  if (!section) return
  const list = SPONSORS()
  if (!SPONSORS_ENABLED() || list.length === 0) {
    section.classList.add('sponsors--off')
    section.innerHTML = '<span class="sponsors__divider" aria-hidden="true"></span>'
    return
  }
  section.classList.remove('sponsors--off')
  if (!section.querySelector('[data-sponsors]')) {
    section.innerHTML = '<div class="sponsors__viewport"><div class="sponsors__track" data-sponsors></div></div>'
  }
  const track = section.querySelector<HTMLElement>('[data-sponsors]')
  if (!track) return
  const src = (logo: string): string => (/^https?:\/\//.test(logo) ? logo : `./sponsors/${logo}`)
  const img = (s: { name: string; logo: string }, dup: boolean): string =>
    `<img class="sponsors__logo${dup ? ' is-dup' : ''}" src="${esc(src(s.logo))}" alt="${dup ? '' : esc(s.name)}"${dup ? ' aria-hidden="true"' : ''} loading="lazy" />`
  const setAlt = list.map((s) => img(s, false)).join('')
  const setDup = list.map((s) => img(s, true)).join('')
  // Each half = REPEAT sets so the track is wide enough that even a 27"+ screen
  // never shows a gap; both halves are identical for a seamless -50% loop.
  const REPEAT = 3
  track.innerHTML = setAlt + setDup.repeat(REPEAT - 1) + setDup.repeat(REPEAT)
}

function renderHeroText(): void {
  const line = document.querySelector<HTMLElement>('.hero__brand-line')
  if (line) line.textContent = HERO().brand
  const slogan = document.querySelector<HTMLElement>('.hero__slogan')
  if (slogan) slogan.textContent = HERO().slogan
}

// The background film is editable too — swap it only when it actually differs,
// so re-applying live content never restarts playback.
function renderHeroVideo(): void {
  const el = document.querySelector<HTMLVideoElement>('.hero__video')
  if (!el) return
  const { video, poster } = HERO()

  // Removed in the admin → drop the film entirely, leaving the dark backdrop.
  if (!video) {
    el.pause()
    el.removeAttribute('src')
    el.removeAttribute('poster')
    el.load()
    el.hidden = true
    return
  }

  el.hidden = false
  if (poster && el.getAttribute('poster') !== poster) el.poster = poster
  if (el.getAttribute('src') !== video) {
    el.src = video
    el.load()
    if (!reduced) void el.play().catch(() => {})
  }
}

// Render only once live content has arrived. Painting the bundled snapshot first
// made deleted films visibly reappear after a deploy, because that snapshot is
// frozen at build time. The hero markup is static HTML so the page still paints
// instantly; only the grid/strip wait for the (edge-cached) fetch.
void contentReady().then(() => {
  renderGrid()
  renderSponsors()
  renderHeroText()
  renderHeroVideo()
  ScrollTrigger.refresh()
})

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
  // preventDefault cancels the native fragment focus move, so restore it — the
  // skip link (#content, tabindex=-1) must actually move focus into <main>.
  target.focus({ preventScroll: true })
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
