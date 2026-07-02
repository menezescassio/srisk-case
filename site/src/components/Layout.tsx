import type { ReactNode } from 'react'
import { useApp } from '../state/AppContext'
import srLogo from '../assets/sporting-risk-logo.jpeg'

export type ViewKey = 'overview' | 'flow' | 'concentration' | 'risk' | 'findings'

export const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'flow', label: 'Betflow' },
  { key: 'concentration', label: 'Concentration' },
  { key: 'risk', label: 'Risk' },
  { key: 'findings', label: 'Findings' },
]

interface Props {
  view: ViewKey
  onView: (v: ViewKey) => void
  onLock: () => void
  children: ReactNode
}

export function Layout({ view, onView, onLock, children }: Props) {
  const { payload } = useApp()
  const clientLogoSrc = payload.meta.logo_svg_b64
    ? `data:image/svg+xml;base64,${payload.meta.logo_svg_b64}`
    : payload.meta.logo_png_b64
      ? `data:image/png;base64,${payload.meta.logo_png_b64}`
      : null

  return (
    <div className="dash">
      <header className="dash__bar">
        <div className="dash__brand">
          <img className="dash__srlogo" src={srLogo} alt="Sporting Risk" />
          <span className="dash__word">
            Betflow<span className="dot">.</span>
          </span>
          <span className="dash__sep" aria-hidden="true" />
          <span className="dash__client">
            {clientLogoSrc ? (
              <img src={clientLogoSrc} alt={payload.meta.client} />
            ) : (
              payload.meta.client
            )}
          </span>
        </div>
        <nav className="dash__nav">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              className={`dash__tab${view === v.key ? ' dash__tab--on' : ''}`}
              onClick={() => onView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <button className="dash__lock" onClick={onLock}>
          Lock
        </button>
      </header>
      <main className="dash__main">{children}</main>
      <footer className="dash__foot">
        <span>Prepared by Cassio Menezes · Sporting Risk Betflow case</span>
        <span className="num">
          window {payload.meta.recon.betslip_min.slice(0, 10)} to{' '}
          {payload.meta.recon.betslip_max.slice(0, 10)} · all times UTC · EUR
        </span>
      </footer>
    </div>
  )
}
