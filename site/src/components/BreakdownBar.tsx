import { fmtEurCompact, fmtInt, fmtPct } from '../lib/format'
import type { GroupRow } from '../lib/store'

interface Props {
  title: string
  rows: GroupRow[]
  colors: Record<string, string>
  note?: string
}

/** Single stacked share bar with 2px surface gaps + a compact table. */
export function BreakdownBar({ title, rows, colors, note }: Props) {
  const total = rows.reduce((a, r) => a + r.stake, 0)
  if (!total) return null
  return (
    <div className="card">
      <h3 className="card__title">{title}</h3>
      <div className="bbar" role="img" aria-label={title}>
        {rows.map((r) => (
          <div
            key={r.label}
            className="bbar__seg"
            style={{
              width: `${(r.stake / total) * 100}%`,
              background: colors[r.label] ?? '#6d7681',
            }}
            title={`${r.label}: ${fmtEurCompact(r.stake)} (${fmtPct((r.stake / total) * 100)})`}
          />
        ))}
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th></th>
            <th className="num">stake</th>
            <th className="num">share</th>
            <th className="num">GGR</th>
            <th className="num">margin</th>
            <th className="num">slips</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>
                <span className="dotmark" style={{ background: colors[r.label] ?? '#6d7681' }} />
                {r.label}
              </td>
              <td className="num">{fmtEurCompact(r.stake)}</td>
              <td className="num">{fmtPct((r.stake / total) * 100)}</td>
              <td className="num">{fmtEurCompact(r.ggr)}</td>
              <td className="num">{r.stake ? fmtPct((r.ggr / r.stake) * 100) : '·'}</td>
              <td className="num">{fmtInt(r.slips)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="card__note">{note}</p>}
    </div>
  )
}
