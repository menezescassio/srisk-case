import { useEffect, useState } from 'react'
import { Gate } from './gate/Gate'
import { verifyPassword, type Sentinel } from './lib/artifacts'
import { getSessionPassword, clearSession } from './lib/session'
import logo from './assets/sporting-risk-logo.jpeg'
import './shell.css'

type State =
  | { kind: 'checking' }
  | { kind: 'locked' }
  | { kind: 'open'; password: string; sentinel: Sentinel }

export default function App() {
  const [state, setState] = useState<State>({ kind: 'checking' })

  useEffect(() => {
    const saved = getSessionPassword()
    if (!saved) {
      setState({ kind: 'locked' })
      return
    }
    verifyPassword(saved)
      .then((sentinel) => setState({ kind: 'open', password: saved, sentinel }))
      .catch(() => {
        clearSession()
        setState({ kind: 'locked' })
      })
  }, [])

  if (state.kind === 'checking') {
    return <div className="boot" aria-busy="true" />
  }

  if (state.kind === 'locked') {
    return (
      <Gate
        onUnlock={(password, sentinel) =>
          setState({ kind: 'open', password, sentinel })
        }
      />
    )
  }

  return (
    <div className="shell">
      <header className="shell__bar">
        <div className="shell__brand">
          <img src={logo} alt="Sporting Risk" />
          <span className="shell__word">
            Betflow<span className="dot">.</span>
          </span>
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
          <h2>Payload decrypted</h2>
          <p>
            The access key was verified against the encrypted sentinel in your
            browser. Dashboard views land with the next PRs; this page proves
            the gate, the crypto and the deploy pipeline end to end.
          </p>
          <p className="num shell__meta">
            sentinel built {new Date(state.sentinel.builtAt).toUTCString()}
          </p>
        </div>
      </main>
    </div>
  )
}
