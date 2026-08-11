// Shop products — read through the live content store (src/data/content.ts),
// which starts from the bundled products.json and is refreshed from the database
// the admin writes to. Cover art is a real uploaded image when present,
// otherwise a gradient generated from `hue`.

import { content } from './content'
import type { Product } from './content'

export type { Product }

/** Current product list. Call it at render time so live updates are picked up. */
export const products = (): Product[] => content().products
