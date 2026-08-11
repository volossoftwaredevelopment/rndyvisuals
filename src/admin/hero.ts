// "Main video" slot + the little map of the home page.
//
// The point of both is orientation: it should be obvious at a glance which film
// is the full-screen background and which ones sit in the grid below it.

import { get, save } from './store'
import { checkFile, uploadToR2 } from './r2upload'
import type { VideoEntry } from './types'

interface Hero {
  brand: string
  slogan: string
  video?: string
  poster?: string
}

function $<T extends HTMLElement = HTMLElement>(sel: string): T | null {
  return document.querySelector<T>(sel)
}

function setMsg(el: HTMLElement | null, text: string, kind: 'error' | 'ok' | 'info' = 'info'): void {
  if (!el) return
  el.textContent = text
  el.hidden = text === ''
  el.classList.remove('msg--error', 'msg--ok', 'msg--info')
  if (text) el.classList.add(`msg--${kind}`)
}

const fileName = (url: string): string => url.split('/').pop() || url

export interface HeroApi {
  load(): Promise<void>
  /** Redraw the map — call whenever the film library changes. */
  paintMap(videos: VideoEntry[]): void
}

export function createHero(posterFor: (file: File) => Promise<{ dataUrl: string } | null>): HeroApi {
  const thumb = $<HTMLImageElement>('#hero-thumb')
  const empty = $('#hero-empty')
  const nameEl = $('#hero-name')
  const replaceBtn = $<HTMLButtonElement>('#hero-replace')
  const removeBtn = $<HTMLButtonElement>('#hero-remove')
  const input = $<HTMLInputElement>('#hero-input')
  const msg = $('#hero-msg')
  const note = $('#hero-note')
  const mapHero = $('[data-map-hero]')
  const mapGrid = $('[data-map-grid]')

  let hero: Hero = { brand: '', slogan: '' }

  function paintSlot(): void {
    const has = !!hero.video
    if (thumb) {
      if (hero.poster) {
        thumb.src = hero.poster
        thumb.hidden = false
      } else {
        thumb.hidden = true
        thumb.removeAttribute('src')
      }
    }
    if (empty) empty.hidden = !!hero.poster
    if (nameEl) nameEl.textContent = has ? fileName(hero.video as string) : 'No video yet'
    if (note) note.textContent = has ? '' : 'Not set'
    if (mapHero) mapHero.style.backgroundImage = hero.poster ? `url("${hero.poster}")` : ''
  }

  function paintMap(videos: VideoEntry[]): void {
    if (!mapGrid) return
    mapGrid.textContent = ''
    const shown = videos.slice(0, 9)
    const cells = shown.length ? shown : Array.from({ length: 3 }, () => null)
    cells.forEach((v, i) => {
      const cell = document.createElement('div')
      cell.className = 'lmap__tile' + (v ? '' : ' lmap__tile--empty')
      if (v?.poster) cell.style.backgroundImage = `url("${v.poster}")`
      cell.innerHTML = `<span>${i + 1}</span>`
      cell.title = v ? v.title || `Film ${i + 1}` : 'Empty slot'
      mapGrid.appendChild(cell)
    })
    if (videos.length > 9) {
      const more = document.createElement('div')
      more.className = 'lmap__tile lmap__tile--empty'
      more.innerHTML = `<span>+${videos.length - 9}</span>`
      more.title = `${videos.length - 9} more below`
      mapGrid.appendChild(more)
    }
  }

  async function replace(file: File): Promise<void> {
    const bad = checkFile(file, 'video')
    if (bad) return setMsg(msg, bad, 'error')
    if (replaceBtn) replaceBtn.disabled = true
    setMsg(msg, `Uploading “${file.name}” — 0%`, 'info')
    try {
      // poster first so the slot updates as soon as possible
      let posterUrl = hero.poster ?? ''
      const shot = await posterFor(file)
      if (shot) {
        try {
          const blob = await (await fetch(shot.dataUrl)).blob()
          posterUrl = (await uploadToR2(blob, 'home-hero-poster.jpg', 'image')).url
        } catch {
          /* optional */
        }
      }
      const up = await uploadToR2(file, `home-hero.${file.name.split('.').pop()}`, 'video', (f) =>
        setMsg(msg, `Uploading “${file.name}” — ${Math.round(f * 100)}%`, 'info'),
      )
      hero = { ...hero, video: up.url, poster: posterUrl }
      await save('hero', hero)
      paintSlot()
      setMsg(msg, 'Main video updated — already live on the site.', 'ok')
    } catch (err) {
      setMsg(msg, err instanceof Error ? err.message : 'Upload failed.', 'error')
    } finally {
      if (replaceBtn) replaceBtn.disabled = false
    }
  }

  async function remove(): Promise<void> {
    if (!hero.video && !hero.poster) return setMsg(msg, 'There is no main video to remove.', 'info')
    if (!window.confirm('Remove the main video? The top of the page will show the dark background instead.')) return
    try {
      hero = { ...hero, video: '', poster: '' }
      await save('hero', hero)
      paintSlot()
      setMsg(msg, 'Main video removed — the site is updated.', 'ok')
    } catch (err) {
      setMsg(msg, err instanceof Error ? err.message : 'Could not remove the video.', 'error')
    }
  }

  replaceBtn?.addEventListener('click', () => input?.click())
  removeBtn?.addEventListener('click', () => void remove())
  input?.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) void replace(file)
    input.value = ''
  })

  return {
    async load(): Promise<void> {
      try {
        hero = await get<Hero>('hero', { brand: '', slogan: '' })
        paintSlot()
      } catch {
        setMsg(msg, 'Could not load the main video.', 'error')
      }
    },
    paintMap,
  }
}
