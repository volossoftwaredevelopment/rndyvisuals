// Products panel. Images and the downloadable file upload straight to R2 the
// moment they are picked; the list is saved to the content API, so a change is
// live on the site immediately.

import { get, save } from './store'
import { checkFile, uploadToR2 } from './r2upload'
import { esc } from '../lib/esc'
import type { AdminCtx, Panel } from './panel'


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
  let editing: Product | null = null
  let publishing = false

  const serialize = (): string => JSON.stringify(list)
  const dirty = (): boolean => loaded && serialize() !== baseline

  const preview = (path: string): string => path

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
    publishBtn.textContent = publishing ? 'Сохраняю…' : isDirty ? 'Сохранить' : 'Сохранено'
    publishBtn.disabled = publishing || !isDirty || !ctx.valid()
    note.textContent = isDirty ? 'Есть несохранённые правки' : 'Всё сохранено'
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
      const bad = checkFile(file, 'image')
      if (bad) {
        setMsg(editMsg, `«${file.name}»: ${bad}`, 'error')
        continue
      }
      setMsg(editMsg, `Загружаю «${file.name}»…`, 'info')
      try {
        const base = slugify(editing.title) || editing.id
        const up = await uploadToR2(file, `${base}.${file.name.split('.').pop()}`, 'image')
        if (!editing.images.includes(up.url)) editing.images.push(up.url)
        setMsg(editMsg, '')
      } catch (err) {
        setMsg(editMsg, err instanceof Error ? err.message : `Не удалось загрузить «${file.name}».`, 'error')
      }
    }
    renderImages()
    renderList()
    updateUI()
  }

  async function setDownload(file: File): Promise<void> {
    if (!editing) return
    const bad = checkFile(file, 'download')
    if (bad) return setMsg(editMsg, bad, 'error')
    setMsg(editMsg, `Загружаю «${file.name}»…`, 'info')
    try {
      const base = slugify(editing.title) || editing.id
      const up = await uploadToR2(file, `${base}.${file.name.split('.').pop()}`, 'download')
      editing.download = up.url
      editing.downloadName = file.name
      setMsg(editMsg, '')
      renderDownload()
      updateUI()
    } catch (err) {
      setMsg(editMsg, err instanceof Error ? err.message : 'Не удалось загрузить файл.', 'error')
    }
  }

  /* ------------------------------- publishing ------------------------------ */

  async function publish(): Promise<void> {
    if (publishing || !dirty() || !ctx.valid()) return
    publishing = true
    updateUI()
    setMsg(msg, '')
    try {
      list.forEach((p) => (p.title = p.title.trim()))
      const snapshot = structuredClone(list)
      await save('products', snapshot)
      baseline = JSON.stringify(snapshot)
      renderList()
      renderImages()
      setMsg(msg, 'Сохранено — уже на сайте.', 'ok')
    } catch (err) {
      setMsg(msg, err instanceof Error ? err.message : 'Не удалось сохранить.', 'error')
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
      editing.images.splice(i, 1)
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
    editing.download = ''
    delete editing.downloadName
    renderDownload()
    updateUI()
  })

  publishBtn.addEventListener('click', () => void publish())

  return {
    async load(): Promise<void> {
      setMsg(msg, 'Загружаю…', 'info')
      try {
        list = normalizeProducts(await get<unknown>('products', []))
        editing = null
        editor.hidden = true
        baseline = serialize()
        loaded = true
        setMsg(msg, '')
        renderList()
      } catch (err) {
        setMsg(msg, err instanceof Error ? err.message : 'Не удалось загрузить.', 'error')
      }
    },
    reset(): void {
      list = []
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
