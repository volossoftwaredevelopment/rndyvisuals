import '../styles/sections.css'
import { initPage } from './page'
import { initReviews } from '../modules/reviews'
import { REVIEWS_ENABLED, contentReady } from '../data/content'
import { renderSectionOff } from './section-off'

initPage('kind-words')

const mount = document.querySelector<HTMLElement>('[data-reviews]')
// Render once the live list is in, so a deleted testimonial never flashes back —
// and show a friendly notice if the section is switched off in the admin.
if (mount) {
  void contentReady().then(() => {
    if (!REVIEWS_ENABLED()) renderSectionOff(mount, 'Kind Words')
    else initReviews(mount)
  })
}
