import '../styles/sections.css'
import { initPage } from './page'
import { initShop } from '../modules/shop'

initPage('products')

const mount = document.querySelector<HTMLElement>('[data-shop]')
if (mount) initShop(mount)
