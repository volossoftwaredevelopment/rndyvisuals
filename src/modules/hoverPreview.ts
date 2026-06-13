// Hover preview card (§4.4 / §6) — fixed 480×270 card following the cursor
// with lerp 0.08, animated poster immediately, one shared <video> for real
// 'file' sources (youtube/vimeo stay on their poster/thumb — no direct mp4).

import gsap from 'gsap'
import { createPoster } from './posters'
import type { WorkRow } from './workIndex'

const LERP = 0.08
const GRACE_MS = 300
const CARD_W = 480
const CARD_H = 270
const WM_PARALLAX = 0.25 // watermark drag against the follow, clamped ±15px

export function initHoverPreview(rows: WorkRow[], section: HTMLElement): () => void {
  const card = document.createElement('div')
  card.className = 'preview-card'
  card.setAttribute('aria-hidden', 'true')
  const inner = document.createElement('div')
  inner.className = 'preview-card__inner'

  // shared preview <video> per §6 mechanics
  const video = document.createElement('video')
  video.className = 'preview-card__video'
  video.muted = true
  video.loop = true
  video.playsInline = true
  video.preload = 'none'

  inner.appendChild(video)
  card.appendChild(inner)
  document.body.appendChild(card)

  const posters = rows.map((row) => createPoster(row.entry, row.index))

  let tx = 0
  let ty = 0
  let x = 0
  let y = 0
  let visible = false
  let ticking = false
  let graceTimer: number | undefined
  let currentPoster: HTMLElement | null = null
  let watermark: HTMLElement | null = null
  let clipTl: gsap.core.Timeline | null = null

  const onCanPlay = (): void => {
    gsap.to(video, { opacity: 1, duration: 0.3, ease: 'none' })
  }

  const releaseVideo = (): void => {
    video.removeEventListener('canplay', onCanPlay)
    if (video.getAttribute('src')) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    gsap.set(video, { opacity: 0 })
  }

  const onMove = (e: PointerEvent): void => {
    tx = e.clientX - CARD_W / 2
    ty = e.clientY - CARD_H / 2
  }

  const tick = (_time: number, deltaTime: number): void => {
    const k = 1 - Math.pow(1 - LERP, (deltaTime / 1000) * 60)
    x += (tx - x) * k
    y += (ty - y) * k
    card.style.transform = `translate3d(${x}px, ${y}px, 0)`
    if (watermark) {
      const wx = gsap.utils.clamp(-15, 15, (x - tx) * WM_PARALLAX)
      const wy = gsap.utils.clamp(-15, 15, (y - ty) * WM_PARALLAX)
      watermark.style.transform = `translate3d(${wx}px, ${wy}px, 0)`
    }
  }

  const mount = (row: WorkRow): void => {
    const poster = posters[row.index]
    if (!poster) return
    if (currentPoster !== poster) {
      currentPoster?.classList.remove('is-live')
      currentPoster?.remove()
      inner.insertBefore(poster, video)
      currentPoster = poster
    }
    poster.classList.add('is-live')
    watermark = poster.querySelector<HTMLElement>('.poster__index')

    releaseVideo()
    const source = row.entry.source
    if (source.type === 'file' && source.url) {
      video.src = source.url
      video.addEventListener('canplay', onCanPlay, { once: true })
      void video.play().catch(() => {
        /* autoplay rejection — poster stays */
      })
    }
  }

  const show = (row: WorkRow, e: PointerEvent): void => {
    window.clearTimeout(graceTimer)
    mount(row)
    if (visible) return
    visible = true
    tx = e.clientX - CARD_W / 2
    ty = e.clientY - CARD_H / 2
    x = tx
    y = ty
    card.style.transform = `translate3d(${x}px, ${y}px, 0)`
    if (!ticking) {
      ticking = true
      gsap.ticker.add(tick)
    }
    clipTl?.kill()
    gsap.set(card, { visibility: 'visible' })
    // preview-card-in — clip up + counter-scale 1.3→1
    clipTl = gsap.timeline()
    clipTl.fromTo(
      card,
      { clipPath: 'inset(100% 0% 0% 0%)' },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.5, ease: 'expo.out' },
      0,
    )
    clipTl.fromTo(inner, { scale: 1.3 }, { scale: 1, duration: 0.5, ease: 'expo.out' }, 0)
  }

  const scheduleHide = (): void => {
    // 300ms detach grace — row-to-row moves keep the card alive
    window.clearTimeout(graceTimer)
    graceTimer = window.setTimeout(() => {
      visible = false
      clipTl?.kill()
      clipTl = gsap.timeline({
        onComplete: () => {
          gsap.set(card, { visibility: 'hidden' })
          if (ticking) {
            ticking = false
            gsap.ticker.remove(tick)
          }
          currentPoster?.classList.remove('is-live')
          releaseVideo()
        },
      })
      clipTl.to(card, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.4, ease: 'power3.in' }, 0)
    }, GRACE_MS)
  }

  const unbinders = rows.map((row) => {
    const enter = (e: PointerEvent): void => show(row, e)
    const leave = (): void => scheduleHide()
    row.button.addEventListener('pointerenter', enter)
    row.button.addEventListener('pointerleave', leave)
    return () => {
      row.button.removeEventListener('pointerenter', enter)
      row.button.removeEventListener('pointerleave', leave)
    }
  })
  section.addEventListener('pointermove', onMove, { passive: true })

  // warm the first 2 real-file previews when the section nears the viewport (§6)
  const warmed: HTMLVideoElement[] = []
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((en) => en.isIntersecting)) return
      io.disconnect()
      rows
        .filter((r) => r.entry.source.type === 'file' && r.entry.source.url)
        .slice(0, 2)
        .forEach((r) => {
          const warm = document.createElement('video')
          warm.preload = 'metadata'
          warm.muted = true
          warm.src = r.entry.source.url as string
          warmed.push(warm)
        })
    },
    { rootMargin: '400px' },
  )
  io.observe(section)

  return () => {
    window.clearTimeout(graceTimer)
    io.disconnect()
    warmed.forEach((w) => {
      w.removeAttribute('src')
      w.load()
    })
    unbinders.forEach((off) => off())
    section.removeEventListener('pointermove', onMove)
    if (ticking) gsap.ticker.remove(tick)
    releaseVideo()
    clipTl?.kill()
    card.remove()
  }
}
