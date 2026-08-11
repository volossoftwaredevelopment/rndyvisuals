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
import { withLoading } from '../lib/loading'

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

/* ----------------------------------------------------------- local copy
 * Every page is a fresh document, so without this each navigation waits on
 * /api/content before anything dynamic can be drawn — the grid, the contact
 * buttons, the sponsor strip all arrive a beat late and the page visibly
 * settles. That beat is one network round trip; on a phone it is the whole
 * reason the site felt like it was jumping.
 *
 * So the last payload is kept in localStorage and applied before the first
 * paint. The fetch still happens, in the background, and if the owner has
 * changed something since the last visit the page is re-rendered then — every
 * render on the site rebuilds its container from scratch, so running one twice
 * is safe. First-ever visit has no copy and waits, exactly as before.        */

const CACHE_KEY = 'rndy.content.v1'

/** True once the content can be drawn with confidence (local copy or fetch done). */
export let shellKnown = false

/** Serialised form of whatever is on screen right now. */
let rendered = ''
/** Did the first paint come from the local copy rather than the network? */
let fromCache = false

const listeners = new Set<() => void>()

/** Re-run a render when a background refresh turns up different content. */
export function onContentUpdated(cb: () => void): void {
  listeners.add(cb)
}

const isArrayKey = (k: string): boolean => ['videos', 'sponsors', 'products', 'reviews'].includes(k)

/** Copy a payload into live state, ignoring anything of the wrong shape. */
function applyPayload(data: Partial<Record<string, unknown>>): void {
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue
    if (!(key in state)) continue
    if (isArrayKey(key) ? Array.isArray(value) : typeof value === 'object' && !Array.isArray(value)) {
      ;(state as unknown as Record<string, unknown>)[key] = value
    }
  }
}

function readCache(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    applyPayload(JSON.parse(raw) as Record<string, unknown>)
    rendered = raw
    fromCache = true
    shellKnown = true
  } catch {
    /* private mode or bad JSON — fall back to waiting for the fetch */
  }
}

function writeCache(raw: string): void {
  try {
    localStorage.setItem(CACHE_KEY, raw)
  } catch {
    /* quota or private mode — the site just loses the head start */
  }
}

readCache()

export function content(): SiteContent {
  return state
}

let inflight: Promise<SiteContent> | null = null

/**
 * Live content, shared by every caller on the page.
 *
 * With a local copy this resolves immediately and the network check runs behind
 * it; without one it waits, because painting the bundled snapshot first made
 * deleted items visibly reappear (that snapshot is frozen at build time).
 */
export function contentReady(timeoutMs = 2500): Promise<SiteContent> {
  if (fromCache) {
    inflight ??= loadContent(timeoutMs)
    return Promise.resolve(state)
  }
  inflight ??= withLoading(loadContent(timeoutMs))
  return inflight
}

/**
 * Pull live content from the API. Resolves either way — a failure just leaves
 * whatever is already on screen, so the site never renders empty.
 */
export async function loadContent(timeoutMs = 2500): Promise<SiteContent> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch('/api/content', { signal: ctrl.signal, credentials: 'omit' })
    clearTimeout(t)
    if (!res.ok) return state
    const data = (await res.json()) as Partial<Record<keyof SiteContent, unknown>>
    applyPayload(data as Record<string, unknown>)
    shellKnown = true

    const raw = JSON.stringify(data)
    const changed = raw !== rendered
    rendered = raw
    writeCache(raw)
    // Only when the owner actually changed something since the last visit.
    if (changed && fromCache) for (const cb of listeners) cb()
  } catch {
    /* offline / API down / aborted — keep what is on screen */
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
