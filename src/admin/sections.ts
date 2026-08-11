// Section switches — the always-visible ON/OFF buttons at the top of the admin.
//
// These used to be checkboxes buried inside the "Text & contacts" tab, which
// made them impossible to find. Each button now shows its own state and saves
// the moment it is pressed, so there is nothing else to remember.

import { get, save } from './store'

export interface Settings {
  sponsorsEnabled: boolean
  productsEnabled: boolean
  reviewsEnabled: boolean
}

type Key = keyof Settings

const DEFAULTS: Settings = { sponsorsEnabled: true, productsEnabled: true, reviewsEnabled: true }

const COPY: Record<Key, { title: string; on: string; off: string }> = {
  sponsorsEnabled: {
    title: 'Sponsor strip',
    on: 'Logo strip shows on the home page',
    off: 'Home page shows a slim divider instead',
  },
  productsEnabled: {
    title: 'Products page',
    on: 'Shop is open, link is in the menu',
    off: 'Hidden from the menu, page says “coming soon”',
  },
  reviewsEnabled: {
    title: 'Kind Words page',
    on: 'Testimonials are live, link is in the menu',
    off: 'Hidden from the menu, page says “coming soon”',
  },
}

export interface SectionsApi {
  load(): Promise<void>
  /** Latest known settings (used by other panels so they can't drift). */
  current(): Settings
}

export function createSections(onChange?: (s: Settings) => void): SectionsApi {
  const mount = document.querySelector<HTMLElement>('#section-switches')
  const msg = document.querySelector<HTMLElement>('#sections-msg')
  let settings: Settings = { ...DEFAULTS }
  let busy: Key | null = null

  function say(text: string, kind: 'error' | 'ok' | 'info' = 'info'): void {
    if (!msg) return
    msg.textContent = text
    msg.hidden = text === ''
    msg.classList.remove('msg--error', 'msg--ok', 'msg--info')
    if (text) msg.classList.add(`msg--${kind}`)
  }

  function paint(): void {
    if (!mount) return
    mount.textContent = ''
    ;(Object.keys(COPY) as Key[]).forEach((key) => {
      const on = settings[key] !== false
      const copy = COPY[key]
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `switch${on ? ' is-on' : ''}`
      btn.dataset.key = key
      btn.setAttribute('aria-pressed', String(on))
      btn.disabled = busy === key
      btn.innerHTML = `
        <span class="switch__track" aria-hidden="true"><span class="switch__knob"></span></span>
        <span class="switch__text">
          <span class="switch__title">${copy.title}</span>
          <span class="switch__hint">${busy === key ? 'Saving…' : on ? copy.on : copy.off}</span>
        </span>
        <span class="switch__state">${on ? 'ON' : 'OFF'}</span>`
      mount.appendChild(btn)
    })
  }

  async function toggle(key: Key): Promise<void> {
    if (busy) return
    busy = key
    paint()
    const next: Settings = { ...settings, [key]: settings[key] === false }
    try {
      await save('settings', next)
      settings = next
      say(`${COPY[key].title} is now ${next[key] ? 'ON' : 'OFF'} — the site is updated.`, 'ok')
      onChange?.(settings)
    } catch (err) {
      say(err instanceof Error ? err.message : 'Could not save.', 'error')
    } finally {
      busy = null
      paint()
    }
  }

  mount?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.switch')
    if (btn?.dataset.key) void toggle(btn.dataset.key as Key)
  })

  return {
    async load(): Promise<void> {
      try {
        settings = { ...DEFAULTS, ...(await get<Partial<Settings>>('settings', {})) }
        paint()
        onChange?.(settings)
      } catch {
        paint()
      }
    },
    current: () => settings,
  }
}
