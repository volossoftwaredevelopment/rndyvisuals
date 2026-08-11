// GET  /api/content            → all site content (public, short edge cache)
// PUT  /api/content { key, value } → save one key (admin session required)
//
// This replaces the old "commit JSON to GitHub with a personal access token"
// flow: the owner just edits and saves, and the change is live immediately —
// no token, no rebuild.

import { clientIp, logEvent, readJson, requireSession, sql } from './_lib.js'

const KEYS = new Set(['videos', 'sponsors', 'products', 'reviews', 'hero', 'contacts', 'settings'])

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const rows = await sql`select key, value from content`
      const out = {}
      for (const r of rows) out[r.key] = r.value
      // short edge cache: fast for visitors, and an admin save shows up quickly
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=300')
      return res.status(200).json(out)
    }

    if (req.method === 'PUT') {
      if (!requireSession(req)) return res.status(401).json({ error: 'Сессия истекла — войдите заново.' })

      const { key, value } = await readJson(req)
      if (!KEYS.has(key)) return res.status(400).json({ error: `Неизвестный раздел «${key}».` })
      if (value === undefined || value === null) return res.status(400).json({ error: 'Пустое значение.' })

      const listKeys = ['videos', 'sponsors', 'products', 'reviews']
      if (listKeys.includes(key) && !Array.isArray(value)) {
        return res.status(400).json({ error: `Раздел «${key}» должен быть списком.` })
      }
      if (!listKeys.includes(key) && (typeof value !== 'object' || Array.isArray(value))) {
        return res.status(400).json({ error: `Раздел «${key}» должен быть объектом.` })
      }

      await sql`
        insert into content (key, value, updated_at)
        values (${key}, ${JSON.stringify(value)}::jsonb, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `
      await logEvent('content_saved', `${clientIp(req)} ${key}`)
      return res.status(200).json({ ok: true, key })
    }

    res.setHeader('Allow', 'GET, PUT')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch {
    return res.status(500).json({ error: 'Ошибка сервера. Попробуйте ещё раз.' })
  }
}
