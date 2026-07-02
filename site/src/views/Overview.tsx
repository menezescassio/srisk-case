import { useMemo } from 'react'
import { useApp } from '../state/AppContext'
import { Kpis } from '../components/Kpis'
import { BreakdownBar } from '../components/BreakdownBar'
import { PHASE_COLORS, CHANNEL_COLORS, CAT } from '../lib/viz'
import { fmtEur, fmtInt, fmtPct } from '../lib/format'

export function Overview() {
  const { payload, store, mask } = useApp()
  const r = payload.meta.recon
  const d = payload.dims

  const byPhase = useMemo(
    () => store.groupBySlipField(mask, store.sPhase, d.phases),
    [store, mask, d.phases],
  )
  const byChannel = useMemo(
    () => store.groupBySlipField(mask, store.sChannel, d.channels),
    [store, mask, d.channels],
  )
  const byType = useMemo(
    () => store.groupBySlipField(mask, store.sBetType, d.bet_types),
    [store, mask, d.bet_types],
  )

  // competition needs leg attribution: slip -> competition of first leg's match
  const slipComp = useMemo(() => {
    const arr = new Int32Array(store.nSlips).fill(-1)
    for (let i = 0; i < store.nLegs; i++) {
      const s = store.lSlip[i]
      if (arr[s] === -1) {
        const m = store.lMatch[i]
        arr[s] = m >= 0 ? store.matchCompetition[m] : -1
      }
    }
    return arr
  }, [store])
  const byComp = useMemo(
    () => store.groupBySlipField(mask, slipComp, d.competitions).slice(0, 6),
    [store, mask, slipComp, d.competitions],
  )

  const typeColors = { SIMPLE: CAT[1], COMBINED: CAT[0] }

  return (
    <div className="view">
      <Kpis />

      <div className="grid2">
        <BreakdownBar
          title="Stake by timing phase"
          rows={byPhase}
          colors={PHASE_COLORS}
          note={`Phase is measured to the slip's first kickoff, all UTC. Post-lineups is a proxy: the final ${r.lineup_proxy_minutes} minutes before kickoff (no lineup timestamps exist in the export).`}
        />
        <BreakdownBar
          title="Stake by channel"
          rows={byChannel}
          colors={CHANNEL_COLORS}
          note="Channel is derived from the Uid format: numeric ids are online accounts, MAH-prefixed ids are retail shop accounts, TPV are point-of-sale terminals."
        />
      </div>

      <div className="grid2">
        <BreakdownBar title="Stake by bet type" rows={byType} colors={typeColors} />
        <div className="card">
          <h3 className="card__title">Top competitions</h3>
          <table className="tbl">
            <thead>
              <tr>
                <th></th>
                <th className="num">stake</th>
                <th className="num">GGR</th>
                <th className="num">margin</th>
                <th className="num">slips</th>
                <th className="num">customers</th>
              </tr>
            </thead>
            <tbody>
              {byComp.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className="num">{fmtEur(row.stake)}</td>
                  <td className="num">{fmtEur(row.ggr)}</td>
                  <td className="num">{row.stake ? fmtPct((row.ggr / row.stake) * 100) : '·'}</td>
                  <td className="num">{fmtInt(row.slips)}</td>
                  <td className="num">{fmtInt(row.customers)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="card__note">
            A slip is attributed to the competition of its first leg; cross-competition
            combined slips exist but are rare.
          </p>
        </div>
      </div>

      <ReconCard />
    </div>
  )
}

function ReconCard() {
  const { payload } = useApp()
  const r = payload.meta.recon
  const dup = r.duplicate_ambiguity

  return (
    <div className="card">
      <h3 className="card__title">Source reconciliation: two exports, one dataset</h3>
      <p className="card__lead">
        Both files were pulled on 2026-06-24, 95 seconds apart, over different betslip
        windows. They form adjacent windows with a small seam, and every number in this
        dashboard is built from their reconciled union.
      </p>
      <div className="tbl-scroll">
        <table className="tbl tbl--recon">
          <thead>
            <tr>
              <th>source</th>
              <th className="num">rows</th>
              <th className="num">raw-row turnover</th>
              <th className="num">raw-row GGR</th>
              <th>betslip window</th>
            </tr>
          </thead>
          <tbody>
            {(['A', 'B'] as const).map((k) => (
              <tr key={k}>
                <td>file {k}</td>
                <td className="num">{fmtInt(r.files[k].rows)}</td>
                <td className="num">{fmtEur(r.files[k].turnover_raw_rows)}*</td>
                <td className="num">{fmtEur(r.files[k].ggr_raw_rows)}*</td>
                <td className="num">
                  {r.files[k].betslip_min.slice(0, 10)} to {r.files[k].betslip_max.slice(0, 10)}
                </td>
              </tr>
            ))}
            <tr className="tbl__hl">
              <td>union, deduped</td>
              <td className="num">{fmtInt(r.union_rows)}</td>
              <td className="num">{fmtEur(r.raw_rows_turnover_eur)}</td>
              <td className="num">{fmtEur(r.raw_rows_ggr_eur)}</td>
              <td className="num">
                {r.betslip_min.slice(0, 10)} to {r.betslip_max.slice(0, 10)}
              </td>
            </tr>
            <tr className="tbl__hl">
              <td>slip-level (headline)</td>
              <td className="num">{fmtInt(r.slips)} slips</td>
              <td className="num">{fmtEur(r.turnover_eur)}</td>
              <td className="num">{fmtEur(r.ggr_eur)}</td>
              <td className="num">margin {fmtPct(r.margin_pct, 2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul className="recon-notes">
        <li>
          Cross-file overlap: {fmtInt(r.overlap_rows)} rows on the 06-19/20 seam;{' '}
          {fmtInt(r.settlement_conflicts)} of them carry different settlement in each file
          (GGR {fmtEur(r.conflict_ggr_before)} in A vs {fmtEur(r.conflict_ggr_after)} in B).
          The later pull wins.
        </li>
        <li>
          COMBINED rows are legs that repeat the slip's stake and GGR, so raw-row sums
          overstate turnover. Rolling up to slips removes {fmtEur(r.raw_rows_turnover_eur - r.turnover_eur)}{' '}
          of phantom turnover: this is the material dedup correction.
        </li>
        <li>
          Exact duplicate rows across the union: {fmtInt(dup.exact_dup_rows)}{' '}
          ({fmtInt(dup.exact_dup_rows_combined)} combined legs, {fmtInt(dup.exact_dup_rows_simple)} simple).
          With no betslip id in the export, identical same-second slips cannot be told apart;
          the ambiguity is quantified, not hidden.
        </li>
        <li>
          FX fixed as of {r.fx.as_of}: PEN {(1 / r.fx.rates_to_eur.PEN).toFixed(2)} and USD{' '}
          {(1 / r.fx.rates_to_eur.USD).toFixed(3)} per EUR; {fmtInt(r.currency_rows_inferred)}{' '}
          null-currency rows inferred from unit geography.
        </li>
        <li>
          Analysis window starts {r.betslip_min.slice(0, 10)}: {fmtInt(r.excluded_pretournament.rows)}{' '}
          sparse pre-tournament test bets ({fmtEur(r.excluded_pretournament.stake_eur)}, about 0.02% of
          turnover, on non-World-Cup fixtures) are excluded so the dashboard, findings and PDF describe
          the same clean window.
        </li>
      </ul>
      <p className="card__note">
        * File A and B raw sums are in mixed original currencies; union figures are EUR.
      </p>
    </div>
  )
}
