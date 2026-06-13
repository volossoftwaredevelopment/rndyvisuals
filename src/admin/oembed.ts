// URL parsing + oEmbed title prefetch for YouTube / Vimeo.
// Both oEmbed endpoints are CORS-enabled; failures resolve to '' and never block adding.

export interface ParsedVideoUrl {
  type: 'youtube' | 'vimeo'
  id: string
}

const YT_ID = /^[A-Za-z0-9_-]{6,20}$/

export function parseVideoUrl(raw: string): ParsedVideoUrl | null {
  const input = raw.trim()
  if (!input) return null
  let url: URL
  try {
    url = new URL(input)
  } catch {
    try {
      url = new URL(`https://${input}`)
    } catch {
      return null
    }
  }
  const host = url.hostname.replace(/^(www|m)\./, '')

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] ?? ''
    return YT_ID.test(id) ? { type: 'youtube', id } : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host.endsWith('.youtube.com')) {
    const v = url.searchParams.get('v')
    if (v && YT_ID.test(v)) return { type: 'youtube', id: v }
    const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{6,20})/)
    return m ? { type: 'youtube', id: m[1] } : null
  }
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    // Id must be a whole path segment — /user8401234 (profiles) is not a video.
    const m = url.pathname.match(/(?:^|\/)(\d{6,})(?=\/|$)/)
    return m ? { type: 'vimeo', id: m[1] } : null
  }
  return null
}

/** Resolves to the video title, or '' on any failure (timeout, CORS, private video). */
export async function fetchOEmbedTitle(video: ParsedVideoUrl): Promise<string> {
  const endpoint =
    video.type === 'youtube'
      ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
          `https://www.youtube.com/watch?v=${video.id}`,
        )}`
      : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${video.id}`)}`
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return ''
    const data = (await res.json()) as { title?: unknown }
    return typeof data.title === 'string' ? data.title.trim() : ''
  } catch {
    return ''
  }
}
