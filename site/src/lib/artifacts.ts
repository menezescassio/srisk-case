import { decryptJson } from './crypto'

/** Fetch an encrypted artifact from the payload directory and decrypt it. */
export async function fetchArtifact(name: string): Promise<ArrayBuffer> {
  const res = await fetch(`${import.meta.env.BASE_URL}payload/${name}`)
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
