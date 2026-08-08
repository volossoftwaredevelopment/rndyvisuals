// POST { filename, contentType, size, kind } → a short-lived presigned PUT URL.
// The browser uploads straight to R2, so a 2 GB master never passes through a
// serverless function (which caps request bodies at a few MB).

import { S3Client } from '@aws-sdk/client-s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { clientIp, logEvent, readJson, requireSession } from './_lib.js'

export const LIMITS = {
  video: {
    maxBytes: 2 * 1024 * 1024 * 1024, // 2 GB
    types: ['video/mp4', 'video/quicktime', 'video/webm'],
    exts: ['mp4', 'mov', 'webm'],
    label: 'MP4 (H.264/H.265), MOV или WebM, до 2 ГБ',
  },
  image: {
    maxBytes: 15 * 1024 * 1024, // 15 MB
    types: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    exts: ['jpg', 'jpeg', 'png', 'webp', 'avif'],
    label: 'JPG, PNG, WebP или AVIF, до 15 МБ',
  },
  download: {
    maxBytes: 500 * 1024 * 1024, // 500 MB
    types: [],
    exts: [],
    label: 'любой файл, до 500 МБ',
  },
}

const PUBLIC_BASE = 'https://media.rndyvisuals.com'

const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!requireSession(req)) return res.status(401).json({ error: 'Сессия истекла — войдите заново.' })

  try {
    const { filename, contentType, size, kind = 'video' } = await readJson(req)
    const rule = LIMITS[kind]
    if (!rule) return res.status(400).json({ error: 'Неизвестный тип загрузки.' })

    const ext = String(filename || '').split('.').pop()?.toLowerCase() || ''
    if (rule.exts.length && !rule.exts.includes(ext)) {
      return res.status(400).json({ error: `Неподходящий формат «.${ext}». Допустимо: ${rule.label}.` })
    }
    if (rule.types.length && contentType && !rule.types.includes(contentType)) {
      return res.status(400).json({ error: `Неподходящий тип файла. Допустимо: ${rule.label}.` })
    }
    const bytes = Number(size)
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return res.status(400).json({ error: 'Не удалось определить размер файла.' })
    }
    if (bytes > rule.maxBytes) {
      const mb = (bytes / 1024 / 1024).toFixed(0)
      const capMb = (rule.maxBytes / 1024 / 1024).toFixed(0)
      return res.status(413).json({ error: `Файл ${mb} МБ — больше лимита ${capMb} МБ. Допустимо: ${rule.label}.` })
    }

    const base = slug(String(filename || '').replace(/\.[^.]+$/, ''))
    const stamp = Date.now().toString(36)
    const key = `${kind}/${base}-${stamp}${ext ? '.' + ext : ''}`

    const s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        ContentType: contentType || 'application/octet-stream',
      }),
      { expiresIn: 3600 },
    )

    await logEvent('upload_signed', `${clientIp(req)} ${key}`)
    return res.status(200).json({ uploadUrl, key, publicUrl: `${PUBLIC_BASE}/${key}` })
  } catch {
    return res.status(500).json({ error: 'Не удалось подготовить загрузку. Попробуйте ещё раз.' })
  }
}
