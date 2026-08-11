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
  /** Background film on the home page (the first thing a visitor sees). */
  video?: string
  poster?: string
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
  /** Show the Products page + its nav link. */
  productsEnabled: boolean
  /** Show the Kind Words (testimonials) page + its nav link. */
  reviewsEnabled: boolean
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
  settings: { sponsorsEnabled: bundledSite.sponsors?.enabled !== false, productsEnabled: true, reviewsEnabled: true },
}

/* ------------------------------------------------------------- shell cache
 * The header nav and footer are structural: rebuilding them after the fetch
 * makes the whole page jump, and for a moment shows sections that are switched
 * off. Both depend only on `settings` + `contacts`, which are small and change
 * rarely — so the last known copy is kept in localStorage and applied before
 * first paint. Films and the rest still wait for the live fetch.                */

const SHELL_CACHE = 'rndy.shell.v1'

/** True once the shell can be drawn with confidence (cache hit or fetch done). */
export let shellKnown = false

function readShellCache(): void {
  try {
    const raw = localStorage.getItem(SHELL_CACHE)
    if (!raw) return
    const cached = JSON.parse(raw) as Partial<Pick<SiteContent, 'settings' | 'contacts'>>
    if (cached.settings && typeof cached.settings === 'object') {
      state.settings = { ...state.settings, ...cached.settings }
    }
    if (cached.contacts && typeof cached.contacts === 'object') state.contacts = cached.contacts as Contacts
    shellKnown = true
  } catch {
    /* private mode or bad JSON — fall back to waiting for the fetch */
  }
}

function writeShellCache(): void {
  try {
    localStorage.setItem(SHELL_CACHE, JSON.stringify({ settings: state.settings, contacts: state.contacts }))
  } catch {
    /* ignore */
  }
}

readShellCache()

export function content(): SiteContent {
  return state
}

const isArrayKey = (k: string): boolean => ['videos', 'sponsors', 'products', 'reviews'].includes(k)

let inflight: Promise<SiteContent> | null = null

/**
 * Live content, fetched once per page and shared by every caller.
 *
 * Callers must await this BEFORE their first render. The bundled snapshot above
 * is a failure fallback only — painting it first and correcting afterwards made
 * deleted items visibly reappear, because the bundle is frozen at build time.
 */
export function contentReady(timeoutMs = 2500): Promise<SiteContent> {
  inflight ??= loadContent(timeoutMs)
  return inflight
}

/**
 * Pull live content from the API. Resolves either way — a failure just leaves
 * the bundled fallback in place, so the site never renders empty.
 */
export async function loadContent(timeoutMs = 2500): Promise<SiteContent> {
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
    shellKnown = true
    writeShellCache()
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
export const PRODUCTS_ENABLED = (): boolean => state.settings.productsEnabled !== false
export const REVIEWS_ENABLED = (): boolean => state.settings.reviewsEnabled !== false
