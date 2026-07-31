// Shop products — read at build time from the editable manifest the admin commits
// (src/data/products.json). Prices in EUR. Cover art is a real uploaded image when
// present, otherwise a gradient generated from `hue` (no image file needed).

import productsJson from './products.json'

export interface Product {
  id: string
  title: string
  category: string
  price: number
  blurb: string
  features: string[]
  hue: number
  /** slideshow images (site-relative, e.g. ./shop/x.jpg); empty → gradient cover */
  images?: string[]
  /** downloadable deliverable (site-relative, e.g. ./downloads/x.zip); '' → none */
  download?: string
  /** original file name for the download button label */
  downloadName?: string
}

export const PRODUCTS: Product[] = (productsJson as { products: Product[] }).products
