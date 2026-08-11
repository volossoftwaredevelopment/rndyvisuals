// "Main video" slot + the little map of the home page.
//
// The point of both is orientation: it should be obvious at a glance which film
// is the full-screen background and which ones sit in the grid below it.

import { get, save } from './store'
import { checkFile, uploadToR2 } from './r2upload'
import { attachGridDnd } from './gridDnd'
import { createProgress } from './progress'
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

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export interface HeroApi {
  load(): Promise<void>
  /** Redraw the map — call whenever the film library changes. */
  paintMap(videos: VideoEntry[]): void
  /** URL of the film currently in the main slot, '' if empty. */
  videoUrl(): string
}

export function createHero(
  posterFor: (file: File) => Promise<{ dataUrl: string } | null>,
  onReorder?: (from: number, to: number) => void,
  /** Called after the slot changes, so the library rows can re-badge. */
  onChange?: () => void,
): HeroApi {
  const thumb = $<HTMLImageElement>('#hero-thumb')
  const empty = $('#hero-empty')
  const stateEl = $('#hero-state')
  const nameEl = $('#hero-name')
  const chooseBtn = $<HTMLButtonElement>('#hero-choose')
  const removeBtn = $<HTMLButtonElement>('#hero-remove')
  const input = $<HTMLInputElement>('#hero-input')
  const msg = $('#hero-msg')
  const note = $('#hero-note')
  const hint = $('#hero-hint')
  const pickBtn = $<HTMLButtonElement>('#hero-pick')
  const picker = $('#hero-picker')
  const pickList = $('#hero-pick-list')
  const pickNote = $('#hero-pick-note')
  const pickCancel = $<HTMLButtonElement>('#hero-pick-cancel')
  const mapHero = $('[data-map-hero]')
  const mapGrid = $('[data-map-grid]')

  let hero: Hero = { brand: '', slogan: '' }
  let library: VideoEntry[] = []
  const progress = msg ? createProgress(msg) : null

  // The one button changes its job with the slot: with nothing uploaded there is
  // nothing to "replace", and offering "Delete" against an empty slot is just a
  // button that can only ever tell you no.
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
    if (stateEl) stateEl.textContent = has ? 'Live on the site' : 'Nothing uploaded yet'
    if (nameEl) {
      nameEl.textContent = has ? fileName(hero.video as string) : ''
      nameEl.hidden = !has
    }
    if (chooseBtn) chooseBtn.textContent = has ? 'Replace video' : 'Upload video'
    if (removeBtn) removeBtn.hidden = !has
    if (hint) {
      hint.textContent = has
        ? 'Replace swaps the film and keeps everything else. Delete clears the slot — the top of the page then shows the dark background with the wordmark.'
        : 'With no main video the top of the page is just the dark background with the wordmark — still tidy, simply without the film.'
    }
    if (note) note.textContent = has ? '' : 'Not set'
    if (mapHero) mapHero.style.backgroundImage = hero.poster ? `url("${hero.poster}")` : ''
  }

  function paintMap(videos: VideoEntry[]): void {
    library = videos
    if (picker && !picker.hidden) paintPicker()
    if (!mapGrid) return
    mapGrid.textContent = ''
    const cells: (VideoEntry | null)[] = videos.length ? videos : [null, null, null]
    cells.forEach((v, i) => {
      const cell = document.createElement('div')
      cell.className = 'lmap__tile' + (v ? ' lmap__tile--film' : ' lmap__tile--empty')
      if (v?.poster) cell.style.backgroundImage = `url("${v.poster}")`
      const name = v ? v.title || `Film ${i + 1}` : 'Empty slot'
      cell.innerHTML = `<span class="lmap__num">${i + 1}</span><span class="lmap__name">${escapeHtml(name)}</span>`
      cell.title = v ? `${name} — drag to move it to another slot` : 'Empty slot'
      mapGrid.appendChild(cell)
    })
  }

  // Only uploaded films can become the background: the hero is a muted, looping
  // <video>, so a YouTube or Vimeo entry has nothing to give it.
  const usable = (v: VideoEntry): boolean => v.source.type === 'file' && !!v.source.url

  function paintPicker(): void {
    if (!pickList) return
    pickList.textContent = ''
    const films = library.filter(usable)
    const linked = library.filter((v) => v.source.type === 'youtube' || v.source.type === 'vimeo').length
    const blank = library.length - films.length - linked

    if (!films.length) {
      const li = document.createElement('li')
      li.className = 'hero-pick__empty'
      li.textContent = library.length
        ? 'No uploaded films yet — only YouTube/Vimeo entries, which cannot be used as the background.'
        : 'The library is empty. Upload a film below first, or upload a video straight into this slot.'
      pickList.appendChild(li)
    }

    films.forEach((v, i) => {
      const url = v.source.url as string
      const current = url === hero.video
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'hero-pick__item' + (current ? ' is-current' : '')
      btn.disabled = current
      const title = v.title.trim() || `Film ${i + 1}`
      btn.innerHTML = `
        <span class="hero-pick__thumb"${v.poster ? ` style="background-image:url('${escapeHtml(v.poster)}')"` : ''}></span>
        <span class="hero-pick__title">${escapeHtml(title)}</span>
        <span class="hero-pick__act">${current ? 'Already the main video' : 'Use this'}</span>`
      btn.addEventListener('click', () => void useFromLibrary(v))
      li.appendChild(btn)
      pickList.appendChild(li)
    })

    // Say precisely what is missing from the list, or the count reads as a bug.
    if (pickNote) {
      const missing: string[] = []
      if (linked) missing.push(`${linked} YouTube/Vimeo ${linked === 1 ? 'link' : 'links'}`)
      if (blank) missing.push(`${blank} empty ${blank === 1 ? 'slot' : 'slots'}`)
      pickNote.hidden = missing.length === 0
      pickNote.textContent = missing.length
        ? `Not listed: ${missing.join(' and ')} — only an uploaded video file can play as the background.`
        : ''
    }
  }

  function openPicker(): void {
    if (!picker) return
    paintPicker()
    picker.hidden = false
    pickBtn?.setAttribute('aria-expanded', 'true')
    // the first film may already be the main video, and so disabled — skip to
    // something actually focusable, otherwise focus is left stranded on <body>
    picker.querySelector<HTMLElement>('button:not([disabled])')?.focus()
  }

  function closePicker(returnFocus = true): void {
    if (!picker || picker.hidden) return
    picker.hidden = true
    pickBtn?.setAttribute('aria-expanded', 'false')
    if (returnFocus) pickBtn?.focus()
  }

  async function useFromLibrary(v: VideoEntry): Promise<void> {
    const url = v.source.url
    if (!url) return
    try {
      // A copy, not a link: the library entry can change or go away afterwards
      // without the front page losing its background.
      hero = { ...hero, video: url, poster: v.poster || '' }
      await save('hero', hero)
      paintSlot()
      onChange?.()
      closePicker()
      setMsg(msg, `“${v.title.trim() || 'That film'}” is now the main video — already live on the site.`, 'ok')
    } catch (err) {
      setMsg(msg, err instanceof Error ? err.message : 'Could not set the main video.', 'error')
    }
  }

  async function replace(file: File): Promise<void> {
    const bad = checkFile(file, 'video')
    if (bad) return setMsg(msg, bad, 'error')
    const first = !hero.video
    if (chooseBtn) chooseBtn.disabled = true
    if (removeBtn) removeBtn.disabled = true
    setMsg(msg, '')
    progress?.start(file.name)
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
      const up = await uploadToR2(file, `home-hero.${file.name.split('.').pop()}`, 'video', (p) =>
        progress?.update(p),
      )
      hero = { ...hero, video: up.url, poster: posterUrl }
      await save('hero', hero)
      paintSlot()
      onChange?.()
      progress?.done()
      setMsg(msg, first ? 'Main video uploaded — already live on the site.' : 'Main video replaced — already live on the site.', 'ok')
    } catch (err) {
      progress?.done(err instanceof Error ? err.message : 'Upload failed.', 'error')
    } finally {
      if (chooseBtn) chooseBtn.disabled = false
      if (removeBtn) removeBtn.disabled = false
    }
  }

  async function remove(): Promise<void> {
    if (!hero.video && !hero.poster) return setMsg(msg, 'There is no main video to delete.', 'info')
    if (!window.confirm('Delete the main video? The top of the page will show the dark background instead.')) return
    if (removeBtn) removeBtn.disabled = true
    try {
      hero = { ...hero, video: '', poster: '' }
      await save('hero', hero)
      paintSlot()
      onChange?.()
      setMsg(msg, 'Main video deleted — the site is updated.', 'ok')
    } catch (err) {
      setMsg(msg, err instanceof Error ? err.message : 'Could not delete the video.', 'error')
    } finally {
      if (removeBtn) removeBtn.disabled = false
    }
  }

  // Drag a tile onto another to put that film in the other slot.
  if (mapGrid && onReorder) {
    attachGridDnd(mapGrid, '.lmap__tile', {
      onMove: onReorder,
      isDraggable: (el) => el.classList.contains('lmap__tile--film'),
    })
  }

  chooseBtn?.addEventListener('click', () => {
    closePicker(false)
    input?.click()
  })
  removeBtn?.addEventListener('click', () => void remove())
  pickBtn?.addEventListener('click', () => (picker?.hidden ? openPicker() : closePicker()))
  pickCancel?.addEventListener('click', () => closePicker())
  picker?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') closePicker()
  })
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
        onChange?.()
      } catch {
        setMsg(msg, 'Could not load the main video.', 'error')
      }
    },
    paintMap,
    videoUrl: () => hero.video ?? '',
  }
}
