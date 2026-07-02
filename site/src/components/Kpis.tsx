import { useApp } from '../state/AppContext'
import { fmtEur, fmtInt, fmtPct, fmtEur2 } from '../lib/format'
import { POS, NEG } from '../lib/viz'

export function Kpis() {
  const { totals, grandTotals } = useApp()
  const filtered = totals.slips !== grandTotals.slips

  const tiles = [
    { label: 'Turnover', value: fmtEur(totals.stake), sub: filtered ? `${fmtPct((totals.stake / grandTotals.stake) * 100)} of total` : 'slip-level, EUR' },
    {
      label: 'GGR',
      value: fmtEur(totals.ggr),
      color: totals.ggr >= 0 ? POS : NEG,
      sub: filtered ? `${fmtPct(grandTotals.ggr ? (totals.ggr / grandTotals.ggr) * 100 : 0)} of total` : 'operator gross win',
    },
    {
      label: 'Margin',
      value: fmtPct(totals.marginPct, 2),
      color: totals.marginPct >= 0 ? POS : NEG,
      sub: 'GGR / turnover',
    },
    { label: 'Betslips', value: fmtInt(totals.slips), sub: 'stake counted once per slip' },
    { label: 'Avg stake', value: fmtEur2(totals.avgStake), sub: 'per slip' },
    { label: 'Customers', value: fmtInt(totals.customers), sub: 'unique Uids' },
  ]

  return (
    <div className="kpis">
      {tiles.map((t) => (
        <div className="kpi" key={t.label}>
          <div className="kpi__label">{t.label}</div>
          <div className="kpi__value num" style={t.color ? { color: t.color } : undefined}>
            {t.value}
          </div>
          <div className="kpi__sub">{t.sub}</div>
        </div>
      ))}
    </div>
  )
}
