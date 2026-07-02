#!/usr/bin/env node
/**
 * Encrypt an artifact for the Betflow site.
 *
 * Envelope: "BFE1" | uint32LE iterations | salt(16) | iv(12) | AES-256-GCM(gzip(plaintext))
 * Key: PBKDF2-SHA256(password, salt, iterations), 256-bit.
 * Password comes from BETFLOW_PASSWORD or .env at the repo root (never committed).
 *
 * Usage:
 *   node scripts/encrypt.mjs --in <file> --out <file.enc>
 *   node scripts/encrypt.mjs --json '{"sentinel":true}' --out <file.enc>
 *   node scripts/encrypt.mjs --sentinel        # writes site/public/payload/sentinel.enc
 */
import { webcrypto as crypto } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ITERATIONS = 600_000

function loadPassword() {
  if (process.env.BETFLOW_PASSWORD) return process.env.BETFLOW_PASSWORD
  const envPath = join(ROOT, '.env')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^BETFLOW_PASSWORD=(.*)$/)
      if (m) return m[1].trim()
    }
  }
  console.error('BETFLOW_PASSWORD not set and no .env found at repo root')
  process.exit(1)
}

async function encrypt(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )
  const gz = gzipSync(plaintext, { level: 9 })
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, gz))
  const head = Buffer.alloc(8)
  head.write('BFE1', 0, 'ascii')
  head.writeUInt32LE(ITERATIONS, 4)
  return Buffer.concat([head, Buffer.from(salt), Buffer.from(iv), Buffer.from(ct)])
}

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

let plaintext
let out = flag('--out')
if (args.includes('--sentinel')) {
  plaintext = Buffer.from(
    JSON.stringify({ sentinel: true, builtAt: new Date().toISOString() }),
  )
  out ??= join(ROOT, 'site', 'public', 'payload', 'sentinel.enc')
} else if (flag('--json')) {
  plaintext = Buffer.from(flag('--json'))
} else if (flag('--in')) {
  plaintext = readFileSync(flag('--in'))
} else {
  console.error('usage: encrypt.mjs [--sentinel | --json <str> | --in <file>] --out <file.enc>')
  process.exit(1)
}

if (!out) {
  console.error('missing --out')
  process.exit(1)
}
if (!out.endsWith('.enc')) {
  console.error('refusing to write a non-.enc artifact (guard would reject it anyway)')
  process.exit(1)
}

const envelope = await encrypt(plaintext, loadPassword())
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, envelope)
console.log(`wrote ${out} (${envelope.length} bytes, plaintext ${plaintext.length})`)
