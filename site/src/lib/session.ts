/**
 * Session handling for the access password.
 *
 * Tradeoff, stated openly: the password is kept in sessionStorage so a page
 * reload inside the same tab does not re-prompt. This is a static site with no
 * third-party scripts, so the practical exposure is a machine already
 * compromised enough to read tab storage, at which point the password prompt
 * itself is equally lost. Closing the tab clears it.
 */

const KEY = 'betflow.session'

export function getSessionPassword(): string | null {
  return sessionStorage.getItem(KEY)
}

export function setSessionPassword(password: string): void {
  sessionStorage.setItem(KEY, password)
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY)
}
