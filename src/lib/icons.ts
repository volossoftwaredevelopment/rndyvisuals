// Monochrome inline SVG icons (currentColor). Used in the header/footer and
// contact page for social + contact links.

export type IconName = 'instagram' | 'youtube' | 'whatsapp' | 'telegram' | 'email'

export const ICONS: Record<IconName, string> = {
  instagram:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/></svg>',
  youtube:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.3 9.2l5 2.8-5 2.8z" fill="currentColor" stroke="none"/></svg>',
  whatsapp:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 1 1-4.3 15.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.2 8.2 0 0 1 12 3.8Zm-2.8 4c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.3s1 2.6 1.1 2.8c.2.2 2 3.1 4.9 4.2 2.4 1 2.9.8 3.4.7.5 0 1.6-.6 1.8-1.3.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.3l-1.7-.8c-.2-.1-.4-.1-.6.1l-.8 1c-.1.1-.3.2-.5.1-.7-.3-1.6-.6-2.4-1.5-.6-.6-1-1.4-1.1-1.6-.1-.2 0-.4.1-.5l.5-.5c.1-.2.2-.3.3-.5 0-.2 0-.3 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4Z"/></svg>',
  telegram:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M21.9 4.4 18.8 19c-.2 1-.8 1.2-1.7.8l-4.5-3.3-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7L18.4 6c.4-.3-.1-.5-.6-.2L7.5 12.7l-4.4-1.4c-1-.3-1-1 .2-1.4l17.2-6.6c.8-.3 1.5.2 1.4 1Z"/></svg>',
  email:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7.5 12 13l8-5.5"/></svg>',
}

/** icon + label markup for a link's inner content */
export function iconLabel(name: IconName, label: string): string {
  return `<span class="ico" aria-hidden="true">${ICONS[name]}</span><span>${label}</span>`
}
