import '../styles/sections.css'
import { initPage } from './page'
import { initReviews } from '../modules/reviews'

initPage('kind-words')

const mount = document.querySelector<HTMLElement>('[data-reviews]')
if (mount) initReviews(mount)
