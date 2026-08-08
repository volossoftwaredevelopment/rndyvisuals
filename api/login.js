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
  if (!secret) return res.status(503).json({ error: 'Сервер не настроен (SESSION_SECRET).' })

  const ip = clientIp(req)

  try {
    if (await tooManyAttempts(ip)) {
      return res.status(429).json({ error: 'Слишком много попыток. Подождите 15 минут.' })
    }

    const { password, turnstileToken } = await readJson(req)

    const captcha = await verifyTurnstile(turnstileToken, ip)
    if (captcha === 'failed') {
      await logEvent('login_failed', ip)
      return res.status(400).json({ error: 'Проверка «я не робот» не пройдена. Обновите страницу.' })
    }
    if (captcha === 'unavailable') {
      // не блокируем владельца, но фиксируем в журнале
      await logEvent('captcha_skipped', ip)
    }

    if (typeof password !== 'string' || password.length === 0) {
      await logEvent('login_failed', ip)
      return res.status(400).json({ error: 'Введите пароль.' })
    }

    const [row] = await sql`select password_hash from admin_auth where id = 1`
    if (!row || !verifyPassword(password, row.password_hash)) {
      await logEvent('login_failed', ip)
      return res.status(401).json({ error: 'Неверный пароль.' })
    }

    await logEvent('login_ok', ip)
    res.setHeader('Set-Cookie', sessionCookie(issueToken(secret)))
    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: 'Ошибка сервера. Попробуйте ещё раз.' })
  }
}
