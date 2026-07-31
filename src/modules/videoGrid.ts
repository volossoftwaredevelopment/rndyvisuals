// Home video grid — tight tiles of muted looping films. Lazy-attaches sources
// and autoplays only while in view (IntersectionObserver); click opens the
// overlay player with sound. Vertical films are cover-cropped in the tile.

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { VideoEntry } from '../types'

export interface GridOpts {
  reduced: boolean
  onOpen: (index: number) => void
}

export function renderVideoGrid(mount: HTMLElement, videos: VideoEntry[], opts: GridOpts): void {
  const media: HTMLVideoElement[] = []

  videos.forEach((entry, i) => {
    const tile = document.createElement('button')
    tile.type = 'button'
    tile.className = 'tile'
    tile.dataset.workIndex = String(i)
    tile.dataset.cursor = 'play'
    tile.setAttribute('aria-label', `Play ${entry.title}`)

    const box = document.createElement('div')
    box.className = 'tile__media'

    // Always render the poster as its own always-visible layer. (Putting it only
    // on the <video>'s poster attr fails when autoplay is blocked or slow: the
    // video sits at opacity 0 until it plays, so the poster on it is invisible
    // too and the tile shows blank.) The video fades in on top when it plays.
    const poster = entry.poster || ''
    if (poster) {
      const img = document.createElement('img')
      img.className = 'tile__poster'
      img.src = poster
      img.alt = ''
      img.loading = 'lazy'
      box.appendChild(img)
    }
    if (entry.source.type === 'file' && entry.source.url) {
      const video = document.createElement('video')
      video.className = 'tile__video'
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.preload = 'none'
      video.dataset.src = entry.source.url
      box.appendChild(video)
      media.push(video)
    }

    const play = document.createElement('span')
    play.className = 'tile__play'
    play.setAttribute('aria-hidden', 'true')
    play.textContent = 'PLAY'
    box.appendChild(play)

    const bar = document.createElement('div')
    bar.className = 'tile__bar'
    const title = document.createElement('span')
    title.className = 'tile__title'
    title.textContent = entry.title
    bar.appendChild(title)

    tile.append(box, bar)
    tile.addEventListener('click', () => opts.onOpen(i))
    mount.appendChild(tile)
  })

  // Tile reveal — opacity + y only (never autoAlpha / visibility:hidden), so a
  // still-hidden tile stays keyboard-focusable and present in the a11y tree.
  // The tiles are the site's primary content and sit below the full-height
  // hero, so without this a keyboard user would tab straight past them. Reveal
  // is owned here rather than via data-reveal="fade-up" (which uses autoAlpha).
  const tiles = Array.from(mount.querySelectorAll<HTMLElement>('.tile'))
  if (opts.reduced) {
    gsap.set(tiles, { opacity: 0 })
    ScrollTrigger.batch(tiles, {
      start: 'top 92%',
      once: true,
      batchMax: 6,
      onEnter: (b) => gsap.to(b, { opacity: 1, duration: 0.3, ease: 'none', overwrite: true }),
    })
  } else {
    gsap.set(tiles, { opacity: 0, y: 40 })
    ScrollTrigger.batch(tiles, {
      start: 'top 85%',
      once: true,
      batchMax: 6,
      onEnter: (b) =>
        gsap.to(b, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.08, overwrite: true }),
    })
  }
  // Focus safety — a tile focused before it scroll-reveals is forced fully
  // visible so its focus ring shows (WCAG 2.4.7) instead of animating from 0.
  mount.addEventListener('focusin', (e) => {
    const tile = e.target instanceof Element ? e.target.closest<HTMLElement>('.tile') : null
    if (tile) gsap.set(tile, { opacity: 1, y: 0 })
  })

  // reduced motion / no file sources — posters stay, nothing autoplays
  if (opts.reduced || media.length === 0) return

  // Videos autoplaying while in view; tracked so they can resume after a tab
  // switch (an IntersectionObserver does not re-fire on visibilitychange).
  const inView = new Set<HTMLVideoElement>()

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const v = e.target as HTMLVideoElement
        const tile = v.closest('.tile')
        if (e.isIntersecting) {
          inView.add(v)
          if (v.dataset.src && !v.getAttribute('src')) {
            v.src = v.dataset.src
            v.load()
          }
          v.play()
            .then(() => tile?.classList.add('is-playing'))
            .catch(() => {
              /* autoplay blocked — poster remains */
            })
        } else {
          inView.delete(v)
          v.pause()
          // fall back to the poster instead of freezing on the last frame
          tile?.classList.remove('is-playing')
        }
      })
    },
    { rootMargin: '200px 0px', threshold: 0.15 },
  )

  media.forEach((v) => io.observe(v))

  // If the browser blocked muted autoplay, retry the in-view videos on the
  // first user gesture (scroll/click/key) — the poster shows until then.
  const unlock = (): void => {
    inView.forEach((v) =>
      v
        .play()
        .then(() => v.closest('.tile')?.classList.add('is-playing'))
        .catch(() => {}),
    )
  }
  ;(['pointerdown', 'touchstart', 'keydown', 'wheel'] as const).forEach((ev) =>
    window.addEventListener(ev, unlock, { once: true, passive: true }),
  )

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      media.forEach((v) => v.pause())
    } else {
      // resume the tiles still in view — the observer will not re-fire for them
      inView.forEach((v) => {
        v.play()
          .then(() => v.closest('.tile')?.classList.add('is-playing'))
          .catch(() => {})
      })
    }
  })
}
