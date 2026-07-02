import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext'
import { Kpis } from '../components/Kpis'
import { EChart, CHART_TEXT, TOOLTIP_STYLE } from '../components/EChart'
import {
  concentrate,
  lorenz,
  drillRows,
  DIM_LABEL,
  SLIP_DIMS,
  type Dim,
  type ConcRow,
} from '../lib/concentration'
import { CAT, GRID_LINE, NEUTRAL, POS, NEG } from '../lib/viz'
import { fmtEur, fmtEurCompact, fmtInt, fmtPct, fmtDateTime } from '../lib/format'

const DIMS: Dim[] = [
  'market_group',
  'market',
  'team',
  'player',
  'selection',
  'line',
  'bet_type',
  'unit',
  'uid',
  'channel',
  'competition',
]

export function Concentration() {
  const { store, mask, totals } = useApp()
  const [dim, setDim] = useState<Dim>('market_group')
  const [topN, setTopN] = useState(25)
  const [drill, setDrill] = useState<ConcRow | null>(null)

  const rows = useMemo(() => concentrate(store, mask, dim), [store, mask, dim])
  const shown = rows.slice(0, topN)
  const dimTotal = useMemo(() => rows.reduce((a, r) => a + r.stake, 0), [rows])

  const lz = useMemo(() => lorenz(rows.map((r) => r.stake)), [rows])

  const top10Share = useMemo(() => {
    const t10 = rows.slice(0, 10).reduce((a, r) => a + r.stake, 0)
    return dimTotal ? (t10 / dimTotal) * 100 : 0
  }, [rows, dimTotal])

  const drillData = useMemo(
    () => (drill ? drillRows(store, mask, dim, drill.key) : null),
    [store, mask, dim, drill],
  )

  const barOption = useMemo(() => {
    const top = shown.slice(0, 20).reverse()
    return {
      textStyle: CHART_TEXT,
      grid: { left: 220, right: 60, top: 8, bottom: 24 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        ...TOOLTIP_STYLE,
        valueFormatter: (v: number) => fmtEurCompact(v),
      },
      xAxis: {
        type: 'value',
        axisLabel: { ...CHART_TEXT, formatter: fmtEurCompact },
        splitLine: { lineStyle: { color: GRID_LINE } },
      },
      yAxis: {
        type: 'category',
        data: top.map((r) => (r.label.length > 34 ? r.label.slice(0, 33) + '…' : r.label)),
        axisLine: { lineStyle: { color: GRID_LINE } },
        axisLabel: { ...CHART_TEXT, color: '#a8b0b9' },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 14,
          itemStyle: { color: CAT[0], borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: 'right',
            ...CHART_TEXT,
            formatter: ({ value }: { value: number }) =>
              dimTotal ? fmtPct((value / dimTotal) * 100) : '',
          },
          data: top.map((r) => Math.round(r.stake)),
        },
      ],
    }
  }, [shown, dimTotal])

  const lorenzOption = useMemo(
    () => ({
      textStyle: CHART_TEXT,
      grid: { left: 48, right: 16, top: 10, bottom: 34 },
      tooltip: { show: false },
      xAxis: {
        type: 'value',
        min: 0,
        max: 1,
        name: `share of ${DIM_LABEL[dim].toLowerCase()}s`,
        nameLocation: 'middle',
        nameGap: 22,
        nameTextStyle: CHART_TEXT,
        axisLabel: { ...CHART_TEXT, formatter: (v: number) => `${v * 100}%` },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        axisLabel: { ...CHART_TEXT, formatter: (v: number) => `${v * 100}%` },
        splitLine: { lineStyle: { color: GRID_LINE } },
      },
      series: [
        {
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 2, color: CAT[0] },
          areaStyle: { opacity: 0.18, color: CAT[0] },
          data: lz.x.map((x, i) => [x, lz.y[i]]),
        },
        {
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 1, type: 'dashed', color: NEUTRAL },
          data: [
            [0, 0],
            [1, 1],
          ],
        },
      ],
    }),
    [lz, dim],
  )

  return (
    <div className="view">
      <Kpis />

      <div className="card">
        <div className="card__head">
          <h3 className="card__title">Where the money concentrates</h3>
          <div className="seg seg--wrap">
            {DIMS.map((d) => (
              <button key={d} className={`seg__btn${dim === d ? ' seg__btn--on' : ''}`} onClick={() => { setDim(d); setDrill(null) }}>
                {DIM_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
        <div className="conc__stats num">
          <span>{fmtInt(rows.length)} distinct {DIM_LABEL[dim].toLowerCase()}s</span>
          <span>top 10 hold {fmtPct(top10Share)} of stake</span>
          <span>Gini {lz.gini.toFixed(3)}</span>
        </div>
        <div className="grid2">
          <EChart option={barOption} height={480} />
          <div>
            <EChart option={lorenzOption} height={220} />
            <p className="card__note">
              Lorenz curve of stake across all {DIM_LABEL[dim].toLowerCase()}s. The further
              the curve bows from the dashed diagonal, the more concentrated the flow; Gini 0
              is perfectly spread, 1 is a single {DIM_LABEL[dim].toLowerCase()} holding
              everything.
            </p>
            <p className="card__note">
              {SLIP_DIMS.includes(dim)
                ? 'Slip-level attribution: full slip stake counts once.'
                : 'Leg-level attribution: a combined slip splits its stake evenly across legs, so this column sums to headline turnover.'}
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h3 className="card__title">Top {DIM_LABEL[dim].toLowerCase()}s</h3>
          <div className="seg">
            {[25, 50, 100].map((n) => (
              <button key={n} className={`seg__btn${topN === n ? ' seg__btn--on' : ''}`} onClick={() => setTopN(n)}>
                top {n}
              </button>
            ))}
          </div>
        </div>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>{DIM_LABEL[dim]}</th>
                <th className="num">stake</th>
                <th className="num">share</th>
                <th className="num">cum.</th>
                <th className="num">GGR</th>
                <th className="num">margin</th>
                <th className="num">{SLIP_DIMS.includes(dim) ? 'slips' : 'legs'}</th>
                <th className="num">customers</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let cum = 0
                return shown.map((r, i) => {
                  cum += r.stake
                  return (
                    <tr key={r.key} className="tbl__click" onClick={() => setDrill(r)}>
                      <td className="num">{i + 1}</td>
                      <td className="conc__label">{r.label}</td>
                      <td className="num">{fmtEur(r.stake)}</td>
                      <td className="num">{dimTotal ? fmtPct((r.stake / dimTotal) * 100) : '·'}</td>
                      <td className="num">{dimTotal ? fmtPct((cum / dimTotal) * 100) : '·'}</td>
                      <td className="num" style={{ color: r.ggr >= 0 ? POS : NEG }}>
                        {fmtEur(r.ggr)}
                      </td>
                      <td className="num">{r.stake ? fmtPct((r.ggr / r.stake) * 100) : '·'}</td>
                      <td className="num">{fmtInt(r.n)}</td>
                      <td className="num">{fmtInt(r.customers)}</td>
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
        </div>
        <p className="card__note">
          Click any row to open the underlying betslip legs. Filters above apply here too, so
          this table is always consistent with the KPI header. Totals: {fmtEur(totals.stake)}{' '}
          stake across the current selection.
        </p>
      </div>

      {drill && drillData && (
        <div className="modal" onClick={() => setDrill(null)}>
          <div className="modal__box" onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h3 className="card__title">{drill.label}</h3>
              <span className="num modal__meta">
                {fmtInt(drillData.total)} legs · stake {fmtEur(drill.stake)} · GGR{' '}
                {fmtEur(drill.ggr)}
              </span>
              <button className="modal__close" onClick={() => setDrill(null)}>
                ✕
              </button>
            </div>
            <div className="tbl-scroll modal__body">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>placed (UTC)</th>
                    <th>Uid</th>
                    <th>unit</th>
                    <th>fixture</th>
                    <th>market</th>
                    <th>selection</th>
                    <th className="num">price</th>
                    <th className="num">slip stake</th>
                    <th className="num">slip GGR</th>
                    <th>type</th>
                    <th>phase</th>
                  </tr>
                </thead>
                <tbody>
                  {drillData.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="num">{fmtDateTime(r.ts)}</td>
                      <td className="num">{r.uid}</td>
                      <td>{r.unit}</td>
                      <td>{r.match}</td>
                      <td>{r.market}</td>
                      <td>{r.option}</td>
                      <td className="num">{r.price > 0 ? r.price.toFixed(2) : '·'}</td>
                      <td className="num">{fmtEur(r.slipStake)}</td>
                      <td className="num" style={{ color: r.slipGgr >= 0 ? POS : NEG }}>
                        {fmtEur(r.slipGgr)}
                      </td>
                      <td>{r.betType}</td>
                      <td>{r.phase}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {drillData.total > drillData.rows.length && (
                <p className="card__note">
                  Showing the {drillData.rows.length} largest of {fmtInt(drillData.total)} legs.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
