// Sponsors panel. Logos upload straight to R2 the moment they are picked; the
// list itself is saved to the content API, so a change is live immediately.

import { get, save } from './store'
import { checkFile, uploadToR2 } from './r2upload'
import type { AdminCtx, Panel } from './panel'


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
  let publishing = false

  const serialize = (): string => JSON.stringify(list)
  const dirty = (): boolean => loaded && serialize() !== baseline

  function previewSrc(logo: string): string {
    return /^https?:\/\//.test(logo) ? logo : `./sponsors/${logo}`
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
    publishBtn.textContent = publishing ? 'Saving…' : isDirty ? 'Save' : 'Saved'
    publishBtn.disabled = publishing || !isDirty || !ctx.valid()
    note.textContent = isDirty ? 'Unsaved changes' : 'All changes saved'
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

  async function addSponsor(): Promise<void> {
    const name = nameInput.value.trim()
    const file = fileInput.files?.[0]
    if (!name) return setMsg(addMsg, 'Enter the sponsor name first.', 'error')
    if (!file) return setMsg(addMsg, 'Choose a logo file.', 'error')
    const bad = checkFile(file, 'image')
    if (bad) return setMsg(addMsg, bad, 'error')

    addBtn.disabled = true
    setMsg(addMsg, 'Uploading the logo…', 'info')
    try {
      const up = await uploadToR2(file, `${slugify(name) || 'sponsor'}.${file.name.split('.').pop()}`, 'image')
      list.push({ id: uniqueId(name), name, logo: up.url })
      nameInput.value = ''
      fileInput.value = ''
      setMsg(addMsg, '')
      render()
    } catch (err) {
      setMsg(addMsg, err instanceof Error ? err.message : 'Could not upload the logo.', 'error')
    } finally {
      addBtn.disabled = false
    }
  }

  async function replaceLogo(index: number, file: File): Promise<void> {
    const bad = checkFile(file, 'image')
    if (bad) return setMsg(msg, bad, 'error')
    const sponsor = list[index]
    setMsg(msg, 'Uploading the logo…', 'info')
    try {
      const up = await uploadToR2(file, `${slugify(sponsor.name) || sponsor.id}.${file.name.split('.').pop()}`, 'image')
      sponsor.logo = up.url
      setMsg(msg, '')
      render()
    } catch (err) {
      setMsg(msg, err instanceof Error ? err.message : 'Could not upload the logo.', 'error')
    }
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
      list.forEach((s) => (s.name = s.name.trim()))
      const snapshot = list.map((s) => ({ id: s.id, name: s.name, logo: s.logo }))
      await save('sponsors', snapshot)
      baseline = JSON.stringify(snapshot)
      render()
      setMsg(msg, 'Saved — already live on the site.', 'ok')
    } catch (err) {
      setMsg(msg, err instanceof Error ? err.message : 'Could not save.', 'error')
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
        list = await get<Sponsor[]>('sponsors', [])
        baseline = serialize()
        loaded = true
        setMsg(msg, '')
        render()
      } catch (err) {
        setMsg(msg, err instanceof Error ? err.message : 'Could not load.', 'error')
      }
    },
    reset(): void {
      list = []
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
