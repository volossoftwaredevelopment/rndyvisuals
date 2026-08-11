// A page whose section is switched off in the admin should not sit there empty —
// it explains itself and points back home, and stays out of search results.

export function renderSectionOff(mount: HTMLElement, title: string): void {
  document.querySelector('meta[name="robots"]')?.remove()
  const meta = document.createElement('meta')
  meta.name = 'robots'
  meta.content = 'noindex,nofollow'
  document.head.appendChild(meta)

  // The section mount (e.g. [data-shop]) is a sibling of .page__inner, not a
  // child — so replace the intro block and drop the mount, otherwise the
  // original headline would sit above the notice.
  mount.remove()

  const inner = document.querySelector<HTMLElement>('.page__inner')
  if (!inner) return
  inner.innerHTML = `
    <p class="eyebrow micro page__eyebrow">${title}</p>
    <h1 class="page__title display">Coming soon.</h1>
    <p class="page__lede">This section isn’t published yet. Everything else is over on the home page.</p>
    <p class="page__body"><a class="btn btn--lg" href="./">← Back to the films</a></p>`
}
