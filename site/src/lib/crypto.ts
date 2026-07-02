/**
 * Client-side decryption of Betflow artifacts.
 *
 * Envelope layout (binary, little-endian):
 *   [0..4)   magic "BFE1"
 *   [4..8)   uint32 PBKDF2 iteration count
 *   [8..24)  16-byte random salt
 *   [24..36) 12-byte random IV
 *   [36..)   AES-256-GCM ciphertext of the gzipped plaintext
 *
 * The key is derived from the access password with PBKDF2-SHA256.
 * A wrong password fails GCM authentication; nothing partial ever renders.
 */

const MAGIC = 'BFE1'

export class BadEnvelopeError extends Error {}
export class WrongPasswordError extends Error {}

const keyCache = new Map<string, CryptoKey>()

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  // Cache must be keyed by password too: a failed attempt would otherwise
  // poison the cache for the correct password on the same artifact.
  const cacheKey = `${iterations}:${btoa(String.fromCharCode(...salt))}:${password}`
  const cached = keyCache.get(cacheKey)
  if (cached) return cached
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  keyCache.set(cacheKey, key)
  return key
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function decryptEnvelope(
  buf: ArrayBuffer,
  password: string,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(buf)
  if (bytes.length < 36) throw new BadEnvelopeError('envelope too short')
  const magic = new TextDecoder().decode(bytes.slice(0, 4))
  if (magic !== MAGIC) throw new BadEnvelopeError(`bad magic: ${magic}`)
  const iterations = new DataView(buf).getUint32(4, true)
  const salt = bytes.slice(8, 24)
  const iv = bytes.slice(24, 36)
  const ciphertext = bytes.slice(36)
  const key = await deriveKey(password, salt, iterations)
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    )
  } catch {
    throw new WrongPasswordError('GCM authentication failed')
  }
  return gunzip(new Uint8Array(plain))
}

export async function decryptJson<T>(buf: ArrayBuffer, password: string): Promise<T> {
  const plain = await decryptEnvelope(buf, password)
  return JSON.parse(new TextDecoder().decode(plain)) as T
}
