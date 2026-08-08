// Shared helpers for the admin auth API (Vercel Node runtime).

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

export const COOKIE = 'rndy_admin'
export const SESSION_HOURS = 12
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export const sql = neon(process.env.DATABASE_URL)

/* ------------------------------------------------------------- passwords */

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString('hex')
  return `scrypt:${salt}:${key}`
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, key] = parts
  let calc
  try {
    calc = scryptSync(password, salt, SCRYPT.keylen, SCRYPT)
  } catch {
    return false
  }
  const expected = Buffer.from(key, 'hex')
  return calc.length === expected.length && timingSafeEqual(calc, expected)
}

/* --------------------------------------------------------------- session */

const b64url = (buf) => Buffer.from(buf).toString('base64url')

export function issueToken(secret, hours = SESSION_HOURS) {
  const payload = b64url(JSON.stringify({ exp: Date.now() + hours * 3600_000 }))
  const sig = b64url(createHmac('sha256', secret).update(payload).digest())
  return `${payload}.${sig}`
}

export function verifyToken(token, secret) {
  if (!token || !secret) return false
  const dot = String(token).lastIndexOf('.')
  if (dot < 1) return false
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expect = b64url(createHmac('sha256', secret).update(payload).digest())
  const a = Buffer.from(sig)
  const b = Buffer.from(expect)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof exp === 'number' && Date.now() < exp
  } catch {
    return false
  }
}

export function sessionCookie(token, hours = SESSION_HOURS) {
  const attrs = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${Math.floor(hours * 3600)}`,
  ]
  return attrs.join('; ')
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

export function readCookie(req, name = COOKIE) {
  const raw = req.headers.cookie || ''
  const hit = raw
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : ''
}

export function requireSession(req) {
  return verifyToken(readCookie(req), process.env.SESSION_SECRET)
}

/* -------------------------------------------------------------- turnstile */

/**
 * Returns 'ok' | 'failed' | 'unavailable'.
 *
 * Only an explicit rejection from Cloudflare ('failed') blocks a login. A missing
 * token or an unreachable siteverify service degrades to 'unavailable' so a
 * Cloudflare outage — or the widget being blocked in the owner's browser — can
 * never lock the owner out of their own site. The password (82 bits of entropy)
 * plus the per-IP attempt throttle remain the actual gate; the captcha is a
 * bot-speed-bump layered on top.
 */
export async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return 'unavailable'
  if (!token) return 'unavailable'
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip) body.set('remoteip', ip)
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    })
    if (!r.ok) return 'unavailable'
    const d = await r.json()
    return d.success === true ? 'ok' : 'failed'
  } catch {
    return 'unavailable'
  }
}

/* ------------------------------------------------------------ rate limit */

export async function tooManyAttempts(ip) {
  const [row] = await sql`
    select count(*)::int as n from admin_audit
    where event = 'login_failed' and detail = ${ip} and created_at > now() - interval '15 minutes'
  `
  return (row?.n ?? 0) >= 8
}

export const logEvent = (event, detail) =>
  sql`insert into admin_audit (event, detail) values (${event}, ${detail})`

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
}

export function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body)
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 1e6) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'))
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}
