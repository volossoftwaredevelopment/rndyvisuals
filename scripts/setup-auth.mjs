// One-time setup: create the admin_auth table in Neon, generate a strong admin
// password + session secret, store the password's scrypt hash, and hand the
// plaintext back ONLY via a local file (never printed to a transcript/log).
//
//   node scripts/setup-auth.mjs            → creates schema, keeps existing password
//   node scripts/setup-auth.mjs --reset    → also generates a NEW password
//
// Output: writes .setup-credentials.json (gitignored) for the PDF generator.

import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes, scryptSync } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString('hex')
  return `scrypt:${salt}:${key}`
}

// Readable but strong: 4 groups of 4 from an unambiguous alphabet (~82 bits)
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1
  const pick = (n) =>
    Array.from(randomBytes(n))
      .map((b) => alphabet[b % alphabet.length])
      .join('')
  return [pick(4), pick(4), pick(4), pick(4)].join('-')
}

const sql = neon(process.env.DATABASE_URL)

await sql`
  create table if not exists admin_auth (
    id            integer primary key default 1,
    password_hash text        not null,
    updated_at    timestamptz not null default now(),
    constraint admin_auth_single_row check (id = 1)
  )
`
await sql`
  create table if not exists admin_audit (
    id         bigserial primary key,
    event      text        not null,
    detail     text,
    created_at timestamptz not null default now()
  )
`

const existing = await sql`select id from admin_auth where id = 1`
const reset = process.argv.includes('--reset')

let password = null
if (existing.length === 0 || reset) {
  password = generatePassword()
  const hash = hashPassword(password)
  await sql`
    insert into admin_auth (id, password_hash, updated_at)
    values (1, ${hash}, now())
    on conflict (id) do update set password_hash = excluded.password_hash, updated_at = now()
  `
  await sql`insert into admin_audit (event, detail) values ('password_set', 'via setup script')`
}

const sessionSecret = randomBytes(32).toString('hex')

writeFileSync(
  '.setup-credentials.json',
  JSON.stringify({ password, sessionSecret, generatedAt: new Date().toISOString() }, null, 2),
)

console.log('schema: admin_auth + admin_audit ready')
console.log('password:', password ? 'СГЕНЕРИРОВАН (записан в .setup-credentials.json)' : 'оставлен прежний')
console.log('session secret: сгенерирован')
