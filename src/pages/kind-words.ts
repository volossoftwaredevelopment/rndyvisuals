import '../styles/sections.css'
import { initPage } from './page'
import { initReviews } from '../modules/reviews'
import { content, loadContent } from '../data/content'

initPage('kind-words')

const mount = document.querySelector<HTMLElement>('[data-reviews]')
if (mount) {
  // paint from the bundled snapshot, then re-render if the database differs
  initReviews(mount)
  const before = JSON.stringify(content().reviews)
  void loadContent().then(() => {
    if (JSON.stringify(content().reviews) !== before) initReviews(mount)
  })
}
