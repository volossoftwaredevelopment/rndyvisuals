// Overlay player (§4.4 / §6) — dynamically imported on first open.
// role=dialog, focus trap, Esc/scrim/back/× close, history '#work/<id>',
// prev/next, per-source embeds, Lenis stopped while open.

import gsap from 'gsap'
import type { VideoEntry } from '../types'
import { createPoster } from './posters'
import { magnetize } from './magnetic'
import { SITE } from '../site.config'

export interface OverlayCtx {
  reduced: boolean
  /** fine pointer + motion ok — enables the magnetic close button */
  fine: boolean
  lock: () => void
  unlock: () => void
}

export interface OverlayApi {
  open: (index: number, push?: boolean) => void
}

export function createOverlay(videos: VideoEntry[], ctx: OverlayCtx): OverlayApi {
  const root = document.createElement('div')
  root.className = 'overlay'
  root.innerHTML = `
    <div class="overlay__scrim" data-overlay-close></div>
    <div class="overlay__panel" role="dialog" aria-modal="true" aria-label="Video player">
      <button class="overlay__close" type="button" aria-label="Close player" data-magnetic>
        <span data-magnetic-label aria-hidden="true">×</span>
      </button>
      <div class="overlay__stage">
        <div class="overlay__media"></div>
        <div class="overlay__head">
          <div>
            <div class="overlay__title-mask"><h3 class="overlay__title display"></h3></div>
            <p class="overlay__meta micro tabular"></p>
          </div>
          <div class="overlay__nav">
            <button type="button" data-overlay-prev aria-label="Prev film">← PREV</button>
            <button type="button" data-overlay-next aria-label="Next film">NEXT →</button>
          </div>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(root)

  const scrim = root.querySelector<HTMLElement>('.overlay__scrim')!
  const panel = root.querySelector<HTMLElement>('.overlay__panel')!
  const closeBtn = root.querySelector<HTMLButtonElement>('.overlay__close')!
  const media = root.querySelector<HTMLElement>('.overlay__media')!
  const title = root.querySelector<HTMLElement>('.overlay__title')!
  const meta = root.querySelector<HTMLElement>('.overlay__meta')!
  const head = root.querySelector<HTMLElement>('.overlay__head')!
  const prevBtn = root.querySelector<HTMLButtonElement>('[data-overlay-prev]')!
  const nextBtn = root.querySelector<HTMLButtonElement>('[data-overlay-next]')!

  let index = 0
  let isOpen = false
  let pushed = false
  let closingViaHistory = false
  let lastFocus: HTMLElement | null = null
  // magnetic close button registered only while open — a hidden overlay must
  // not react to (or measure for) pointer moves near the viewport corner
  let unmagnetize: (() => void) | null = null

  const basePath = (): string => location.pathname + location.search

  function renderMedia(entry: VideoEntry): void {
    media.innerHTML = ''
    const src = entry.source
    const autoplay = ctx.reduced ? 0 : 1 // §13 — no autoplay under reduced motion
    if (src.type === 'youtube' && src.id) {
      const frame = document.createElement('iframe')
      frame.className = 'overlay__embed'
      frame.src = `https://www.youtube-nocookie.com/embed/${src.id}?autoplay=${autoplay}&rel=0&playsinline=1`
      frame.title = entry.title
      frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media'
      frame.setAttribute('allowfullscreen', '')
      media.appendChild(frame)
    } else if (src.type === 'vimeo' && src.id) {
      const frame = document.createElement('iframe')
      frame.className = 'overlay__embed'
      frame.src = `https://player.vimeo.com/video/${src.id}?autoplay=${autoplay}`
      frame.title = entry.title
      frame.allow = 'autoplay; fullscreen; picture-in-picture'
      frame.setAttribute('allowfullscreen', '')
      media.appendChild(frame)
    } else if (src.type === 'file' && src.url) {
      const video = document.createElement('video')
      video.className = 'overlay__embed'
      video.controls = true
      video.playsInline = true
      // contain — vertical films letterbox cleanly inside the 16:9 stage
      video.style.objectFit = 'contain'
      video.src = src.url
      if (!ctx.reduced) video.autoplay = true
      media.appendChild(video)
    } else {
      // placeholder — large animated poster + coming-soon line
      const poster = createPoster(entry, videos.indexOf(entry))
      poster.classList.add('is-live')
      media.appendChild(poster)
      const note = document.createElement('p')
      note.className = 'overlay__coming micro'
      note.innerHTML = `FILM COMING SOON — FOLLOW <a href="${SITE.instagram}" target="_blank" rel="noopener noreferrer">@RNDYVISUALS</a>`
      media.appendChild(note)
    }
  }

  function setContent(i: number): void {
    index = i
    const entry = videos[i]
    if (!entry) return
    renderMedia(entry)
    title.textContent = entry.title
    // no brands / buzzwords — optional short caption only, hidden when absent
    meta.textContent = entry.caption ? entry.caption.toUpperCase() : ''
    meta.hidden = !entry.caption
    panel.setAttribute('aria-label', `${entry.title} — video player`)
  }

  const releaseMedia = (): void => {
    const v = media.querySelector('video')
    v?.pause()
    media.innerHTML = ''
  }

  /* ------------------------------------------------------------ history */

  const clearHash = (): void => {
    history.replaceState(null, '', basePath())
  }

  window.addEventListener('popstate', () => {
    const match = location.hash.match(/^#work\/(.+)$/)
    if (match) {
      const i = videos.findIndex((v) => v.id === match[1])
      if (i >= 0) {
        if (isOpen) swapTo(i)
        else open(i, false)
      }
    } else if (isOpen) {
      closingViaHistory = false
      pushed = false
      doClose()
    }
  })

  /* --------------------------------------------------------- focus trap */

  function trap(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      requestClose()
      return
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      // don't hijack native seeking/typing inside the media or form fields
      const t = e.target
      if (t instanceof HTMLElement && t.closest('video, iframe, input, textarea')) return
      e.preventDefault()
      step(e.key === 'ArrowRight' ? 1 : -1)
      return
    }
    if (e.key !== 'Tab') return
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>('button, a[href], video, iframe, [tabindex]:not([tabindex="-1"])'),
    )
    if (!focusables.length) return
    const first = focusables[0] as HTMLElement
    const last = focusables[focusables.length - 1] as HTMLElement
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  /* --------------------------------------------------------- open/close */

  function open(i: number, push = true): void {
    const safe = ((i % videos.length) + videos.length) % videos.length
    const entry = videos[safe]
    if (!entry) return
    if (isOpen) {
      swapTo(safe)
      return
    }
    isOpen = true
    closingViaHistory = false
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ctx.lock()
    if (ctx.fine) unmagnetize = magnetize(closeBtn)
    setContent(safe)
    if (push) {
      history.pushState({ overlay: entry.id }, '', `#work/${entry.id}`)
      pushed = true
    } else {
      pushed = false
    }
    document.addEventListener('keydown', trap)
    gsap.set(root, { visibility: 'visible' })

    if (ctx.reduced) {
      // §13 — 0.25s cross-fade
      gsap.set([media, title, meta, head, closeBtn], { clearProps: 'all' })
      gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'none' })
      gsap.set(panel, { clipPath: 'inset(0% 0% 0% 0%)' })
      gsap.set(scrim, { opacity: 1 })
      closeBtn.focus({ preventScroll: true })
      return
    }

    // overlay-open (§6) — panel clip 0–0.7s, media 0.35–0.95s, title 0.45s+,
    // close button back.out, meta stagger 0.06
    // undo the close-state (autoAlpha 0, y -20) on reopen — the open fromTos
    // below only cover scale/autoAlpha, so y must be reset explicitly
    gsap.set([head, media, closeBtn], { autoAlpha: 1, y: 0 })
    const tl = gsap.timeline()
    tl.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'none' }, 0)
    tl.fromTo(
      panel,
      { clipPath: 'inset(100% 0% 0% 0%)' },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.7, ease: 'power4.inOut' },
      0,
    )
    tl.fromTo(
      media,
      { scale: 0.92, autoAlpha: 0 },
      { scale: 1, autoAlpha: 1, duration: 0.6, ease: 'expo.out' },
      0.35,
    )
    tl.fromTo(title, { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: 'expo.out' }, 0.45)
    tl.fromTo(
      [meta, prevBtn, nextBtn],
      { y: 12, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.5, ease: 'expo.out', stagger: 0.06 },
      0.55,
    )
    tl.fromTo(
      closeBtn,
      { scale: 0, autoAlpha: 0 },
      { scale: 1, autoAlpha: 1, duration: 0.4, ease: 'back.out(1.7)' },
      0.5,
    )
    tl.add(() => closeBtn.focus({ preventScroll: true }), 0.5)
  }

  function swapTo(i: number): void {
    const safe = ((i % videos.length) + videos.length) % videos.length
    const entry = videos[safe]
    if (!entry || safe === index) return
    history.replaceState({ overlay: entry.id }, '', `#work/${entry.id}`)
    const parts = [media, title, meta]
    gsap.to(parts, {
      autoAlpha: 0,
      y: ctx.reduced ? 0 : -12,
      duration: 0.2,
      ease: 'power2.in',
      onComplete: () => {
        setContent(safe)
        gsap.fromTo(
          parts,
          { autoAlpha: 0, y: ctx.reduced ? 0 : 12 },
          { autoAlpha: 1, y: 0, duration: 0.35, ease: 'expo.out', stagger: 0.05 },
        )
      },
    })
  }

  function step(dir: number): void {
    swapTo(index + dir)
  }

  function requestClose(): void {
    if (!isOpen || closingViaHistory) return
    if (pushed) {
      // pop our own entry; popstate performs the actual close
      closingViaHistory = true
      history.back()
    } else {
      clearHash()
      doClose()
    }
  }

  function doClose(): void {
    if (!isOpen) return
    isOpen = false
    document.removeEventListener('keydown', trap)
    const done = (): void => {
      gsap.set(root, { visibility: 'hidden' })
      unmagnetize?.()
      unmagnetize = null
      ctx.unlock()
      lastFocus?.focus({ preventScroll: true })
      lastFocus = null
    }

    if (ctx.reduced) {
      gsap.to(root, {
        opacity: 0,
        duration: 0.25,
        ease: 'none',
        onComplete: () => {
          releaseMedia()
          gsap.set(root, { opacity: 1 })
          done()
        },
      })
      return
    }

    // overlay-close (§6) — content out 0.25s, panel wipe from t=0.1, src released t=0.35
    const tl = gsap.timeline({ onComplete: done })
    tl.to([media, head, closeBtn], { autoAlpha: 0, y: -20, duration: 0.25, ease: 'power2.in' }, 0)
    tl.to(panel, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.5, ease: 'power4.inOut' }, 0.1)
    tl.to(scrim, { opacity: 0, duration: 0.3, ease: 'none' }, 0.2)
    tl.add(() => releaseMedia(), 0.35)
  }

  /* ------------------------------------------------------------- wiring */

  closeBtn.addEventListener('click', requestClose)
  scrim.addEventListener('click', requestClose)
  prevBtn.addEventListener('click', () => step(-1))
  nextBtn.addEventListener('click', () => step(1))

  return { open }
}
