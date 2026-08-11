import { CONTACTS, contentReady, onContentUpdated } from '../data/content'
import { iconLabel } from '../lib/icons'
import type { IconName } from '../lib/icons'
import { esc } from '../lib/esc'
import { initPage } from './page'

const mount = document.querySelector<HTMLElement>('[data-contact]')

interface Item {
  icon: IconName
  label: string
  href: string
  ext: boolean
}

const nt = '<span class="sr-only"> (opens in a new tab)</span>'

/** Render the contact buttons — only the ones that actually have an address. */
function render(): void {
  if (!mount) return
  const c = CONTACTS()
  const has = (v: string | undefined): string => String(v ?? '').trim()

  const item = (icon: IconName, label: string, href: string, ext = true): Item | null =>
    href ? { icon, label, href, ext } : null

  const groups: { h: string; items: Item[] }[] = [
    {
      h: 'Contact',
      items: [
        item('whatsapp', `WhatsApp ${has(c.whatsappLabel)}`.trim(), has(c.whatsapp)),
        item('telegram', 'Telegram', has(c.telegram)),
        has(c.email) ? { icon: 'email', label: has(c.email), href: `mailto:${has(c.email)}`, ext: false } : null,
      ].filter(Boolean) as Item[],
    },
    {
      h: 'Social',
      items: [
        item('instagram', 'Instagram', has(c.instagram)),
        item('youtube', 'YouTube', has(c.youtube)),
        item('linkedin', 'LinkedIn', has(c.linkedin)),
        item('x', 'X', has(c.x)),
      ].filter(Boolean) as Item[],
    },
  ].filter((g) => g.items.length > 0) // a group with nothing in it is dropped

  if (groups.length === 0) {
    mount.innerHTML = '<p class="page__body" data-reveal="fade-up">Contact details are on their way.</p>'
    return
  }

  mount.innerHTML = groups
    .map(
      (g) => `
      <div class="contact-group" data-reveal="fade-up">
        <h2 class="contact-group__h micro">${g.h}</h2>
        <div class="contact-links">
          ${g.items
            .map(
              (i) =>
                `<a class="btn btn--lg" href="${esc(i.href)}"${i.ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${iconLabel(i.icon, esc(i.label))}${i.ext ? nt : ''}</a>`,
            )
            .join('')}
        </div>
      </div>`,
    )
    .join('')
}

// render from the local copy at once; redraw if the live check differs
void contentReady().then(render)
onContentUpdated(render)

initPage('contact')
