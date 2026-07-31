// Contacts & Home panel — edits src/data/site.json (hero wordmark/slogan, every
// contact link, and the sponsor-strip on/off toggle). Form inputs carry a
// dotted `data-site` path (e.g. "contacts.instagram"); the panel reads/writes
// the loaded object by that path so adding a field is markup-only.

import { fetchTextFile, putTextFile } from './github'
import { afterPublish } from './deploy'
import type { AdminCtx, Panel } from './panel'

const PATH = 'src/data/site.json'

interface SiteContent {
  hero: { brand: string; slogan: string }
  contacts: Record<string, string>
  sponsors: { enabled: boolean }
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

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let node: Record<string, unknown> = obj
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i]
    if (typeof node[k] !== 'object' || node[k] === null) node[k] = {}
    node = node[k] as Record<string, unknown>
  }
  node[keys[keys.length - 1]] = value
}

export function createContactsPanel(ctx: AdminCtx): Panel {
  const form = $<HTMLFormElement>('#contacts-form')
  const publishBtn = $<HTMLButtonElement>('#contacts-publish')
  const msg = $('#contacts-msg')
  const note = $('#contacts-note')
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-site]'))

  let sha = ''
  let baseline = '' // compact JSON of the last loaded/published content
  let data: SiteContent | null = null
  let publishing = false

  function serialize(): string {
    return JSON.stringify(data)
  }

  function dirty(): boolean {
    return data !== null && serialize() !== baseline
  }

  function updateUI(): void {
    const isDirty = dirty()
    publishBtn.textContent = publishing ? 'Publishing…' : isDirty ? 'Publish changes' : 'Published'
    publishBtn.disabled = publishing || !isDirty || !ctx.valid()
    note.textContent = !data ? '' : isDirty ? 'Unpublished changes' : 'All changes published'
    note.classList.toggle('is-dirty', isDirty)
  }

  function fillForm(): void {
    for (const input of inputs) {
      const path = input.dataset.site as string
      const value = getPath(data, path)
      if (input instanceof HTMLInputElement && input.type === 'checkbox') {
        input.checked = value !== false
      } else {
        input.value = value == null ? '' : String(value)
      }
    }
  }

  function readInput(input: HTMLInputElement | HTMLTextAreaElement): void {
    if (!data) return
    const path = input.dataset.site as string
    if (input instanceof HTMLInputElement && input.type === 'checkbox') {
      setPath(data as unknown as Record<string, unknown>, path, input.checked)
    } else {
      setPath(data as unknown as Record<string, unknown>, path, input.value)
    }
    updateUI()
  }

  async function publish(): Promise<void> {
    if (publishing || !data || !dirty() || !ctx.valid()) return
    publishing = true
    updateUI()
    setMsg(msg, '')
    try {
      // trim text values on the way out (checkbox stays boolean)
      const clean = JSON.parse(serialize()) as SiteContent
      clean.hero.brand = clean.hero.brand.trim()
      clean.hero.slogan = clean.hero.slogan.trim()
      for (const k of Object.keys(clean.contacts)) clean.contacts[k] = clean.contacts[k].trim()
      const text = `${JSON.stringify(clean, null, 2)}\n`
      sha = await putTextFile(ctx.token(), PATH, text, sha, 'content: update site settings via admin')
      data = clean
      baseline = serialize()
      fillForm()
      setMsg(msg, 'Published — the site is rebuilding now.', 'ok')
      afterPublish()
    } catch (err) {
      setMsg(msg, err instanceof Error ? err.message : 'Could not publish — try again.', 'error')
    } finally {
      publishing = false
      updateUI()
    }
  }

  form.addEventListener('input', (e) => {
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) readInput(t)
  })
  form.addEventListener('change', (e) => {
    const t = e.target
    if (t instanceof HTMLInputElement && t.type === 'checkbox') readInput(t)
  })
  form.addEventListener('submit', (e) => e.preventDefault())
  publishBtn.addEventListener('click', () => void publish())

  return {
    async load(): Promise<void> {
      setMsg(msg, 'Loading…', 'info')
      try {
        const file = await fetchTextFile(ctx.token(), PATH)
        data = JSON.parse(file.text) as SiteContent
        sha = file.sha
        baseline = serialize()
        fillForm()
        setMsg(msg, '')
        updateUI()
      } catch (err) {
        setMsg(msg, err instanceof Error ? err.message : 'Could not load site settings.', 'error')
      }
    },
    reset(): void {
      data = null
      sha = ''
      baseline = ''
      for (const input of inputs) {
        if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = true
        else input.value = ''
      }
      setMsg(msg, '')
      updateUI()
    },
    isDirty: dirty,
  }
}
