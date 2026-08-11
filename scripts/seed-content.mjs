// Creates the `content` table and seeds it from the JSON/TS manifests that used
// to be the source of truth. Safe to re-run: existing keys are left alone unless
// --force is passed.
//
//   node scripts/seed-content.mjs           → seed only missing keys
//   node scripts/seed-content.mjs --force   → overwrite from the files

import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const sql = neon(process.env.DATABASE_URL)
const force = process.argv.includes('--force')

await sql`
  create table if not exists content (
    key        text primary key,
    value      jsonb       not null,
    updated_at timestamptz not null default now()
  )
`

const json = (p) => JSON.parse(readFileSync(p, 'utf8'))

// Reviews still live in a .ts module. Strip the TypeScript bits and import it as
// a real module — far more robust than trying to regex JS into JSON.
async function readReviews() {
  const src = readFileSync('src/data/reviews.ts', 'utf8')
  const js = src
    .replace(/export\s+interface[\s\S]*?\n}/g, '') // drop the interface block
    .replace(/:\s*Review\[\]/g, '') // drop the type annotation
  const url = 'data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64')
  const mod = await import(url)
  if (!Array.isArray(mod.REVIEWS)) throw new Error('REVIEWS не найден в src/data/reviews.ts')
  return mod.REVIEWS
}

const site = json('src/data/site.json')

const seed = {
  videos: json('src/data/videos.json').videos,
  sponsors: json('src/data/sponsors.json').sponsors,
  products: json('src/data/products.json').products,
  reviews: await readReviews(),
  hero: site.hero,
  contacts: site.contacts,
  settings: { sponsorsEnabled: site.sponsors?.enabled !== false },
}

for (const [key, value] of Object.entries(seed)) {
  if (force) {
    await sql`
      insert into content (key, value, updated_at) values (${key}, ${JSON.stringify(value)}::jsonb, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `
  } else {
    await sql`
      insert into content (key, value) values (${key}, ${JSON.stringify(value)}::jsonb)
      on conflict (key) do nothing
    `
  }
  const n = Array.isArray(value) ? `${value.length} шт.` : 'объект'
  console.log(`  ${key.padEnd(10)} ${n}`)
}

const rows = await sql`select key, jsonb_typeof(value) t, updated_at from content order by key`
console.log('\nв базе сейчас:')
for (const r of rows) console.log(`  ${r.key.padEnd(10)} ${r.t.padEnd(7)} ${r.updated_at.toISOString().slice(0, 19)}`)
