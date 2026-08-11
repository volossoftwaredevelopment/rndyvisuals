import { CONTACTS, loadContent } from '../data/content'
import { iconLabel } from '../lib/icons'
import type { IconName } from '../lib/icons'
import { initPage } from './page'

// render the contact + social buttons from the live content store
const mount = document.querySelector<HTMLElement>('[data-contact]')

function render(): void {
  if (!mount) return
  {
  const nt = '<span class="sr-only"> (opens in a new tab)</span>'
  interface Item {
    icon: IconName
    label: string
    href: string
    ext: boolean
  }
  const groups: { h: string; items: Item[] }[] = [
    {
      h: 'Contact',
      items: [
        { icon: 'whatsapp', label: `WhatsApp ${CONTACTS().whatsappLabel}`, href: CONTACTS().whatsapp, ext: true },
        { icon: 'telegram', label: 'Telegram', href: CONTACTS().telegram, ext: true },
        { icon: 'email', label: CONTACTS().email, href: `mailto:${CONTACTS().email}`, ext: false },
      ],
    },
    {
      h: 'Social',
      items: [
        { icon: 'instagram', label: 'Instagram', href: CONTACTS().instagram, ext: true },
        { icon: 'youtube', label: 'YouTube', href: CONTACTS().youtube, ext: true },
        { icon: 'linkedin', label: 'LinkedIn', href: CONTACTS().linkedin, ext: true },
        { icon: 'x', label: 'X', href: CONTACTS().x, ext: true },
      ],
    },
  ]
  mount.innerHTML = groups
    .map(
      (g) => `
      <div class="contact-group" data-reveal="fade-up">
        <h2 class="contact-group__h micro">${g.h}</h2>
        <div class="contact-links">
          ${g.items
            .map(
              (i) =>
                `<a class="btn btn--lg" href="${i.href}"${i.ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${iconLabel(i.icon, i.label)}${i.ext ? nt : ''}</a>`,
            )
            .join('')}
        </div>
      </div>`,
    )
    .join('')
  }
}

render()

// refresh once live content arrives (contacts may have been edited in the admin)
const before = JSON.stringify(CONTACTS())
void loadContent().then(() => {
  if (JSON.stringify(CONTACTS()) !== before) render()
})

initPage('contact')
