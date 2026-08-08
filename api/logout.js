// POST → clears the admin session cookie.

import { clearCookie } from './_lib.js'

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Set-Cookie', clearCookie())
  return res.status(200).json({ ok: true })
}
