// Admin ↔ content API. Replaces the old "commit JSON to GitHub with a personal
// access token" flow — the owner just edits and saves, and the change is live
// immediately (no token, no rebuild).

export type ContentKey = 'videos' | 'sponsors' | 'products' | 'reviews' | 'hero' | 'contacts' | 'settings'

export type ContentMap = Partial<Record<ContentKey, unknown>>

let cache: ContentMap | null = null

async function readError(res: Response, fallback: string): Promise<string> {
  const d = (await res.json().catch(() => ({}))) as { error?: string }
  if (res.status === 401) return 'Your session expired — please sign in again.'
  return d.error || fallback
}

/** Fetch every content section at once (cached for the session). */
export async function fetchAll(force = false): Promise<ContentMap> {
  if (cache && !force) return cache
  const res = await fetch('/api/content', { cache: 'no-store' })
  if (!res.ok) throw new Error(await readError(res, 'Could not load the content.'))
  cache = (await res.json()) as ContentMap
  return cache
}

/** Read one section; throws a readable error if the API is unavailable. */
export async function get<T>(key: ContentKey, fallback: T): Promise<T> {
  const all = await fetchAll()
  const value = all[key]
  return (value === undefined || value === null ? fallback : value) as T
}

/** Save one section. Live on the site as soon as this resolves. */
export async function save(key: ContentKey, value: unknown): Promise<void> {
  const res = await fetch('/api/content', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
  if (!res.ok) throw new Error(await readError(res, 'Could not save.'))
  if (cache) cache[key] = value
}

/** Drop the cached copy (used on logout). */
export function clearCache(): void {
  cache = null
}
