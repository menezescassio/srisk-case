import type { Store } from './store'

/** Concentration analysis: share of money by dimension, with drill to rows.
 *
 * Attribution rule (stated in the UI): dimensions that live on slips
 * (customer, unit, channel, bet type) use full slip stake. Dimensions that
 * live on legs (market, team, player, selection, line) split a combined
 * slip's money evenly across its legs so the column still sums to headline
 * turnover.
 */

export type Dim =
  | 'uid'
  | 'unit'
  | 'channel'
  | 'bet_type'
  | 'competition'
  | 'market_group'
  | 'market'
  | 'team'
  | 'player'
  | 'selection'
  | 'line'

export const DIM_LABEL: Record<Dim, string> = {
  uid: 'Customer (Uid)',
  unit: 'Management unit',
  channel: 'Channel',
  bet_type: 'Bet type',
  competition: 'Competition',
  market_group: 'Market group',
  market: 'Market',
  team: 'Team',
  player: 'Player',
  selection: 'Selection',
  line: 'Market line',
}

export const SLIP_DIMS: Dim[] = ['uid', 'unit', 'channel', 'bet_type']

export interface ConcRow {
  key: string
  label: string
  stake: number
  ggr: number
  n: number // slips (slip dims) or legs (leg dims)
  customers: number
}

interface Acc {
  stake: number
  ggr: number
  n: number
  uids: Set<number>
}

function acc(map: Map<string, Acc>, key: string): Acc {
  let a = map.get(key)
  if (!a) {
    a = { stake: 0, ggr: 0, n: 0, uids: new Set() }
    map.set(key, a)
  }
  return a
}

export function concentrate(store: Store, mask: Uint8Array, dim: Dim): ConcRow[] {
  const d = store.p.dims
  const map = new Map<string, Acc>()

  if (SLIP_DIMS.includes(dim)) {
    for (let i = 0; i < store.nSlips; i++) {
      if (!mask[i]) continue
      let key: string
      switch (dim) {
        case 'uid':
          key = d.uids[store.sUid[i]]
          break
        case 'unit':
          key = d.units[store.sUnit[i]]
          break
        case 'channel':
          key = d.channels[store.sChannel[i]]
          break
        default:
          key = d.bet_types[store.sBetType[i]]
      }
      const a = acc(map, key)
      a.stake += store.sStake[i]
      a.ggr += store.sGgr[i]
      a.n++
      a.uids.add(store.sUid[i])
    }
  } else {
    for (let i = 0; i < store.nLegs; i++) {
      const s = store.lSlip[i]
      if (!mask[s]) continue
      let key: string | null = null
      switch (dim) {
        case 'competition': {
          const m = store.lMatch[i]
          key = m >= 0 ? d.competitions[store.matchCompetition[m]] : null
          break
        }
        case 'market_group':
          key = d.markets.group[store.lMarket[i]]
          break
        case 'market':
          key = d.markets.name[store.lMarket[i]]
          break
        case 'team': {
          const t = d.teams[store.lTeam[i]]
          key = t || null
          break
        }
        case 'player': {
          const pl = d.players[store.lPlayer[i]]
          key = pl || null
          break
        }
        case 'selection': {
          const m = store.lMatch[i]
          const match = m >= 0 ? d.matches.name[m] : '?'
          key = `${match} · ${d.markets.name[store.lMarket[i]]} · ${d.options[store.lOption[i]]}`
          break
        }
        case 'line': {
          const line = store.lLine[i]
          if (line < 0) break
          key = `${d.markets.name[store.lMarket[i]]} @ ${line}`
          break
        }
      }
      if (key === null || key === undefined) continue
      const a = acc(map, key)
      a.stake += store.legStakeAttr[i]
      a.ggr += store.legGgrAttr[i]
      a.n++
      a.uids.add(store.sUid[s])
    }
  }

  const rows: ConcRow[] = []
  for (const [key, a] of map) {
    rows.push({ key, label: key, stake: a.stake, ggr: a.ggr, n: a.n, customers: a.uids.size })
  }
  rows.sort((a, b) => b.stake - a.stake)
  return rows
}

/** Lorenz curve points + Gini for the stake distribution across rows. */
export function lorenz(values: number[]): { x: number[]; y: number[]; gini: number } {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b)
  const n = v.length
  if (!n) return { x: [0, 1], y: [0, 1], gini: 0 }
  const total = v.reduce((a, b) => a + b, 0)
  const x = [0]
  const y = [0]
  let cum = 0
  // sample at most ~200 points to keep the chart light
  const step = Math.max(1, Math.floor(n / 200))
  for (let i = 0; i < n; i++) {
    cum += v[i]
    if (i % step === 0 || i === n - 1) {
      x.push((i + 1) / n)
      y.push(cum / total)
    }
  }
  // gini via exact formula on sorted values
  let s = 0
  for (let i = 0; i < n; i++) s += (2 * (i + 1) - n - 1) * v[i]
  const gini = s / (n * total)
  return { x, y, gini }
}

export interface DrillLeg {
  ts: number
  uid: string
  unit: string
  match: string
  market: string
  option: string
  price: number
  slipStake: number
  slipGgr: number
  phase: string
  betType: string
}

/** Raw legs behind one concentration row (evidence), capped. */
export function drillRows(
  store: Store,
  mask: Uint8Array,
  dim: Dim,
  key: string,
  cap = 400,
): { rows: DrillLeg[]; total: number } {
  const d = store.p.dims
  const rows: DrillLeg[] = []
  let total = 0

  const push = (i: number) => {
    const s = store.lSlip[i]
    total++
    if (rows.length >= cap) return
    const m = store.lMatch[i]
    rows.push({
      ts: store.lTs[i],
      uid: d.uids[store.sUid[s]],
      unit: d.units[store.sUnit[s]],
      match: m >= 0 ? d.matches.name[m] : '·',
      market: d.markets.name[store.lMarket[i]],
      option: d.options[store.lOption[i]],
      price: store.lPrice[i],
      slipStake: store.sStake[s],
      slipGgr: store.sGgr[s],
      phase: d.phases[store.sPhase[s]],
      betType: d.bet_types[store.sBetType[s]],
    })
  }

  for (let i = 0; i < store.nLegs; i++) {
    const s = store.lSlip[i]
    if (!mask[s]) continue
    let match = false
    switch (dim) {
      case 'uid':
        match = d.uids[store.sUid[s]] === key
        break
      case 'unit':
        match = d.units[store.sUnit[s]] === key
        break
      case 'channel':
        match = d.channels[store.sChannel[s]] === key
        break
      case 'bet_type':
        match = d.bet_types[store.sBetType[s]] === key
        break
      case 'competition': {
        const m = store.lMatch[i]
        match = m >= 0 && d.competitions[store.matchCompetition[m]] === key
        break
      }
      case 'market_group':
        match = d.markets.group[store.lMarket[i]] === key
        break
      case 'market':
        match = d.markets.name[store.lMarket[i]] === key
        break
      case 'team':
        match = d.teams[store.lTeam[i]] === key
        break
      case 'player':
        match = d.players[store.lPlayer[i]] === key
        break
      case 'selection': {
        const m = store.lMatch[i]
        const matchName = m >= 0 ? d.matches.name[m] : '?'
        match = `${matchName} · ${d.markets.name[store.lMarket[i]]} · ${d.options[store.lOption[i]]}` === key
        break
      }
      case 'line': {
        const line = store.lLine[i]
        match = line >= 0 && `${d.markets.name[store.lMarket[i]]} @ ${line}` === key
        break
      }
    }
    if (match) push(i)
  }
  rows.sort((a, b) => b.slipStake - a.slipStake)
  return { rows, total }
}
