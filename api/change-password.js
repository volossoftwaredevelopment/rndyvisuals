// POST { current, next } → changes the admin password. Requires a valid session
// AND the current password, so a hijacked tab can't silently lock the owner out.

import {
  clearCookie,
  clientIp,
  hashPassword,
  logEvent,
  readJson,
  requireSession,
  sql,
  verifyPassword,
} from './_lib.js'

const MIN_LENGTH = 10

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!requireSession(req)) return res.status(401).json({ error: 'Your session expired — please sign in again.' })

  try {
    const { current, next } = await readJson(req)

    if (typeof next !== 'string' || next.trim().length < MIN_LENGTH) {
      return res.status(400).json({ error: `New password must be at least ${MIN_LENGTH} characters.` })
    }
    if (current === next) {
      return res.status(400).json({ error: 'The new password is the same as the current one.' })
    }

    const [row] = await sql`select password_hash from admin_auth where id = 1`
    if (!row || !verifyPassword(String(current ?? ''), row.password_hash)) {
      await logEvent('password_change_failed', clientIp(req))
      return res.status(401).json({ error: 'The current password is wrong.' })
    }

    await sql`update admin_auth set password_hash = ${hashPassword(next.trim())}, updated_at = now() where id = 1`
    await logEvent('password_changed', clientIp(req))

    // force a fresh login with the new password everywhere
    res.setHeader('Set-Cookie', clearCookie())
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Server error. Please try again.' })
  }
}
