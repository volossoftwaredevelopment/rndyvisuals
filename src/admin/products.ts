// Products panel — edits src/data/products.json plus the shop images
// (public/shop/) and downloadable files (public/downloads/). A list of products
// with a below-list editor; images and the deliverable file upload from the
// browser and, on publish, commit together with the manifest in ONE commit.

import { commitFiles, fetchTextFile } from './github'
import type { CommitFile } from './github'
import { afterPublish } from './deploy'
import { esc } from '../lib/esc'
import type { AdminCtx, Panel } from './panel'

const MANIFEST = 'src/data/products.json'
const MAX_IMG_BYTES = 8 * 1024 * 1024
const MAX_DL_BYTES = 50 * 1024 * 1024
const OK_IMG = /^image\/(png|jpe?g|webp|gif|avif)$/

interface Product {
  id: string
  title: string
  category: string
  price: number
  blurb: string
  features: string[]
  hue: number
  images: string[]
  download: string
  downloadName?: string
}

interface StagedFile {
  base64: string
  dataUrl?: string
}

function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const node = document.querySelector<T>(sel)
  if (!node) throw new Error(`admin: missing element ${sel}`)
  return node
}

function setMsg(el: HTMLElement, text: string, kind: 'error' | 'ok' | 'info' = 'info'): void {
  el.textContent = text
  el.hidden = text === ''
  el.classList.remove('msg--error', 'msg--ok', 'msg--info')
  if (text) el.classList.add(`msg--${kind}`)
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function shortHash(s: string): string {
  let h = 2166136261 >>> 0
  const step = Math.max(1, Math.floor(s.length / 4096))
  for (let i = 0; i < s.length; i += step) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  h ^= s.length
  return (h >>> 0).toString(36)
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function imgExt(file: File): string {
  const n = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'webp', 'gif', 'avif'].includes(n)) return n
  if (n === 'jpg' || n === 'jpeg') return 'jpg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  if (file.type === 'image/avif') return 'avif'
  return 'jpg'
}

function dlExt(file: File): string {
  const n = file.name.split('.').pop()?.toLowerCase() ?? ''
  const clean = n.replace(/[^a-z0-9]/g, '')
  return clean && clean.length <= 5 ? clean : 'zip'
}

function readImage(file: File): Promise<StagedFile | null> {
  return new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => {
      const dataUrl = String(r.result)
      const base64 = dataUrl.split(',')[1] ?? ''
      resolve(base64 ? { base64, dataUrl } : null)
    }
    r.onerror = () => resolve(null)
    r.readAsDataURL(file)
  })
}

/** ./shop/x.jpg -> public/shop/x.jpg ; ./downloads/y.zip -> public/downloads/y.zip */
function toRepoPath(siteUrl: string): string {
  return `public/${siteUrl.replace(/^\.?\//, '')}`
}

// Canonical shape so the load baseline and the pre-publish drift check compare
// equal even when a hand-edited manifest omits optional fields.
function normalizeProducts(raw: unknown): Product[] {
  if (!Array.isArray(raw)) return []
  return raw.map((p) => {
    const o = p as Partial<Product>
    const out: Product = {
      id: String(o.id ?? ''),
      title: String(o.title ?? ''),
      category: String(o.category ?? ''),
      price: Number(o.price ?? 0),
      blurb: String(o.blurb ?? ''),
      features: Array.isArray(o.features) ? o.features : [],
      hue: Number(o.hue ?? 210),
      images: Array.isArray(o.images) ? o.images : [],
      download: o.download ?? '',
    }
    if (o.downloadName) out.downloadName = o.downloadName
    return out
  })
}

export function createProductsPanel(ctx: AdminCtx): Panel {
  const rowsEl = $<HTMLOListElement>('#product-rows')
  const addBtn = $<HTMLButtonElement>('#product-add')
  const publishBtn = $<HTMLButtonElement>('#products-publish')
  const msg = $('#products-msg')
  const note = $('#products-note')
  const editor = $('#product-editor')
  const heading = $('#pe-heading')
  const doneBtn = $<HTMLButtonElement>('#pe-done')
  const imagesEl = $<HTMLOListElement>('#pe-images')
  const imagesInput = $<HTMLInputElement>('#pe-images-input')
  const downloadEl = $('#pe-download')
  const downloadInput = $<HTMLInputElement>('#pe-download-input')
  const editMsg = $('#pe-msg')

  const fields = Array.from(editor.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-pf]'))

  let baseline = ''
  let loaded = false // guard: a pristine, never-loaded panel must not report dirty
  let list: Product[] = []
  const staged = new Map<string, StagedFile>()
  let editing: Product | null = null
  let publishing = false

  const serialize = (): string => JSON.stringify(list)
  const dirty = (): boolean => loaded && serialize() !== baseline

  const preview = (path: string): string => staged.get(toRepoPath(path))?.dataUrl ?? path

  function uniqueId(seed: string): string {
    const base = slugify(seed) || 'product'
    const taken = new Set(list.map((p) => p.id))
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base}-${n}`)) n += 1
    return `${base}-${n}`
  }

  function updateUI(): void {
    const isDirty = dirty()
    publishBtn.textContent = publishing ? 'Publishing…' : isDirty ? 'Publish changes' : 'Published'
    publishBtn.disabled = publishing || !isDirty || !ctx.valid()
    note.textContent = isDirty ? 'Unpublished changes' : 'All changes published'
    note.classList.toggle('is-dirty', isDirty)
  }

  /* --------------------------------- list --------------------------------- */

  function buildRow(p: Product, index: number): HTMLLIElement {
    const li = document.createElement('li')
    li.className = 'product-row'
    li.dataset.id = p.id
    const cover = p.images[0]
      ? `<img alt="" src="${preview(p.images[0])}" />`
      : `<span class="prod-swatch" style="--poster-hue:${p.hue}"></span>`
    li.innerHTML = `
      <span class="prod-thumb">${cover}</span>
      <span class="prod-main">
        <span class="prod-title">${p.title ? esc(p.title) : 'Untitled product'}</span>
        <span class="prod-sub micro">${p.category ? esc(p.category) : '—'} · €${p.price}</span>
      </span>
      <button type="button" class="btn btn--ghost btn--sm" data-act="edit">Edit</button>
      <span class="row-updown">
        <button type="button" data-act="up" title="Move up" aria-label="Move up"${index === 0 ? ' disabled' : ''}>▲</button>
        <button type="button" data-act="down" title="Move down" aria-label="Move down"${index === list.length - 1 ? ' disabled' : ''}>▼</button>
      </span>
      <button class="x" type="button" data-act="delete" title="Delete" aria-label="Delete">×</button>`
    return li
  }

  function renderList(): void {
    rowsEl.textContent = ''
    if (list.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'rows-empty'
      empty.textContent = 'No products yet — add one below.'
      rowsEl.append(empty)
    } else {
      list.forEach((p, i) => rowsEl.append(buildRow(p, i)))
    }
    updateUI()
  }

  // renderList() rebuilds the rows, dropping focus to <body>; put keyboard users
  // back on the arrow they pressed (or its twin when it lands at a list bound).
  function refocusRow(id: string | undefined, act: 'up' | 'down'): void {
    if (!id) return
    const row = rowsEl.querySelector<HTMLElement>(`.product-row[data-id="${id}"]`)
    if (!row) return
    const pressed = row.querySelector<HTMLButtonElement>(`[data-act="${act}"]`)
    const twin = row.querySelector<HTMLButtonElement>(`[data-act="${act === 'up' ? 'down' : 'up'}"]`)
    ;(pressed && !pressed.disabled ? pressed : twin)?.focus()
  }

  /* -------------------------------- editor -------------------------------- */

  function renderImages(): void {
    if (!editing) return
    imagesEl.textContent = ''
    editing.images.forEach((img, i) => {
      const li = document.createElement('li')
      li.className = 'pe-image'
      li.innerHTML = `
        <img alt="" src="${preview(img)}" />
        <div class="pe-image__ctl">
          <button type="button" data-img-act="left" title="Move left" aria-label="Move left"${i === 0 ? ' disabled' : ''}>◀</button>
          <button type="button" data-img-act="right" title="Move right" aria-label="Move right"${i === editing!.images.length - 1 ? ' disabled' : ''}>▶</button>
          <button type="button" class="x" data-img-act="remove" title="Remove image" aria-label="Remove image">×</button>
        </div>`
      li.dataset.i = String(i)
      imagesEl.append(li)
    })
  }

  function renderDownload(): void {
    if (!editing) return
    if (editing.download) {
      downloadEl.innerHTML = `
        <span class="pe-file">
          <span class="pe-file__name">${editing.downloadName || editing.download.split('/').pop()}</span>
          <button type="button" class="x" data-download-remove title="Remove file" aria-label="Remove file">×</button>
        </span>`
    } else {
      downloadEl.innerHTML = '<span class="pe-file pe-file--empty micro">No file yet</span>'
    }
  }

  function fillEditor(): void {
    if (!editing) return
    for (const f of fields) {
      const key = f.dataset.pf as keyof Product
      if (key === 'features') f.value = editing.features.join('\n')
      else if (key === 'price' || key === 'hue') f.value = String(editing[key])
      else f.value = String(editing[key] ?? '')
    }
    renderImages()
    renderDownload()
  }

  function openEditor(p: Product, isNew: boolean): void {
    editing = p
    heading.textContent = isNew ? 'New product' : 'Edit product'
    setMsg(editMsg, '')
    fillEditor()
    editor.hidden = false
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' })
    fields[0]?.focus()
  }

  // a freshly-added product the user abandoned via Done — nothing worth keeping
  function isBlank(p: Product): boolean {
    return !p.title.trim() && p.images.length === 0 && !p.download && !p.blurb.trim() && p.features.length === 0
  }

  function closeEditor(): void {
    const closed = editing
    editing = null
    editor.hidden = true
    let dropped = false
    if (closed && isBlank(closed)) {
      const idx = list.indexOf(closed)
      if (idx >= 0) {
        list.splice(idx, 1)
        dropped = true
      }
    }
    renderList()
    // return focus into the list rather than dropping it to <body>
    const target =
      closed && !dropped
        ? rowsEl.querySelector<HTMLButtonElement>(`.product-row[data-id="${closed.id}"] [data-act="edit"]`)
        : null
    ;(target ?? addBtn).focus()
  }

  function readField(f: HTMLInputElement | HTMLTextAreaElement): void {
    if (!editing) return
    const key = f.dataset.pf as keyof Product
    if (key === 'price' || key === 'hue') {
      const raw = f.value.trim()
      if (raw === '') editing[key] = 0
      else {
        const n = key === 'price' ? Number.parseFloat(raw) : Number.parseInt(raw, 10)
        if (Number.isFinite(n)) editing[key] = n
      }
    } else if (key === 'features') {
      editing.features = f.value
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    } else if (key === 'title' || key === 'category' || key === 'blurb') {
      editing[key] = f.value
    }
    updateUI()
  }

  async function addImages(files: FileList): Promise<void> {
    if (!editing) return
    for (const file of Array.from(files)) {
      if (!OK_IMG.test(file.type)) {
        setMsg(editMsg, 'Images must be PNG, JPG, WebP, GIF or AVIF.', 'error')
        continue
      }
      if (file.size > MAX_IMG_BYTES) {
        setMsg(editMsg, `“${file.name}” is over 8 MB — use a smaller image.`, 'error')
        continue
      }
      const staged0 = await readImage(file)
      if (!staged0) {
        setMsg(editMsg, `Could not read “${file.name}”.`, 'error')
        continue
      }
      const base = slugify(editing.title) || editing.id
      const tag = shortHash(staged0.base64)
      const path = `./shop/${base}-${tag}.${imgExt(file)}`
      if (!editing.images.includes(path)) {
        staged.set(toRepoPath(path), staged0)
        editing.images.push(path)
      }
    }
    renderImages()
    renderList()
    updateUI()
  }

  async function setDownload(file: File): Promise<void> {
    if (!editing) return
    if (file.size > MAX_DL_BYTES) {
      setMsg(editMsg, `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB — keep the demo download under 50 MB.`, 'error')
      return
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const b64 = bytesToBase64(bytes)
      const base = slugify(editing.title) || editing.id
      const tag = shortHash(b64)
      // free a previously-staged download for this product (unless shared)
      freeMedia([editing.download], editing)
      const path = `./downloads/${base}-${tag}.${dlExt(file)}`
      staged.set(toRepoPath(path), { base64: b64 })
      editing.download = path
      editing.downloadName = file.name
      setMsg(editMsg, '')
      renderDownload()
      updateUI()
    } catch {
      setMsg(editMsg, 'Could not read that file — try again.', 'error')
    }
  }

  /* ------------------------------- publishing ------------------------------ */

  // Free staged bytes for these site-paths, but only when no OTHER product still
  // references them (content-hashed names can be shared between products).
  function freeMedia(urls: Array<string | undefined>, except: Product | null): void {
    for (const url of urls) {
      if (!url) continue
      const stillUsed = list.some((p) => p !== except && (p.images.includes(url) || p.download === url))
      if (!stillUsed) staged.delete(toRepoPath(url))
    }
  }

  function referencedMedia(items: Product[]): Set<string> {
    const set = new Set<string>()
    for (const p of items) {
      for (const img of p.images) set.add(toRepoPath(img))
      if (p.download) set.add(toRepoPath(p.download))
    }
    return set
  }

  async function publish(): Promise<void> {
    if (publishing || !dirty() || !ctx.valid()) return
    publishing = true
    updateUI()
    setMsg(msg, '')
    try {
      // normalise titles in place, then snapshot at click time; edits made while
      // the commit is in flight stay in `list` and remain publishable.
      list.forEach((p) => (p.title = p.title.trim()))
      const snapshot = structuredClone(list)

      // Drift guard: refuse if products.json changed on GitHub since load.
      // Normalise the remote the same way the loader does so an omitted optional
      // field is not mistaken for drift.
      const remote = await fetchTextFile(ctx.token(), MANIFEST)
      let remoteProducts: Product[] = []
      try {
        remoteProducts = normalizeProducts((JSON.parse(remote.text) as { products?: unknown }).products)
      } catch {
        remoteProducts = [{ id: ' drift' } as Product] // force a mismatch below
      }
      if (JSON.stringify(remoteProducts) !== baseline) {
        throw new Error('The products changed on GitHub in another session — reload the page and re-apply your changes.')
      }

      const files: CommitFile[] = [
        { path: MANIFEST, content: `${JSON.stringify({ products: snapshot }, null, 2)}\n`, encoding: 'utf-8' },
      ]
      const referenced = referencedMedia(snapshot)
      const committed = new Set<string>()
      for (const [path, file] of staged) {
        if (referenced.has(path)) {
          files.push({ path, content: file.base64, encoding: 'base64' })
          committed.add(path)
        }
      }
      await commitFiles(ctx.token(), files, 'content: update products via admin')
      baseline = JSON.stringify(snapshot)
      // drop committed + orphaned staged media; keep anything staged mid-publish
      // (still referenced by the live working copy, not yet committed).
      const live = referencedMedia(list)
      for (const path of [...staged.keys()]) {
        if (committed.has(path) || !live.has(path)) staged.delete(path)
      }
      renderList()
      renderImages()
      setMsg(msg, 'Published — the site is rebuilding now.', 'ok')
      afterPublish()
    } catch (err) {
      setMsg(msg, err instanceof Error ? err.message : 'Could not publish — try again.', 'error')
    } finally {
      publishing = false
      updateUI()
    }
  }

  /* --------------------------------- wiring -------------------------------- */

  rowsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]')
    if (!btn) return
    const id = btn.closest<HTMLElement>('.product-row')?.dataset.id
    const index = list.findIndex((p) => p.id === id)
    if (index < 0) return
    const act = btn.dataset.act
    if (act === 'edit') {
      openEditor(list[index], false)
    } else if (act === 'delete') {
      const p = list[index]
      if (window.confirm(`Delete “${p.title || p.id}”? It disappears from the shop on the next publish.`)) {
        if (editing === p) {
          editing = null
          editor.hidden = true
        }
        freeMedia([...p.images, p.download], p)
        list.splice(index, 1)
        renderList()
      }
    } else if (act === 'up' && index > 0) {
      ;[list[index - 1], list[index]] = [list[index], list[index - 1]]
      renderList()
      refocusRow(id, 'up')
    } else if (act === 'down' && index < list.length - 1) {
      ;[list[index + 1], list[index]] = [list[index], list[index + 1]]
      renderList()
      refocusRow(id, 'down')
    }
  })

  addBtn.addEventListener('click', () => {
    const p: Product = {
      id: uniqueId('product'),
      title: '',
      category: '',
      price: 0,
      blurb: '',
      features: [],
      hue: 210,
      images: [],
      download: '',
    }
    list.push(p)
    renderList()
    openEditor(p, true)
  })

  editor.addEventListener('input', (e) => {
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
      if (t.dataset.pf) readField(t)
    }
  })

  doneBtn.addEventListener('click', closeEditor)

  imagesInput.addEventListener('change', () => {
    if (imagesInput.files && imagesInput.files.length) void addImages(imagesInput.files)
    imagesInput.value = ''
  })

  imagesEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-img-act]')
    if (!btn || !editing) return
    const i = Number(btn.closest<HTMLElement>('.pe-image')?.dataset.i)
    if (!Number.isInteger(i)) return
    const act = btn.dataset.imgAct
    let focusIndex = i
    if (act === 'remove') {
      const [removed] = editing.images.splice(i, 1)
      freeMedia([removed], editing)
      focusIndex = Math.min(i, editing.images.length - 1)
    } else if (act === 'left' && i > 0) {
      ;[editing.images[i - 1], editing.images[i]] = [editing.images[i], editing.images[i - 1]]
      focusIndex = i - 1
    } else if (act === 'right' && i < editing.images.length - 1) {
      ;[editing.images[i + 1], editing.images[i]] = [editing.images[i], editing.images[i + 1]]
      focusIndex = i + 1
    }
    renderImages()
    renderList()
    updateUI()
    // renderImages() rebuilt the thumbs — restore focus into the editor
    const li = focusIndex >= 0 ? imagesEl.querySelector<HTMLElement>(`.pe-image[data-i="${focusIndex}"]`) : null
    ;(li?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? doneBtn).focus()
  })

  downloadInput.addEventListener('change', () => {
    const file = downloadInput.files?.[0]
    if (file) void setDownload(file)
    downloadInput.value = ''
  })

  downloadEl.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-download-remove]') || !editing) return
    freeMedia([editing.download], editing)
    editing.download = ''
    delete editing.downloadName
    renderDownload()
    updateUI()
  })

  publishBtn.addEventListener('click', () => void publish())

  return {
    async load(): Promise<void> {
      setMsg(msg, 'Loading…', 'info')
      try {
        const file = await fetchTextFile(ctx.token(), MANIFEST)
        const parsed = JSON.parse(file.text) as { products?: unknown }
        list = normalizeProducts(parsed.products)
        staged.clear()
        editing = null
        editor.hidden = true
        baseline = serialize()
        loaded = true
        setMsg(msg, '')
        renderList()
      } catch (err) {
        setMsg(msg, err instanceof Error ? err.message : 'Could not load products.', 'error')
      }
    },
    reset(): void {
      list = []
      staged.clear()
      editing = null
      editor.hidden = true
      baseline = ''
      loaded = false
      rowsEl.textContent = ''
      setMsg(msg, '')
      updateUI()
    },
    isDirty: dirty,
  }
}
