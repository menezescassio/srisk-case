import { useEffect, useState } from 'react'
import { Gate } from './gate/Gate'
import { verifyPassword } from './lib/artifacts'
import { loadPayload, type Payload } from './lib/payload'
import { getSessionPassword, clearSession } from './lib/session'
import logo from './assets/sporting-risk-logo.jpeg'
import './shell.css'

type State =
  | { kind: 'checking' }
  | { kind: 'locked' }
  | { kind: 'loading' }
  | { kind: 'open'; payload: Payload }
  | { kind: 'error'; message: string }

export default function App() {
  const [state, setState] = useState<State>({ kind: 'checking' })

  async function open(password: string) {
    setState({ kind: 'loading' })
    try {
      const payload = await loadPayload(password)
      setState({ kind: 'open', payload })
    } catch {
      setState({
        kind: 'error',
        message: 'Payload decryption failed. Lock and try again.',
      })
    }
  }

  useEffect(() => {
    const saved = getSessionPassword()
    if (!saved) {
      setState({ kind: 'locked' })
      return
    }
    verifyPassword(saved)
      .then(() => open(saved))
      .catch(() => {
        clearSession()
        setState({ kind: 'locked' })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state.kind === 'checking') {
    return <div className="boot" aria-busy="true" />
  }

  if (state.kind === 'locked') {
    return <Gate onUnlock={(password) => void open(password)} />
  }

  if (state.kind === 'loading') {
    return (
      <div className="boot boot--busy">
        <span className="num">decrypting payload…</span>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="boot boot--busy">
        <span className="num">{state.message}</span>
        <button
          className="shell__lock"
          onClick={() => {
            clearSession()
            setState({ kind: 'locked' })
          }}
        >
          Lock
        </button>
      </div>
    )
  }

  const { payload } = state
  const r = payload.meta.recon
  const eur = (v: number) =>
    v.toLocaleString('en-GB', { maximumFractionDigits: 0 })

  return (
    <div className="shell">
      <header className="shell__bar">
        <div className="shell__brand">
          <img src={logo} alt="Sporting Risk" />
          <span className="shell__word">
            Betflow<span className="dot">.</span>
          </span>
          <span className="shell__client num">{payload.meta.client}</span>
        </div>
        <button
          className="shell__lock"
          onClick={() => {
            clearSession()
            setState({ kind: 'locked' })
          }}
        >
          Lock
        </button>
      </header>
      <main className="shell__main">
        <div className="shell__card">
          <h2>Payload decrypted and parsed</h2>
          <p>
            Slip and leg tables are in memory. The dashboard views land in the
            next PRs; the numbers below prove the payload end to end.
          </p>
          <p className="num shell__meta">
            {r.slips.toLocaleString()} slips · {r.union_rows.toLocaleString()}{' '}
            legs · turnover €{eur(r.turnover_eur)} · GGR €{eur(r.ggr_eur)} ·
            margin {r.margin_pct.toFixed(2)}% · {r.unique_customers.toLocaleString()}{' '}
            customers
          </p>
        </div>
      </main>
    </div>
  )
}
