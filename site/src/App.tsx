import { useEffect, useState } from 'react'
import { Gate } from './gate/Gate'
import { verifyPassword } from './lib/artifacts'
import { loadPayload, type Payload } from './lib/payload'
import { getSessionPassword, clearSession } from './lib/session'
import { AppProvider } from './state/AppContext'
import { Layout, type ViewKey } from './components/Layout'
import { FilterBar } from './components/FilterBar'
import { Overview } from './views/Overview'
import { Flow } from './views/Flow'
import { Concentration } from './views/Concentration'
import { Risk } from './views/Risk'
import { Findings } from './views/Findings'
import './shell.css'
import './dash.css'

type State =
  | { kind: 'checking' }
  | { kind: 'locked' }
  | { kind: 'loading' }
  | { kind: 'open'; payload: Payload }
  | { kind: 'error'; message: string }

export default function App() {
  const [state, setState] = useState<State>({ kind: 'checking' })
  const [view, setView] = useState<ViewKey>('overview')

  async function open(password: string) {
    setState({ kind: 'loading' })
    try {
      const payload = await loadPayload(password)
      setState({ kind: 'open', payload })
    } catch {
      setState({ kind: 'error', message: 'Payload decryption failed. Lock and try again.' })
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

  if (state.kind === 'checking') return <div className="boot" aria-busy="true" />
  if (state.kind === 'locked') return <Gate onUnlock={(pw) => void open(pw)} />
  if (state.kind === 'loading')
    return (
      <div className="boot boot--busy">
        <span className="num">decrypting payload…</span>
      </div>
    )
  if (state.kind === 'error')
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

  const lock = () => {
    clearSession()
    setState({ kind: 'locked' })
  }

  return (
    <AppProvider payload={state.payload}>
      <Layout view={view} onView={setView} onLock={lock}>
        <FilterBar />
        {view === 'overview' && <Overview />}
        {view === 'flow' && <Flow />}
        {view === 'concentration' && <Concentration />}
        {view === 'risk' && <Risk />}
        {view === 'findings' && <Findings />}
      </Layout>
    </AppProvider>
  )
}
