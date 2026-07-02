import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext'
import { Kpis } from '../components/Kpis'
import { EChart, CHART_TEXT, TOOLTIP_STYLE } from '../components/EChart'
import {
  timeSeries,
  fixtureTable,
  fixtureFlow,
  slipsForFixture,
  METRIC_LABEL,
  type Metric,
  type SplitBy,
} from '../lib/series'
import { CAT, PHASE_COLORS, CHANNEL_COLORS, POS, NEG, GRID_LINE } from '../lib/viz'
import { fmtEur, fmtEurCompact, fmtInt, fmtPct, fmtDateTime } from '../lib/format'

const SPLIT_COLORS: Record<SplitBy, Record<string, string> | null> = {
  none: null,
  phase: PHASE_COLORS,
  channel: CHANNEL_COLORS,
  bet_type: { SIMPLE: CAT[1], COMBINED: CAT[0] },
}

export function Flow() {
  const { store, mask } = useApp()
  const [metric, setMetric] = useState<Metric>('turnover')
  const [split, setSplit] = useState<SplitBy>('phase')
  const [hourly, setHourly] = useState(false)
  const [fixture, setFixture] = useState<number | null>(null)
  const [fxQuery, setFxQuery] = useState('')

  const ts = useMemo(
    () => timeSeries(store, mask, metric, split, hourly ? 3600 : 86400),
    [store, mask, metric, split, hourly],
  )

  const ggrDaily = useMemo(
    () => timeSeries(store, mask, 'ggr', 'none', 86400),
    [store, mask],
  )

  const fixtures = useMemo(() => fixtureTable(store, mask), [store, mask])
  const shownFixtures = useMemo(
    () =>
      (fxQuery
        ? fixtures.filter((f) => f.name.toLowerCase().includes(fxQuery.toLowerCase()))
        : fixtures
      ).slice(0, 15),
    [fixtures, fxQuery],
  )

  const colors = SPLIT_COLORS[split]
  const stackable = split !== 'none' && metric !== 'avg_stake' && metric !== 'customers'

  const mainOption = useMemo(() => {
    const x = ts.buckets.map((b) => b * 1000)
    return {
      textStyle: CHART_TEXT,
      grid: { left: 58, right: 16, top: 30, bottom: 56 },
      tooltip: {
        trigger: 'axis',
        ...TOOLTIP_STYLE,
        valueFormatter: (v: number) =>
          metric === 'slips' || metric === 'customers' ? fmtInt(v) : fmtEurCompact(v),
      },
      legend:
        ts.series.length > 1
          ? { top: 0, textStyle: { ...CHART_TEXT, color: '#a8b0b9' }, icon: 'roundRect', itemWidth: 10, itemHeight: 10 }
          : undefined,
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: GRID_LINE } },
        axisLabel: { ...CHART_TEXT, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { ...CHART_TEXT, formatter: (v: number) => (metric === 'slips' || metric === 'customers' ? fmtInt(v) : fmtEurCompact(v)) },
        splitLine: { lineStyle: { color: GRID_LINE } },
      },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 8, borderColor: GRID_LINE, backgroundColor: 'transparent', fillerColor: 'rgba(161,124,82,0.15)', handleStyle: { color: '#BA7F3B' }, textStyle: CHART_TEXT }],
      series: ts.series.map((s, i) => ({
        name: s.name,
        type: 'line',
        stack: stackable ? 'total' : undefined,
        areaStyle: stackable ? { opacity: 0.55 } : undefined,
        showSymbol: false,
        lineStyle: { width: 2 },
        emphasis: { focus: 'series' },
        color: colors?.[s.name] ?? CAT[i % CAT.length],
        data: s.values.map((v, k) => [x[k], v]),
      })),
    }
  }, [ts, metric, stackable, colors])

  const ggrOption = useMemo(() => {
    const x = ggrDaily.buckets.map((b) => b * 1000)
    return {
      textStyle: CHART_TEXT,
      grid: { left: 58, right: 16, top: 10, bottom: 44 },
      tooltip: { trigger: 'axis', ...TOOLTIP_STYLE, valueFormatter: (v: number) => fmtEurCompact(v) },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: GRID_LINE } },
        axisLabel: { ...CHART_TEXT, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { ...CHART_TEXT, formatter: fmtEurCompact },
        splitLine: { lineStyle: { color: GRID_LINE } },
      },
      // its own independent range slider (not linked to the Betflow chart)
      dataZoom: [
        { type: 'inside' },
        { type: 'slider', height: 16, bottom: 6, borderColor: GRID_LINE, backgroundColor: 'transparent', fillerColor: 'rgba(161,124,82,0.15)', handleStyle: { color: '#BA7F3B' }, textStyle: CHART_TEXT },
      ],
      series: [
        {
          name: 'GGR',
          type: 'bar',
          barMaxWidth: 10,
          itemStyle: {
            borderRadius: [3, 3, 0, 0],
            color: (p: { value: [number, number] }) => (p.value[1] >= 0 ? POS : NEG),
          },
          data: ggrDaily.totals.map((v, k) => [x[k], v]),
        },
      ],
    }
  }, [ggrDaily])

  const fixtureDetail = useMemo(() => {
    if (fixture === null) return null
    const fxSlips = slipsForFixture(store, mask, fixture)
    const kickoff = store.fixtureGroups[fixture].kickoff
    const flow = fixtureFlow(store, fxSlips, kickoff)
    let stake = 0
    let ggr = 0
    let slips = 0
    const uids = new Set<number>()
    for (let i = 0; i < store.nSlips; i++) {
      if (!fxSlips[i]) continue
      stake += store.sStake[i]
      ggr += store.sGgr[i]
      slips++
      uids.add(store.sUid[i])
    }
    return { flow, kickoff, stake, ggr, slips, customers: uids.size }
  }, [store, mask, fixture])

  const fxOption = useMemo(() => {
    if (!fixtureDetail) return null
    const { flow } = fixtureDetail
    return {
      textStyle: CHART_TEXT,
      grid: { left: 58, right: 16, top: 30, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        ...TOOLTIP_STYLE,
        valueFormatter: (v: number) => fmtEurCompact(v),
      },
      legend: { top: 0, textStyle: { ...CHART_TEXT, color: '#a8b0b9' }, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
      xAxis: {
        type: 'category',
        data: flow.bins.map((m) => (m < 0 ? `-${Math.abs(m / 60).toFixed(1)}h` : `+${(m / 60).toFixed(1)}h`)),
        axisLine: { lineStyle: { color: GRID_LINE } },
        axisLabel: { ...CHART_TEXT, interval: 7 },
        name: 'time to kickoff',
        nameLocation: 'middle',
        nameGap: 26,
        nameTextStyle: CHART_TEXT,
      },
      yAxis: {
        type: 'value',
        axisLabel: { ...CHART_TEXT, formatter: fmtEurCompact },
        splitLine: { lineStyle: { color: GRID_LINE } },
      },
      series: flow.byPhase.map((s) => ({
        name: s.name,
        type: 'bar',
        stack: 'total',
        barCategoryGap: '25%',
        itemStyle: { color: PHASE_COLORS[s.name], borderRadius: [2, 2, 0, 0] },
        data: s.values,
      })),
    }
  }, [fixtureDetail])

  return (
    <div className="view">
      <Kpis />

      <div className="card">
        <div className="card__head">
          <h3 className="card__title">Betflow over time</h3>
          <div className="seg">
            {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
              <button key={m} className={`seg__btn${metric === m ? ' seg__btn--on' : ''}`} onClick={() => setMetric(m)}>
                {METRIC_LABEL[m].split(' (')[0]}
              </button>
            ))}
          </div>
          <div className="seg">
            {(['none', 'phase', 'channel', 'bet_type'] as SplitBy[]).map((s) => (
              <button key={s} className={`seg__btn${split === s ? ' seg__btn--on' : ''}`} onClick={() => setSplit(s)}>
                {s === 'none' ? 'total' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="seg">
            <button className={`seg__btn${!hourly ? ' seg__btn--on' : ''}`} onClick={() => setHourly(false)}>
              daily
            </button>
            <button className={`seg__btn${hourly ? ' seg__btn--on' : ''}`} onClick={() => setHourly(true)}>
              hourly
            </button>
          </div>
        </div>
        <EChart option={mainOption} height={340} />
        <p className="card__note">
          {METRIC_LABEL[metric]}, {hourly ? 'hourly' : 'daily'} buckets, respecting the
          global filters. Drag the slider or scroll to zoom; the tournament starts 2026-06-11.
        </p>
      </div>

      <div className="card">
        <h3 className="card__title">Daily GGR (operator view)</h3>
        <EChart option={ggrOption} height={215} />
        <p className="card__note">
          Green days the book won, red days customers won. This chart has its own range
          slider, independent of the one above. Settlement is as of the later export (2026-06-24).
        </p>
      </div>

      <div className="card">
        <div className="card__head">
          <h3 className="card__title">Fixture drill-down</h3>
          <input
            className="msel__search num"
            placeholder="search fixture"
            value={fxQuery}
            onChange={(e) => setFxQuery(e.target.value)}
            style={{ maxWidth: 220 }}
          />
        </div>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>fixture</th>
                <th>kickoff (UTC)</th>
                <th className="num">stake</th>
                <th className="num">GGR</th>
                <th className="num">margin</th>
                <th className="num">slips</th>
                <th className="num">customers</th>
                <th className="num">in-play %</th>
              </tr>
            </thead>
            <tbody>
              {shownFixtures.map((f) => (
                <tr
                  key={f.matchIdx}
                  className={`tbl__click${fixture === f.matchIdx ? ' tbl__sel' : ''}`}
                  onClick={() => setFixture(fixture === f.matchIdx ? null : f.matchIdx)}
                >
                  <td>{f.name}</td>
                  <td className="num">{f.kickoff > 0 ? fmtDateTime(f.kickoff).slice(0, 16) : '·'}</td>
                  <td className="num">{fmtEur(f.stake)}</td>
                  <td className="num">{fmtEur(f.ggr)}</td>
                  <td className="num">{f.stake ? fmtPct((f.ggr / f.stake) * 100) : '·'}</td>
                  <td className="num">{fmtInt(f.slips)}</td>
                  <td className="num">{fmtInt(f.customers)}</td>
                  <td className="num">{fmtPct(f.inplayShare * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card__note">
          Top 15 by stake within the current filters; click a fixture to open its betflow
          around kickoff. A slip touching several fixtures counts once per fixture, so this
          table's stake column can exceed headline turnover by design.
        </p>
        {fixtureDetail && fxOption && fixture !== null && (
          <div className="fxdetail">
            <div className="fxdetail__kpis num">
              <span>{store.fixtureGroups[fixture].name}</span>
              <span>stake {fmtEur(fixtureDetail.stake)}</span>
              <span>GGR {fmtEur(fixtureDetail.ggr)}</span>
              <span>{fmtInt(fixtureDetail.slips)} slips</span>
              <span>{fmtInt(fixtureDetail.customers)} customers</span>
              <span>KO {fmtDateTime(fixtureDetail.kickoff)}</span>
            </div>
            <EChart option={fxOption} height={260} />
            <p className="card__note">
              Stake per 30-minute bucket relative to kickoff (last 3 days shown), colored by
              timing phase. The post-lineups bar is the final 60 minutes (about 1h before kickoff).
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
