// "Home & contacts" panel — edits the hero wordmark/slogan, every contact link
// and the sponsor-strip toggle. Reads and writes the content API (Neon), so a
// save is live on the site immediately.

import { get, save } from './store'
import type { AdminCtx, Panel } from './panel'

interface Hero {
  brand: string
  slogan: string
}
type Contacts = Record<string, string>
interface Settings {
  sponsorsEnabled: boolean
}

interface Model {
  hero: Hero
  contacts: Contacts
  settings: Settings
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

  let baseline = ''
  let loaded = false
  let data: Model | null = null
  let saving = false

  const serialize = (): string => JSON.stringify(data)
  const dirty = (): boolean => loaded && data !== null && serialize() !== baseline

  function updateUI(): void {
    const isDirty = dirty()
    publishBtn.textContent = saving ? 'Saving…' : isDirty ? 'Save' : 'Saved'
    publishBtn.disabled = saving || !isDirty || !ctx.valid()
    note.textContent = !loaded ? '' : isDirty ? 'Unsaved changes' : 'All changes saved'
    note.classList.toggle('is-dirty', isDirty)
  }

  function fillForm(): void {
    for (const input of inputs) {
      const path = input.dataset.site as string
      const value = getPath(data, path)
      if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = value !== false
      else input.value = value == null ? '' : String(value)
    }
  }

  function readInput(input: HTMLInputElement | HTMLTextAreaElement): void {
    if (!data) return
    const path = input.dataset.site as string
    const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value
    setPath(data as unknown as Record<string, unknown>, path, value)
    updateUI()
  }

  async function publish(): Promise<void> {
    if (saving || !data || !dirty() || !ctx.valid()) return
    saving = true
    updateUI()
    setMsg(msg, '')
    try {
      const clean: Model = JSON.parse(serialize())
      clean.hero.brand = String(clean.hero.brand ?? '').trim()
      clean.hero.slogan = String(clean.hero.slogan ?? '').trim()
      for (const k of Object.keys(clean.contacts)) clean.contacts[k] = String(clean.contacts[k] ?? '').trim()
      clean.settings.sponsorsEnabled = clean.settings.sponsorsEnabled !== false

      await save('hero', clean.hero)
      await save('contacts', clean.contacts)
      await save('settings', clean.settings)

      data = clean
      baseline = serialize()
      fillForm()
      setMsg(msg, 'Saved — already live on the site.', 'ok')
    } catch (err) {
      setMsg(msg, err instanceof Error ? err.message : 'Could not save.', 'error')
    } finally {
      saving = false
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
        data = {
          hero: await get<Hero>('hero', { brand: '', slogan: '' }),
          contacts: await get<Contacts>('contacts', {}),
          settings: await get<Settings>('settings', { sponsorsEnabled: true }),
        }
        baseline = serialize()
        loaded = true
        fillForm()
        setMsg(msg, '')
        updateUI()
      } catch (err) {
        setMsg(msg, err instanceof Error ? err.message : 'Could not load.', 'error')
      }
    },
    reset(): void {
      data = null
      baseline = ''
      loaded = false
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
