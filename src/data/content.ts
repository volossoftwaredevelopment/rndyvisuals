// Single source of site content.
//
// The bundled JSON below is the *fallback*: it renders instantly on first paint
// and keeps the site working if the API is unreachable. `loadContent()` then
// fetches the live version from /api/content (which reads the Neon database the
// admin writes to), so an edit in the admin shows up without any rebuild.

import siteJson from './site.json'
import sponsorsJson from './sponsors.json'
import videosJson from './videos.json'
import productsJson from './products.json'
import { REVIEWS as bundledReviews } from './reviews'
import type { Review } from './reviews'
import type { VideoEntry } from '../types'

export interface Contacts {
  instagram: string
  youtube: string
  whatsapp: string
  whatsappLabel: string
  telegram: string
  linkedin: string
  x: string
  email: string
}

export interface Hero {
  brand: string
  slogan: string
}

export interface Sponsor {
  id: string
  name: string
  /** filename inside public/sponsors/, or a full https URL for uploads */
  logo: string
}

export interface Product {
  id: string
  title: string
  category: string
  price: number
  blurb: string
  features: string[]
  hue: number
  images?: string[]
  download?: string
  downloadName?: string
}

export interface Settings {
  sponsorsEnabled: boolean
}

export interface SiteContent {
  videos: VideoEntry[]
  sponsors: Sponsor[]
  products: Product[]
  reviews: Review[]
  hero: Hero
  contacts: Contacts
  settings: Settings
}

const bundledSite = siteJson as { hero: Hero; contacts: Contacts; sponsors: { enabled: boolean } }

/** Live content — starts as the bundled snapshot, replaced by loadContent(). */
const state: SiteContent = {
  videos: (videosJson as { videos: VideoEntry[] }).videos,
  sponsors: (sponsorsJson as { sponsors: Sponsor[] }).sponsors,
  products: (productsJson as { products: Product[] }).products,
  reviews: bundledReviews,
  hero: bundledSite.hero,
  contacts: bundledSite.contacts,
  settings: { sponsorsEnabled: bundledSite.sponsors?.enabled !== false },
}

export function content(): SiteContent {
  return state
}

const isArrayKey = (k: string): boolean => ['videos', 'sponsors', 'products', 'reviews'].includes(k)

/**
 * Pull live content from the API. Resolves either way — a failure just leaves
 * the bundled fallback in place, so the site never renders empty.
 */
export async function loadContent(timeoutMs = 4000): Promise<SiteContent> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch('/api/content', { signal: ctrl.signal, credentials: 'omit' })
    clearTimeout(t)
    if (!res.ok) return state
    const data = (await res.json()) as Partial<Record<keyof SiteContent, unknown>>
    for (const [key, value] of Object.entries(data)) {
      if (value == null) continue
      const k = key as keyof SiteContent
      if (!(k in state)) continue
      if (isArrayKey(key) ? Array.isArray(value) : typeof value === 'object' && !Array.isArray(value)) {
        ;(state as unknown as Record<string, unknown>)[key] = value
      }
    }
  } catch {
    /* offline / API down / aborted — keep the bundled content */
  }
  return state
}

/* Convenience accessors used across the site. Prefer content() in new code —
   these read through to the live state so they stay correct after loadContent. */
export const HERO = (): Hero => state.hero
export const CONTACTS = (): Contacts => state.contacts
export const SPONSORS = (): Sponsor[] => state.sponsors
export const SPONSORS_ENABLED = (): boolean => state.settings.sponsorsEnabled !== false
