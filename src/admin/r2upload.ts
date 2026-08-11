// Direct-to-R2 uploads. The browser asks /api/upload-url for a short-lived
// presigned PUT, then streams the file straight to Cloudflare R2 — so a 2 GB
// master never touches a serverless function and never enters the git repo.

export type UploadKind = 'video' | 'image' | 'download'

export interface UploadLimit {
  maxBytes: number
  exts: string[]
  label: string
}

/** Kept in sync with api/upload-url.js — the server re-checks all of this. */
export const LIMITS: Record<UploadKind, UploadLimit> = {
  video: {
    maxBytes: 2 * 1024 * 1024 * 1024,
    exts: ['mp4', 'mov', 'webm'],
    label: 'MP4 (H.264/H.265), MOV or WebM — up to 2 GB',
  },
  image: {
    maxBytes: 15 * 1024 * 1024,
    exts: ['jpg', 'jpeg', 'png', 'webp', 'avif'],
    label: 'JPG, PNG, WebP or AVIF — up to 15 MB',
  },
  download: {
    maxBytes: 500 * 1024 * 1024,
    exts: [],
    label: 'any file — up to 500 MB',
  },
}

export const formatBytes = (n: number): string =>
  n >= 1024 * 1024 * 1024
    ? `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
    : `${Math.max(1, Math.round(n / 1024 / 1024))} MB`

/** Client-side pre-check so the user hears about a bad file instantly. */
export function checkFile(file: File, kind: UploadKind): string | null {
  const rule = LIMITS[kind]
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (rule.exts.length && !rule.exts.includes(ext)) {
    return `Format “.${ext}” is not supported. Allowed: ${rule.label}.`
  }
  if (file.size > rule.maxBytes) {
    return `That file is ${formatBytes(file.size)} — that is over the limit. Allowed: ${rule.label}.`
  }
  if (file.size === 0) return 'The file is empty.'
  return null
}

export interface UploadResult {
  url: string
  key: string
}

/** What the caller needs to draw a real progress read-out. */
export interface UploadProgress {
  loaded: number
  total: number
  /** 0..1 */
  fraction: number
  bytesPerSecond: number
  /** null until there is enough data to estimate */
  secondsLeft: number | null
}

/** "2 min 30 s", "45 s" — short and readable. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  if (m < 60) return rest ? `${m} min ${rest} s` : `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

export const formatSpeed = (bps: number): string =>
  bps >= 1024 * 1024 ? `${(bps / 1024 / 1024).toFixed(1)} MB/s` : `${Math.max(1, Math.round(bps / 1024))} KB/s`

/** Upload with progress. Rejects with a human-readable message. */
export function uploadToR2(
  file: File | Blob,
  filename: string,
  kind: UploadKind,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    fetch('/api/upload-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        kind,
      }),
    })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as {
          uploadUrl?: string
          publicUrl?: string
          key?: string
          error?: string
        }
        if (!r.ok || !d.uploadUrl) {
          throw new Error(d.error || (r.status === 401 ? 'Your session expired — please sign in again.' : 'Could not start the upload.'))
        }
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', d.uploadUrl, true)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

        // Smooth the rate over recent samples — a raw instantaneous figure makes
        // the estimate jump around too much to be useful.
        const started = performance.now()
        let lastAt = started
        let lastLoaded = 0
        let rate = 0
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable || !onProgress) return
          const now = performance.now()
          const dt = (now - lastAt) / 1000
          if (dt > 0.2) {
            const instant = (e.loaded - lastLoaded) / dt
            rate = rate ? rate * 0.7 + instant * 0.3 : instant
            lastAt = now
            lastLoaded = e.loaded
          }
          const elapsed = (now - started) / 1000
          const average = elapsed > 0 ? e.loaded / elapsed : 0
          const bps = rate || average
          onProgress({
            loaded: e.loaded,
            total: e.total,
            fraction: e.loaded / e.total,
            bytesPerSecond: bps,
            secondsLeft: bps > 0 && elapsed > 1 ? (e.total - e.loaded) / bps : null,
          })
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.({ loaded: file.size, total: file.size, fraction: 1, bytesPerSecond: 0, secondsLeft: 0 })
            resolve({ url: d.publicUrl as string, key: d.key as string })
          } else {
            reject(new Error(`Storage rejected the file (code ${xhr.status}).`))
          }
        }
        xhr.onerror = () => reject(new Error('The connection dropped during the upload.'))
        xhr.onabort = () => reject(new Error('Upload cancelled.'))
        xhr.send(file)
      })
      .catch((e) => reject(e instanceof Error ? e : new Error('Could not upload the file.')))
  })
}
