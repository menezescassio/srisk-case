import type { Store } from './store'

/** Time-series computation over the filtered slip mask. */

export type Metric = 'turnover' | 'ggr' | 'slips' | 'avg_stake' | 'customers'
export type SplitBy = 'none' | 'phase' | 'channel' | 'bet_type'

export const METRIC_LABEL: Record<Metric, string> = {
  turnover: 'Turnover (EUR)',
  ggr: 'GGR (EUR)',
  slips: 'Betslips',
  avg_stake: 'Avg stake (EUR)',
  customers: 'Unique customers',
}

export interface TimeSeries {
  buckets: number[] // epoch seconds, bucket start
  series: { name: string; values: number[] }[]
  totals: number[]
}

function splitField(store: Store, by: SplitBy): { field: ArrayLike<number>; labels: readonly string[] } | null {
  if (by === 'phase') return { field: store.sPhase, labels: store.p.dims.phases }
  if (by === 'channel') return { field: store.sChannel, labels: store.p.dims.channels }
  if (by === 'bet_type') return { field: store.sBetType, labels: store.p.dims.bet_types }
  return null
}

export function timeSeries(
  store: Store,
  mask: Uint8Array,
  metric: Metric,
  by: SplitBy,
  bucketSec: number,
): TimeSeries {
  // bucket range from masked data
  let tMin = Infinity
  let tMax = -Infinity
  for (let i = 0; i < store.nSlips; i++) {
    if (!mask[i]) continue
    const t = store.sTs[i]
    if (t < tMin) tMin = t
    if (t > tMax) tMax = t
  }
  if (!isFinite(tMin)) return { buckets: [], series: [], totals: [] }

  const b0 = Math.floor(tMin / bucketSec) * bucketSec
  const nB = Math.floor((tMax - b0) / bucketSec) + 1
  const buckets = Array.from({ length: nB }, (_, k) => b0 + k * bucketSec)

  const split = splitField(store, by)
  const groups = split ? split.labels.length : 1

  const stake = Array.from({ length: groups }, () => new Float64Array(nB))
  const ggr = Array.from({ length: groups }, () => new Float64Array(nB))
  const count = Array.from({ length: groups }, () => new Float64Array(nB))
  const uidSets: Map<number, Set<number>>[] = Array.from({ length: groups }, () => new Map())

  const needUids = metric === 'customers'
  for (let i = 0; i < store.nSlips; i++) {
    if (!mask[i]) continue
    const k = Math.floor((store.sTs[i] - b0) / bucketSec)
    const g = split ? (split.field[i] as number) : 0
    stake[g][k] += store.sStake[i]
    ggr[g][k] += store.sGgr[i]
    count[g][k]++
    if (needUids) {
      let s = uidSets[g].get(k)
      if (!s) {
        s = new Set()
        uidSets[g].set(k, s)
      }
      s.add(store.sUid[i])
    }
  }

  const value = (g: number, k: number): number => {
    switch (metric) {
      case 'turnover':
        return stake[g][k]
      case 'ggr':
        return ggr[g][k]
      case 'slips':
        return count[g][k]
      case 'avg_stake':
        return count[g][k] ? stake[g][k] / count[g][k] : 0
      case 'customers':
        return uidSets[g].get(k)?.size ?? 0
    }
  }

  const series = (split ? split.labels : ['total']).map((name, g) => ({
    name,
    values: buckets.map((_, k) => round2(value(g, k))),
  }))
  // drop empty groups
  const kept = series.filter((s) => s.values.some((v) => v !== 0))

  const totals = buckets.map((_, k) => {
    let acc = 0
    for (let g = 0; g < groups; g++) acc += value(g, k)
    return round2(acc)
  })
  return { buckets, series: kept, totals }
}

const round2 = (v: number) => Math.round(v * 100) / 100

/** Slips (indices) with at least one leg on the given fixture group, within mask. */
export function slipsForFixture(store: Store, mask: Uint8Array, groupIdx: number): Uint8Array {
  const out = new Uint8Array(store.nSlips)
  for (let i = 0; i < store.nLegs; i++) {
    const m = store.lMatch[i]
    if (m < 0 || store.matchGroupOf[m] !== groupIdx) continue
    const s = store.lSlip[i]
    if (mask[s]) out[s] = 1
  }
  return out
}

export interface FixtureRow {
  matchIdx: number
  name: string
  competition: string
  kickoff: number
  slips: number
  stake: number
  ggr: number
  customers: number
  inplayShare: number
}

export function fixtureTable(store: Store, mask: Uint8Array): FixtureRow[] {
  const nG = store.fixtureGroups.length
  const stake = new Float64Array(nG)
  const ggr = new Float64Array(nG)
  const slipsN = new Int32Array(nG)
  const inplay = new Float64Array(nG)
  const uidSets: Set<number>[] = Array.from({ length: nG }, () => new Set())

  // attribute each slip once per touched fixture group (legs of a slip are
  // not guaranteed contiguous after the union, so dedup by slip-group key)
  const seen = new Set<number>()
  for (let i = 0; i < store.nLegs; i++) {
    const s = store.lSlip[i]
    if (!mask[s]) continue
    const m = store.lMatch[i]
    if (m < 0) continue
    const g = store.matchGroupOf[m]
    const key = s * nG + g
    if (seen.has(key)) continue
    seen.add(key)
    stake[g] += store.sStake[s]
    ggr[g] += store.sGgr[s]
    slipsN[g]++
    uidSets[g].add(store.sUid[s])
    if (store.sPhase[s] === 3) inplay[g] += store.sStake[s]
  }

  const rows: FixtureRow[] = []
  const d = store.p.dims
  for (let g = 0; g < nG; g++) {
    if (!slipsN[g]) continue
    const grp = store.fixtureGroups[g]
    rows.push({
      matchIdx: g,
      name: grp.name,
      competition: d.competitions[grp.competition] ?? '',
      kickoff: grp.kickoff,
      slips: slipsN[g],
      stake: stake[g],
      ggr: ggr[g],
      customers: uidSets[g].size,
      inplayShare: stake[g] ? inplay[g] / stake[g] : 0,
    })
  }
  rows.sort((a, b) => b.stake - a.stake)
  return rows
}

/** Stake by time-to-kickoff buckets for one fixture (stacked by phase). */
export function fixtureFlow(
  store: Store,
  fixtureSlips: Uint8Array,
  kickoff: number,
  binMin = 30,
  fromMin = -4320,
  toMin = 150,
): { bins: number[]; byPhase: { name: string; values: number[] }[] } {
  const nBins = Math.ceil((toMin - fromMin) / binMin)
  const bins = Array.from({ length: nBins }, (_, k) => fromMin + k * binMin)
  const phases = store.p.dims.phases
  const acc = phases.map(() => new Float64Array(nBins))
  for (let i = 0; i < store.nSlips; i++) {
    if (!fixtureSlips[i]) continue
    const rel = (store.sTs[i] - kickoff) / 60 // minutes relative to KO
    if (rel < fromMin || rel >= toMin) continue
    const k = Math.floor((rel - fromMin) / binMin)
    acc[store.sPhase[i]][k] += store.sStake[i]
  }
  return {
    bins,
    byPhase: phases
      .map((name, g) => ({ name, values: Array.from(acc[g], round2) }))
      .filter((s) => s.values.some((v) => v !== 0)),
  }
}
