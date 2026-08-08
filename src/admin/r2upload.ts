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
    label: 'MP4 (H.264/H.265), MOV или WebM — до 2 ГБ',
  },
  image: {
    maxBytes: 15 * 1024 * 1024,
    exts: ['jpg', 'jpeg', 'png', 'webp', 'avif'],
    label: 'JPG, PNG, WebP или AVIF — до 15 МБ',
  },
  download: {
    maxBytes: 500 * 1024 * 1024,
    exts: [],
    label: 'любой файл — до 500 МБ',
  },
}

export const formatBytes = (n: number): string =>
  n >= 1024 * 1024 * 1024
    ? `${(n / 1024 / 1024 / 1024).toFixed(2)} ГБ`
    : `${Math.max(1, Math.round(n / 1024 / 1024))} МБ`

/** Client-side pre-check so the user hears about a bad file instantly. */
export function checkFile(file: File, kind: UploadKind): string | null {
  const rule = LIMITS[kind]
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (rule.exts.length && !rule.exts.includes(ext)) {
    return `Формат «.${ext}» не подходит. Нужно: ${rule.label}.`
  }
  if (file.size > rule.maxBytes) {
    return `Файл ${formatBytes(file.size)} — это больше лимита. Нужно: ${rule.label}.`
  }
  if (file.size === 0) return 'Файл пустой.'
  return null
}

export interface UploadResult {
  url: string
  key: string
}

/** Upload with progress. Rejects with a human-readable message. */
export function uploadToR2(
  file: File | Blob,
  filename: string,
  kind: UploadKind,
  onProgress?: (fraction: number) => void,
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
          throw new Error(d.error || (r.status === 401 ? 'Сессия истекла — войдите заново.' : 'Не удалось начать загрузку.'))
        }
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', d.uploadUrl, true)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(1)
            resolve({ url: d.publicUrl as string, key: d.key as string })
          } else {
            reject(new Error(`Хранилище отклонило файл (код ${xhr.status}).`))
          }
        }
        xhr.onerror = () => reject(new Error('Сеть оборвалась во время загрузки.'))
        xhr.onabort = () => reject(new Error('Загрузка отменена.'))
        xhr.send(file)
      })
      .catch((e) => reject(e instanceof Error ? e : new Error('Не удалось загрузить файл.')))
  })
}
