// Vercel Edge Middleware — gates the admin page behind a signed session cookie.
// Runs before any static file is served, so /admin.html is never handed out to
// an unauthenticated visitor. Password checking itself happens in /api/login
// (Node runtime, scrypt); here we only verify the cookie's HMAC signature.

export const config = {
  matcher: ['/admin', '/admin.html'],
}

const COOKIE = 'rndy_admin'

function base64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

async function verifyToken(token, secret) {
  if (!token || !secret) return false
  const dot = token.lastIndexOf('.')
  if (dot < 1) return false
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  let ok = false
  try {
    ok = await crypto.subtle.verify(
      'HMAC',
      key,
      base64urlToBytes(sig),
      new TextEncoder().encode(payload),
    )
  } catch {
    return false
  }
  if (!ok) return false

  try {
    const data = JSON.parse(new TextDecoder().decode(base64urlToBytes(payload)))
    return typeof data.exp === 'number' && Date.now() < data.exp
  } catch {
    return false
  }
}

export default async function middleware(request) {
  const url = new URL(request.url)
  const secret = process.env.SESSION_SECRET

  // Fail closed: with no secret configured the admin stays locked rather than open.
  if (!secret) {
    return new Response('Admin is not configured (missing SESSION_SECRET).', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  const cookie = request.headers.get('cookie') || ''
  const token = cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1)

  if (await verifyToken(decodeURIComponent(token || ''), secret)) {
    return // authenticated — let the request through to the static admin page
  }

  url.pathname = '/admin-login.html'
  url.search = ''
  return Response.redirect(url, 302)
}
