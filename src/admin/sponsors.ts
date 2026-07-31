// Sponsors panel — edits src/data/sponsors.json plus the logo files in
// public/sponsors/. Newly picked logos are staged in memory (data-URL preview)
// and, on publish, committed together with the manifest in ONE commit via the
// Git Data API, so a sponsor change triggers a single site build.

import { commitFiles, fetchTextFile } from './github'
import type { CommitFile } from './github'
import { afterPublish } from './deploy'
import type { AdminCtx, Panel } from './panel'

const MANIFEST = 'src/data/sponsors.json'
const LOGO_DIR = 'public/sponsors'
const MAX_BYTES = 800 * 1024
const OK_EXT = new Set(['png', 'svg', 'jpg', 'jpeg', 'webp'])

interface Sponsor {
  id: string
  name: string
  logo: string
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

function extOf(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (OK_EXT.has(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName
  if (file.type === 'image/svg+xml') return 'svg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/jpeg') return 'jpg'
  return ''
}

function mimeOf(ext: string): string {
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'jpg') return 'image/jpeg'
  return `image/${ext}`
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

interface StagedLogo {
  base64: string
  dataUrl: string
}

export function createSponsorsPanel(ctx: AdminCtx): Panel {
  const rowsEl = $<HTMLOListElement>('#sponsor-rows')
  const nameInput = $<HTMLInputElement>('#sponsor-add-name')
  const fileInput = $<HTMLInputElement>('#sponsor-add-file')
  const addBtn = $<HTMLButtonElement>('#sponsor-add-btn')
  const addMsg = $('#sponsor-add-msg')
  const publishBtn = $<HTMLButtonElement>('#sponsors-publish')
  const msg = $('#sponsors-msg')
  const note = $('#sponsors-note')

  let baseline = ''
  let loaded = false // guard: a pristine, never-loaded panel must not report dirty
  let list: Sponsor[] = []
  // staged logo bytes keyed by their target filename (only new/replaced files)
  const staged = new Map<string, StagedLogo>()
  let publishing = false

  const serialize = (): string => JSON.stringify(list)
  const dirty = (): boolean => loaded && (serialize() !== baseline || staged.size > 0)

  function previewSrc(logo: string): string {
    return staged.get(logo)?.dataUrl ?? `./sponsors/${logo}`
  }

  function usedLogoNames(): Set<string> {
    const set = new Set<string>(staged.keys())
    for (const s of list) set.add(s.logo)
    return set
  }

  function uniqueLogo(name: string, ext: string): string {
    const base = slugify(name) || 'logo'
    const used = usedLogoNames()
    let candidate = `${base}.${ext}`
    let n = 2
    while (used.has(candidate)) {
      candidate = `${base}-${n}.${ext}`
      n += 1
    }
    return candidate
  }

  function uniqueId(name: string): string {
    const base = slugify(name) || 'sponsor'
    const taken = new Set(list.map((s) => s.id))
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

  function buildRow(sponsor: Sponsor, index: number): HTMLLIElement {
    const li = document.createElement('li')
    li.className = 'sponsor-row'
    li.dataset.id = sponsor.id
    li.innerHTML = `
      <span class="sponsor-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
      <span class="sponsor-thumb"><img alt="" /></span>
      <input class="field sponsor-name" data-field="name" placeholder="Sponsor name" spellcheck="false" aria-label="Sponsor name" />
      <label class="btn btn--ghost btn--sm sponsor-replace">
        Replace logo
        <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" hidden data-act="replace" />
      </label>
      <span class="sponsor-move">
        <button type="button" data-act="up" title="Move up" aria-label="Move up">▲</button>
        <button type="button" data-act="down" title="Move down" aria-label="Move down">▼</button>
      </span>
      <button class="x" type="button" data-act="delete" title="Delete" aria-label="Delete">×</button>`
    li.querySelector<HTMLImageElement>('.sponsor-thumb img')!.src = previewSrc(sponsor.logo)
    li.querySelector<HTMLInputElement>('[data-field="name"]')!.value = sponsor.name
    li.querySelector<HTMLButtonElement>('[data-act="up"]')!.disabled = index === 0
    li.querySelector<HTMLButtonElement>('[data-act="down"]')!.disabled = index === list.length - 1
    return li
  }

  function render(): void {
    rowsEl.textContent = ''
    if (list.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'rows-empty'
      empty.textContent = 'No sponsors yet — add one below, or leave it empty to show a slim divider on the site.'
      rowsEl.append(empty)
    } else {
      list.forEach((s, i) => rowsEl.append(buildRow(s, i)))
    }
    updateUI()
  }

  async function readFile(file: File): Promise<{ ext: string; staged: StagedLogo } | string> {
    const ext = extOf(file)
    if (!ext || !OK_EXT.has(ext)) return 'Use a PNG, SVG, JPG or WebP image.'
    if (file.size > MAX_BYTES) return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — keep logos under 800 KB.`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const base64 = bytesToBase64(bytes)
    return { ext, staged: { base64, dataUrl: `data:${mimeOf(ext)};base64,${base64}` } }
  }

  async function addSponsor(): Promise<void> {
    const name = nameInput.value.trim()
    const file = fileInput.files?.[0]
    if (!name) {
      setMsg(addMsg, 'Type the sponsor name first.', 'error')
      return
    }
    if (!file) {
      setMsg(addMsg, 'Choose a logo image to upload.', 'error')
      return
    }
    const result = await readFile(file)
    if (typeof result === 'string') {
      setMsg(addMsg, result, 'error')
      return
    }
    const logo = uniqueLogo(name, result.ext)
    staged.set(logo, result.staged)
    list.push({ id: uniqueId(name), name, logo })
    nameInput.value = ''
    fileInput.value = ''
    setMsg(addMsg, '')
    render()
  }

  async function replaceLogo(index: number, file: File): Promise<void> {
    const result = await readFile(file)
    if (typeof result === 'string') {
      setMsg(msg, result, 'error')
      return
    }
    const sponsor = list[index]
    // drop a previously-staged file for this row that we're now superseding
    if (staged.has(sponsor.logo)) staged.delete(sponsor.logo)
    const logo = uniqueLogo(sponsor.name, result.ext)
    sponsor.logo = logo
    staged.set(logo, result.staged)
    setMsg(msg, '')
    render()
  }

  function move(from: number, to: number): void {
    const item = list.splice(from, 1)[0]
    list.splice(to, 0, item)
    render()
  }

  async function publish(): Promise<void> {
    if (publishing || !dirty() || !ctx.valid()) return
    publishing = true
    updateUI()
    setMsg(msg, '')
    try {
      // normalise names in place, then snapshot at click time (edits made while
      // the commit is in flight stay in `list` and remain publishable).
      list.forEach((s) => (s.name = s.name.trim()))
      const snapshot = list.map((s) => ({ id: s.id, name: s.name, logo: s.logo }))

      // Drift guard: refuse if sponsors.json changed on GitHub since we loaded
      // it, so a concurrent publish (another tab/device) is not silently reverted.
      const remote = await fetchTextFile(ctx.token(), MANIFEST)
      let remoteSponsors: unknown = null
      try {
        remoteSponsors = (JSON.parse(remote.text) as { sponsors?: unknown }).sponsors
      } catch {
        /* unparseable remote — treat as drift below */
      }
      if (JSON.stringify(remoteSponsors) !== JSON.stringify(JSON.parse(baseline))) {
        throw new Error('The sponsors changed on GitHub in another session — reload the page and re-apply your changes.')
      }

      const files: CommitFile[] = [
        {
          path: MANIFEST,
          content: `${JSON.stringify({ sponsors: snapshot }, null, 2)}\n`,
          encoding: 'utf-8',
        },
      ]
      // only commit logos still referenced by a surviving sponsor
      const referenced = new Set(snapshot.map((s) => s.logo))
      const committed = new Set<string>()
      for (const [logo, data] of staged) {
        if (referenced.has(logo)) {
          files.push({ path: `${LOGO_DIR}/${logo}`, content: data.base64, encoding: 'base64' })
          committed.add(logo)
        }
      }
      await commitFiles(ctx.token(), files, 'content: update sponsors via admin')
      baseline = JSON.stringify(snapshot)
      // drop committed + orphaned staged logos; keep any staged mid-publish
      const live = new Set(list.map((s) => s.logo))
      for (const logo of [...staged.keys()]) {
        if (committed.has(logo) || !live.has(logo)) staged.delete(logo)
      }
      render()
      setMsg(msg, 'Published — the site is rebuilding now.', 'ok')
      afterPublish()
    } catch (err) {
      setMsg(msg, err instanceof Error ? err.message : 'Could not publish — try again.', 'error')
    } finally {
      publishing = false
      updateUI()
    }
  }

  rowsEl.addEventListener('input', (e) => {
    const input = e.target
    if (!(input instanceof HTMLInputElement) || input.dataset.field !== 'name') return
    const id = input.closest<HTMLElement>('.sponsor-row')?.dataset.id
    const sponsor = list.find((s) => s.id === id)
    if (sponsor) {
      sponsor.name = input.value
      updateUI()
    }
  })

  rowsEl.addEventListener('change', (e) => {
    const input = e.target
    if (!(input instanceof HTMLInputElement) || input.dataset.act !== 'replace') return
    const id = input.closest<HTMLElement>('.sponsor-row')?.dataset.id
    const index = list.findIndex((s) => s.id === id)
    const file = input.files?.[0]
    if (index >= 0 && file) void replaceLogo(index, file)
  })

  rowsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]')
    if (!btn) return
    const id = btn.closest<HTMLElement>('.sponsor-row')?.dataset.id
    const index = list.findIndex((s) => s.id === id)
    if (index < 0) return
    const act = btn.dataset.act
    if (act === 'delete') {
      const sponsor = list[index]
      if (window.confirm(`Remove “${sponsor.name || sponsor.id}” from the sponsor strip?`)) {
        if (staged.has(sponsor.logo)) staged.delete(sponsor.logo)
        list.splice(index, 1)
        render()
      }
    } else if (act === 'up' && index > 0) {
      move(index, index - 1)
    } else if (act === 'down' && index < list.length - 1) {
      move(index, index + 1)
    }
  })

  addBtn.addEventListener('click', () => void addSponsor())
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void addSponsor()
    }
  })
  publishBtn.addEventListener('click', () => void publish())

  return {
    async load(): Promise<void> {
      setMsg(msg, 'Loading…', 'info')
      try {
        const file = await fetchTextFile(ctx.token(), MANIFEST)
        const parsed = JSON.parse(file.text) as { sponsors?: Sponsor[] }
        list = Array.isArray(parsed.sponsors) ? parsed.sponsors : []
        staged.clear()
        baseline = serialize()
        loaded = true
        setMsg(msg, '')
        render()
      } catch (err) {
        setMsg(msg, err instanceof Error ? err.message : 'Could not load sponsors.', 'error')
      }
    },
    reset(): void {
      list = []
      staged.clear()
      baseline = ''
      loaded = false
      rowsEl.textContent = ''
      setMsg(msg, '')
      setMsg(addMsg, '')
      updateUI()
    },
    isDirty: dirty,
  }
}
