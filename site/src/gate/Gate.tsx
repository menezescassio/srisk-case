import { useState, type FormEvent } from 'react'
import { verifyPassword, type Sentinel } from '../lib/artifacts'
import { WrongPasswordError } from '../lib/crypto'
import { setSessionPassword } from '../lib/session'
import logo from '../assets/sporting-risk-logo.jpeg'
import './gate.css'

interface Props {
  onUnlock: (password: string, sentinel: Sentinel) => void
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string }

export function Gate({ onUnlock }: Props) {
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [shake, setShake] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!password || status.kind === 'busy') return
    setStatus({ kind: 'busy' })
    try {
      const sentinel = await verifyPassword(password)
      setSessionPassword(password)
      onUnlock(password, sentinel)
    } catch (err) {
      const message =
        err instanceof WrongPasswordError
          ? 'Key rejected: authentication failed. Check the access key and try again.'
          : 'Could not load the encrypted payload. Check the connection and retry.'
      setStatus({ kind: 'error', message })
      setShake(true)
      setTimeout(() => setShake(false), 450)
    }
  }

  return (
    <div className={`gate${shake ? ' gate--shake' : ''}`}>
      <svg className="gate__flowline" viewBox="0 0 800 300" aria-hidden="true">
        <path d="M0,220 L90,208 L150,232 L230,180 L300,196 L370,140 L430,158 L520,96 L590,120 L680,54 L800,70" />
        <circle cx="680" cy="54" r="4" />
      </svg>

      <header className="gate__head">
        <img className="gate__logo" src={logo} alt="Sporting Risk" />
        <div className="gate__org">
          <strong>Sporting Risk</strong>
          Trading · Risk · Client Intelligence
        </div>
      </header>

      <main className="gate__body">
        <h1 className="gate__title">
          Betflow<span className="dot">.</span>
        </h1>
        <p className="gate__sub">
          Client betslip intelligence · FIFA World Cup 2026 window
        </p>
        <div className="gate__rule" />
        <form className="gate__form" onSubmit={submit}>
          <label className="gate__label" htmlFor="gate-key">
            Access key
          </label>
          <div className="gate__row">
            <input
              id="gate-key"
              className="gate__input"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (status.kind === 'error') setStatus({ kind: 'idle' })
              }}
              placeholder="••••••••••••"
            />
            <button className="gate__btn" type="submit" disabled={status.kind === 'busy'}>
              {status.kind === 'busy' ? 'Deriving key' : 'Unlock'}
            </button>
          </div>
          <div
            className={`gate__status${
              status.kind === 'error'
                ? ' gate__status--error'
                : status.kind === 'busy'
                  ? ' gate__status--busy'
                  : ''
            }`}
            role="status"
          >
            {status.kind === 'error'
              ? status.message
              : status.kind === 'busy'
                ? 'Deriving key and decrypting payload'
                : 'AES-256-GCM · key derived in your browser, nothing leaves it'}
          </div>
        </form>
      </main>

      <footer className="gate__foot">
        <span>Prepared by Cassio Menezes</span>
        <span className="num">PBKDF2-SHA256 · 600,000 iterations</span>
      </footer>
    </div>
  )
}
