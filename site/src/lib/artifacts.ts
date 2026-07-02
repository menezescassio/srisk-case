import { decryptJson } from './crypto'

/** Fetch an encrypted artifact from the payload directory and decrypt it.
 *
 * cache: 'no-cache' forces revalidation against the server (via ETag) on every
 * load. The payload lives at a stable URL (payload/data.enc), so without this a
 * browser can keep serving a cached OLD payload while running freshly deployed
 * code, and code that reads a newly added field then crashes (version skew).
 * Revalidation is cheap: unchanged artifacts come back 304. */
export async function fetchArtifact(name: string): Promise<ArrayBuffer> {
  const res = await fetch(`${import.meta.env.BASE_URL}payload/${name}`, {
    cache: 'no-cache',
  })
  if (!res.ok) throw new Error(`artifact ${name}: HTTP ${res.status}`)
  return res.arrayBuffer()
}

export interface Sentinel {
  sentinel: true
  builtAt: string
}

/** The sentinel exists solely to validate the password at the gate. */
export async function verifyPassword(password: string): Promise<Sentinel> {
  const buf = await fetchArtifact('sentinel.enc')
  return decryptJson<Sentinel>(buf, password)
}
