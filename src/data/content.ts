// Editable site content — read at build time from the JSON manifests the admin
// commits. Changing these on GitHub (via the admin) + a rebuild updates the site.

import siteJson from './site.json'
import sponsorsJson from './sponsors.json'

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
  /** filename inside public/sponsors/ */
  logo: string
}

interface SiteContent {
  hero: Hero
  contacts: Contacts
  sponsors: { enabled: boolean }
}

const site = siteJson as SiteContent

export const HERO: Hero = site.hero
export const CONTACTS: Contacts = site.contacts
export const SPONSORS_ENABLED: boolean = site.sponsors.enabled !== false
export const SPONSORS: Sponsor[] = (sponsorsJson as { sponsors: Sponsor[] }).sponsors
