import '../styles/sections.css'
import { initPage } from './page'
import { initShop } from '../modules/shop'
import { content, loadContent } from '../data/content'

initPage('products')

const mount = document.querySelector<HTMLElement>('[data-shop]')
if (mount) {
  // paint from the bundled snapshot, then re-render if the database differs
  initShop(mount)
  const before = JSON.stringify(content().products)
  void loadContent().then(() => {
    if (JSON.stringify(content().products) !== before) initShop(mount)
  })
}
