import '../styles/sections.css'
import { initPage } from './page'
import { initShop } from '../modules/shop'
import { PRODUCTS_ENABLED, contentReady } from '../data/content'
import { renderSectionOff } from './section-off'

initPage('products')

const mount = document.querySelector<HTMLElement>('[data-shop]')
// Render once the live list is in, so a deleted product never flashes back —
// and show a friendly notice if the shop is switched off in the admin.
if (mount) {
  void contentReady().then(() => {
    if (!PRODUCTS_ENABLED()) renderSectionOff(mount, 'Products')
    else initShop(mount)
  })
}
