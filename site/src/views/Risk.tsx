import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext'
import { EChart, CHART_TEXT, TOOLTIP_STYLE } from '../components/EChart'
import { drillRows, type DrillLeg } from '../lib/concentration'
import type { Anomaly, AnomalyType, WatchlistEntry } from '../lib/payload'
import { CAT, GRID_LINE, POS, NEG, NEUTRAL } from '../lib/viz'
import { fmtEur, fmtEur2, fmtInt, fmtPct, fmtDateTime } from '../lib/format'

const ANOMALY_META: Record<AnomalyType, { label: string; blurb: string }> = {
  price_drift: {
    label: 'Price movement',
    blurb:
      'Selections whose struck price moved 25% or more across this client\'s own pre-kickoff flow. Steamed in = later customers accepted a shorter price than early ones.',
  },
  repeated_support: {
    label: 'Repeated support',
    blurb:
      'One selection backed by an unusual number of distinct customers and a large share of its fixture\'s analyzable pre-kickoff stake.',
  },
  exposure: {
    label: 'Single-selection exposure',
    blurb: 'Largest potential payouts concentrated on a single selection before kickoff.',
  },
  negative_pocket: {
    label: 'Negative-margin pockets',
    blurb: 'Market and competition cells where this client is structurally losing.',
  },
  turnover_spike: {
    label: 'Turnover spikes',
    blurb:
      "Days whose turnover jumps 3+ robust deviations above the trailing 7-day baseline. The first flag is the tournament onset surge; later ones are days that broke their local trend. Each names the fixture that drove it (open it in the Betflow tab).",
  },
}

export function Risk() {
  const { store, payload } = useApp()
  const risk = payload.risk
  const [expanded, setExpanded] = useState<string | null>(null)
  const [evidence, setEvidence] = useState<{ title: string; dim: 'uid' | 'selection'; key: string } | null>(null)
  const [anomalyTab, setAnomalyTab] = useState<AnomalyType>('price_drift')

  const fullMask = useMemo(() => new Uint8Array(store.nSlips).fill(1), [store])

  const evidenceData = useMemo(() => {
    if (!evidence) return null
    return drillRows(store, fullMask, evidence.dim, evidence.key)
  }, [store, fullMask, evidence])

  const priceScatter = useMemo(() => {
    if (!evidence || evidence.dim !== 'selection') return null
    return buildPriceScatter(store, evidence.key)
  }, [store, evidence])

  const a = risk.assumptions
  const w = a.weights

  return (
    <div className="view">
      <div className="card card--warn">
        <h3 className="card__title">Read this first: what these scores are, and are not</h3>
        <p className="card__lead">
          No odds history or settlement detail exists in the export. "Proxy CLV" compares a
          customer's struck price with the last struck price on the same selection inside this
          client's own flow before kickoff; it is an internal movement proxy, not true closing
          line value. Scores rank behavior that merits trader review; they are not verdicts on
          any customer. Scores are computed by the pipeline over the full window and do not
          respond to the filter bar.
        </p>
        <p className="card__note num">
          Eligibility: {fmtInt(a.uid_min_slips)}+ slips and €{a.uid_min_stake_eur}+ staked
          ({fmtInt(a.eligible_customers)} of {fmtInt(store.p.dims.uids.length)} customers qualify) ·
          score = {Math.round(w.clv * 100)}% proxy CLV + {Math.round(w.win * 100)}% winnings +{' '}
          {Math.round(w.lineup * 100)}% post-lineups timing + {Math.round(w.stake * 100)}% stake
          size + {Math.round(w.focus * 100)}% market focus, each as a percentile among eligible
          customers · CLV needs {a.uid_min_clv_legs}+ analyzable legs, else that component is
          neutral (0.5)
        </p>
      </div>

      <div className="card">
        <h3 className="card__title">Watchlist: customers meriting trader review</h3>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Uid</th>
                <th className="num">score</th>
                <th>components</th>
                <th className="num">staked</th>
                <th className="num">GGR</th>
                <th className="num">cust. margin</th>
                <th className="num">proxy CLV</th>
                <th className="num">post-lineups</th>
                <th>focus</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {risk.watchlist.map((e, i) => (
                <WatchRow
                  key={e.uid}
                  entry={e}
                  rank={i + 1}
                  expanded={expanded === e.uid}
                  onToggle={() => setExpanded(expanded === e.uid ? null : e.uid)}
                  onEvidence={() => setEvidence({ title: `Uid ${e.uid}: all legs`, dim: 'uid', key: e.uid })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h3 className="card__title">Anomalies</h3>
          <div className="seg seg--wrap">
            {(Object.keys(ANOMALY_META) as AnomalyType[]).map((t) => {
              const n = risk.anomalies.filter((x) => x.type === t).length
              return (
                <button key={t} className={`seg__btn${anomalyTab === t ? ' seg__btn--on' : ''}`} onClick={() => setAnomalyTab(t)}>
                  {ANOMALY_META[t].label} ({n})
                </button>
              )
            })}
          </div>
        </div>
        <p className="card__note" style={{ marginTop: 0, marginBottom: 12 }}>
          {ANOMALY_META[anomalyTab].blurb} Every flag links to its underlying rows.
        </p>
        <div className="anomalies">
          {risk.anomalies
            .filter((x) => x.type === anomalyTab)
            .map((an, i) => (
              <AnomalyCard
                key={i}
                a={an}
                onOpen={
                  an.sel_key
                    ? () => setEvidence({ title: an.title, dim: 'selection', key: an.sel_key! })
                    : undefined
                }
              />
            ))}
        </div>
      </div>

      {evidence && evidenceData && (
        <div className="modal" onClick={() => setEvidence(null)}>
          <div className="modal__box" onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h3 className="card__title">{evidence.title}</h3>
              <span className="num modal__meta">{fmtInt(evidenceData.total)} legs</span>
              <button className="modal__close" onClick={() => setEvidence(null)}>
                ✕
              </button>
            </div>
            {priceScatter && (
              <div style={{ marginBottom: 10 }}>
                <EChart option={priceScatter} height={220} />
                <p className="card__note">
                  Each dot is one struck price; the dashed vertical line is kickoff, the dashed
                  horizontal line is the last pre-kickoff price (the proxy reference).
                </p>
              </div>
            )}
            <div className="tbl-scroll modal__body">
              <EvidenceTable rows={evidenceData.rows} />
              {evidenceData.total > evidenceData.rows.length && (
                <p className="card__note">
                  Showing the {evidenceData.rows.length} largest of {fmtInt(evidenceData.total)} legs.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WatchRow({
  entry: e,
  rank,
  expanded,
  onToggle,
  onEvidence,
}: {
  entry: WatchlistEntry
  rank: number
  expanded: boolean
  onToggle: () => void
  onEvidence: () => void
}) {
  const comp = e.components
  const bars: [string, number, string][] = [
    ['CLV', comp.clv, CAT[0]],
    ['win', comp.win, CAT[1]],
    ['timing', comp.lineup, CAT[2]],
    ['stake', comp.stake, CAT[3]],
    ['focus', comp.focus, CAT[4]],
  ]
  return (
    <>
      <tr className="tbl__click" onClick={onToggle}>
        <td className="num">{rank}</td>
        <td className="num">{e.uid}</td>
        <td className="num">
          <strong>{e.score.toFixed(1)}</strong>
        </td>
        <td>
          <div className="cbars" title="component percentiles: CLV, winnings, timing, stake, focus">
            {bars.map(([label, v, color]) => (
              <div key={label} className="cbars__col">
                <div className="cbars__fill" style={{ height: `${Math.round(v * 100)}%`, background: color }} />
              </div>
            ))}
          </div>
        </td>
        <td className="num">{fmtEur(e.stake)}</td>
        <td className="num" style={{ color: e.ggr >= 0 ? POS : NEG }}>
          {fmtEur(e.ggr)}
        </td>
        <td className="num">{fmtPct(e.customer_margin_pct)}</td>
        <td className="num">{e.clv_pct === null ? 'n/a' : fmtPct(e.clv_pct, 2)}</td>
        <td className="num">{fmtPct(e.lineup_share_pct)}</td>
        <td>
          {e.top_group} <span className="dim">({fmtPct(e.top_group_share_pct, 0)})</span>
        </td>
        <td className="num">{expanded ? '▴' : '▾'}</td>
      </tr>
      {expanded && (
        <tr className="tbl__expand">
          <td colSpan={11}>
            <div className="wexp">
              <div className="wexp__facts num">
                <span>{fmtInt(e.slips)} slips</span>
                <span>avg stake {fmtEur2(e.avg_stake)}</span>
                <span>win rate {fmtPct(e.win_rate_pct)} of slips</span>
                <span>in-play {fmtPct(e.inplay_share_pct)} of stake</span>
                <span>channel {e.channel}</span>
                <span>
                  proxy CLV {e.clv_pct === null ? `insufficient legs (${e.clv_legs})` : `${fmtPct(e.clv_pct, 2)} over ${e.clv_legs} legs`}
                </span>
              </div>
              <p className="card__note">
                Why flagged: {describeWhy(e)}
              </p>
              <button className="wexp__btn" onClick={(ev) => { ev.stopPropagation(); onEvidence() }}>
                Open all legs for this Uid
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function describeWhy(e: WatchlistEntry): string {
  const parts: string[] = []
  if (e.components.clv >= 0.85 && e.clv_pct !== null)
    parts.push(`consistently beat this flow's own late prices (proxy CLV ${fmtPct(e.clv_pct, 1)})`)
  if (e.components.win >= 0.85)
    parts.push(`took ${fmtEur(-e.ggr)} off the book (${fmtPct(e.customer_margin_pct)} of staked)`)
  if (e.components.lineup >= 0.85)
    parts.push(`concentrates ${fmtPct(e.lineup_share_pct)} of stake in the post-lineups window`)
  if (e.components.stake >= 0.85) parts.push(`stakes big for this book (avg ${fmtEur2(e.avg_stake)})`)
  if (e.components.focus >= 0.85)
    parts.push(`specialist: ${fmtPct(e.top_group_share_pct, 0)} of stake in ${e.top_group}`)
  if (!parts.length) parts.push('high combined percentile across all five components')
  return parts.join('; ') + '.'
}

function AnomalyCard({ a, onOpen }: { a: Anomaly; onOpen?: () => void }) {
  return (
    <div className={`anom${onOpen ? ' anom--click' : ''}`} onClick={onOpen}>
      <div className="anom__title">{a.title}</div>
      <div className="anom__detail">{a.detail}</div>
      <div className="anom__meta num">
        <span>stake {fmtEur(a.stake)}</span>
        <span style={{ color: a.ggr >= 0 ? POS : NEG }}>GGR {fmtEur(a.ggr)}</span>
        <span>{fmtInt(a.n_uids)} customers</span>
        {onOpen && <span className="anom__open">open rows →</span>}
      </div>
    </div>
  )
}

function EvidenceTable({ rows }: { rows: DrillLeg[] }) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>placed (UTC)</th>
          <th>Uid</th>
          <th>fixture</th>
          <th>market</th>
          <th>selection</th>
          <th className="num">price</th>
          <th className="num">slip stake</th>
          <th className="num">slip GGR</th>
          <th>phase</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="num">{fmtDateTime(r.ts)}</td>
            <td className="num">{r.uid}</td>
            <td>{r.match}</td>
            <td>{r.market}</td>
            <td>{r.option}</td>
            <td className="num">{r.price > 0 ? r.price.toFixed(2) : '·'}</td>
            <td className="num">{fmtEur(r.slipStake)}</td>
            <td className="num" style={{ color: r.slipGgr >= 0 ? POS : NEG }}>
              {fmtEur(r.slipGgr)}
            </td>
            <td>{r.phase}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function buildPriceScatter(store: ReturnType<typeof useApp>['store'], selKey: string) {
  const d = store.p.dims
  const pts: [number, number][] = []
  let kickoff = -1
  for (let i = 0; i < store.nLegs; i++) {
    const m = store.lMatch[i]
    const matchName = m >= 0 ? d.matches.name[m] : '?'
    const key = `${matchName} · ${d.markets.name[store.lMarket[i]]} · ${d.options[store.lOption[i]]}`
    if (key !== selKey) continue
    if (store.lPrice[i] > 1.01) pts.push([store.lTs[i] * 1000, store.lPrice[i]])
    if (m >= 0) kickoff = store.p.dims.matches.kickoff[m] * 1000
  }
  if (!pts.length) return null
  pts.sort((a, b) => a[0] - b[0])
  const preKo = pts.filter((p) => kickoff < 0 || p[0] < kickoff)
  const ref = preKo.length ? preKo[preKo.length - 1][1] : null
  return {
    textStyle: CHART_TEXT,
    grid: { left: 48, right: 16, top: 12, bottom: 26 },
    tooltip: {
      trigger: 'item',
      ...TOOLTIP_STYLE,
      formatter: (p: { value: [number, number] }) =>
        `${fmtDateTime(p.value[0] / 1000)}<br/>price ${p.value[1].toFixed(2)}`,
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: GRID_LINE } },
      axisLabel: { ...CHART_TEXT, hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: CHART_TEXT,
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    series: [
      {
        type: 'scatter',
        symbolSize: 8,
        itemStyle: { color: CAT[0], opacity: 0.75 },
        data: pts,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: NEUTRAL },
          label: { ...CHART_TEXT, formatter: ({ name }: { name: string }) => name },
          data: [
            ...(kickoff > 0 ? [{ xAxis: kickoff, name: 'KO' }] : []),
            ...(ref !== null ? [{ yAxis: ref, name: `ref ${ref.toFixed(2)}` }] : []),
          ],
        },
      },
    ],
  }
}
