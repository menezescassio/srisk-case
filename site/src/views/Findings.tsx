import { useState } from 'react'
import { useApp } from '../state/AppContext'
import { fetchArtifact } from '../lib/artifacts'
import { decryptEnvelope } from '../lib/crypto'
import { getSessionPassword } from '../lib/session'
import { fmtEur, fmtPct } from '../lib/format'
import { POS, NEG } from '../lib/viz'

export function Findings() {
  const { payload } = useApp()
  const f = payload.findings
  const [dl, setDl] = useState<'idle' | 'busy' | 'error'>('idle')

  async function downloadPdf() {
    const password = getSessionPassword()
    if (!password) return
    setDl('busy')
    try {
      const buf = await fetchArtifact('report.pdf.enc')
      const plain = await decryptEnvelope(buf, password)
      const ab = new ArrayBuffer(plain.byteLength)
      new Uint8Array(ab).set(plain)
      const blob = new Blob([ab], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Betflow-client-analysis.pdf'
      a.click()
      URL.revokeObjectURL(url)
      setDl('idle')
    } catch {
      setDl('error')
    }
  }

  return (
    <div className="view findings">
      <div className="card">
        <div className="card__head">
          <div>
            <h3 className="findings__title">{f.title}</h3>
            <p className="findings__sub num">
              window {f.window} · generated {f.generated} · all figures EUR, slip-level
            </p>
          </div>
          <button className="findings__dl" onClick={downloadPdf} disabled={dl === 'busy'}>
            {dl === 'busy' ? 'Decrypting…' : dl === 'error' ? 'Failed, retry' : 'Download PDF report'}
          </button>
        </div>
        <div className="findings__kpis">
          {f.headline.map((k) => (
            <div key={k.label} className="findings__kpi">
              <span className="kpi__label">{k.label}</span>
              <span className="num">{k.value}</span>
            </div>
          ))}
        </div>
      </div>

      {f.sections.map((s) => (
        <div className="card findings__section" key={s.id}>
          <h3 className="card__title">{s.title}</h3>
          {s.paras.map((p, i) => (
            <p className="findings__para" key={i}>
              {p}
            </p>
          ))}
          {s.bullets.length > 0 && (
            <ul className="findings__bullets">
              {s.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
          {s.id === 'flow' && <PhaseTable />}
          {s.id === 'flow' && <GroupTable />}
        </div>
      ))}

      <div className="card findings__sig">
        <span>{f.signature}</span>
        <span className="dim">Trading, Risk &amp; Client Intelligence case · Sporting Risk</span>
      </div>
    </div>
  )
}

function PhaseTable() {
  const { payload } = useApp()
  return <MiniTable rows={payload.findings.tables.phases} label="timing phase" />
}

function GroupTable() {
  const { payload } = useApp()
  return <MiniTable rows={payload.findings.tables.groups} label="product group" />
}

function MiniTable({
  rows,
  label,
}: {
  rows: { name: string; stake: number; share: number; ggr: number; margin: number }[]
  label: string
}) {
  return (
    <div className="tbl-scroll" style={{ marginTop: 10 }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>{label}</th>
            <th className="num">stake</th>
            <th className="num">share</th>
            <th className="num">GGR</th>
            <th className="num">margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="num">{fmtEur(r.stake)}</td>
              <td className="num">{fmtPct(r.share)}</td>
              <td className="num" style={{ color: r.ggr >= 0 ? POS : NEG }}>
                {fmtEur(r.ggr)}
              </td>
              <td className="num">{fmtPct(r.margin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
