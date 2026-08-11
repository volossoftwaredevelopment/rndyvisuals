// POST { password, turnstileToken } → sets the signed admin session cookie.

import {
  clientIp,
  issueToken,
  logEvent,
  readJson,
  sessionCookie,
  sql,
  tooManyAttempts,
  verifyPassword,
  verifyTurnstile,
} from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.SESSION_SECRET
  if (!secret) return res.status(503).json({ error: 'Server is not configured (SESSION_SECRET).' })

  const ip = clientIp(req)

  try {
    if (await tooManyAttempts(ip)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes.' })
    }

    const { password, turnstileToken } = await readJson(req)

    const captcha = await verifyTurnstile(turnstileToken, ip)
    if (captcha === 'failed') {
      await logEvent('login_failed', ip)
      return res.status(400).json({ error: 'The “I am not a robot” check failed. Please reload the page.' })
    }
    if (captcha === 'unavailable') {
      // do not lock the owner out, but record it in the log
      await logEvent('captcha_skipped', ip)
    }

    if (typeof password !== 'string' || password.length === 0) {
      await logEvent('login_failed', ip)
      return res.status(400).json({ error: 'Enter your password.' })
    }

    const [row] = await sql`select password_hash from admin_auth where id = 1`
    if (!row || !verifyPassword(password, row.password_hash)) {
      await logEvent('login_failed', ip)
      return res.status(401).json({ error: 'Wrong password.' })
    }

    await logEvent('login_ok', ip)
    res.setHeader('Set-Cookie', sessionCookie(issueToken(secret)))
    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: 'Server error. Please try again.' })
  }
}
