import type { Payload } from './payload'

/** In-memory analytical store over the decrypted payload.
 *
 * Slips are the financial unit (stake/GGR counted once per slip). Legs give
 * market/fixture/entity attribution. For per-market views, a combined slip's
 * money is split evenly across its legs so totals still sum to the headline
 * turnover (attribution rule stated in the UI and the report).
 */

export interface Filters {
  dateFrom: number | null
  dateTo: number | null
  phases: Set<number>
  channels: Set<number>
  betTypes: Set<number>
  units: Set<number>
  currencies: Set<number>
  competitions: Set<number>
  marketGroups: Set<string>
  markets: Set<number>
  fixtures: Set<number>
  teams: Set<number>
  players: Set<number>
  uids: Set<number>
}

export const emptyFilters = (): Filters => ({
  dateFrom: null,
  dateTo: null,
  phases: new Set(),
  channels: new Set(),
  betTypes: new Set(),
  units: new Set(),
  currencies: new Set(),
  competitions: new Set(),
  marketGroups: new Set(),
  markets: new Set(),
  fixtures: new Set(),
  teams: new Set(),
  players: new Set(),
  uids: new Set(),
})

export function countActive(f: Filters): number {
  let n = 0
  if (f.dateFrom !== null || f.dateTo !== null) n++
  for (const s of [
    f.phases, f.channels, f.betTypes, f.units, f.currencies, f.competitions,
    f.marketGroups, f.markets, f.fixtures, f.teams, f.players, f.uids,
  ])
    if (s.size) n++
  return n
}

export interface Totals {
  slips: number
  stake: number
  ggr: number
  nr: number
  customers: number
  avgStake: number
  marginPct: number
}

export interface GroupRow {
  key: number | string
  label: string
  slips: number
  stake: number
  ggr: number
  customers: number
}

export class Store {
  readonly p: Payload
  readonly nSlips: number
  readonly nLegs: number

  // slip columns as typed arrays
  readonly sTs: Float64Array
  readonly sUid: Int32Array
  readonly sBetType: Uint8Array
  readonly sStake: Float64Array
  readonly sGgr: Float64Array
  readonly sNr: Float64Array
  readonly sNLegs: Int32Array
  readonly sPrice: Float64Array
  readonly sPhase: Uint8Array
  readonly sLead: Float64Array
  readonly sUnit: Int32Array
  readonly sChannel: Uint8Array
  readonly sCurrency: Int32Array

  // leg columns
  readonly lSlip: Int32Array
  readonly lMatch: Int32Array
  readonly lMarket: Int32Array
  readonly lOption: Int32Array
  readonly lPlayer: Int32Array
  readonly lTeam: Int32Array
  readonly lPrice: Float64Array
  readonly lLine: Float64Array
  readonly lTs: Float64Array
  readonly lEventTs: Float64Array

  // derived
  readonly matchCompetition: Int32Array
  readonly marketGroupIdx: Int32Array
  readonly marketGroups: string[]
  readonly legStakeAttr: Float64Array
  readonly legGgrAttr: Float64Array

  /** The export catalogs the same real fixture under separate MatchIds for
   * pre-match and in-play. Fixtures are merged by (name, kickoff date):
   * matchGroupOf maps a match index to its merged fixture group. */
  readonly matchGroupOf: Int32Array
  readonly fixtureGroups: { name: string; kickoff: number; competition: number; matchIdxs: number[] }[]

  constructor(p: Payload) {
    this.p = p
    this.nSlips = p.slips.ts.length
    this.nLegs = p.legs.slip.length

    this.sTs = Float64Array.from(p.slips.ts)
    this.sUid = Int32Array.from(p.slips.uid)
    this.sBetType = Uint8Array.from(p.slips.bet_type)
    this.sStake = Float64Array.from(p.slips.stake)
    this.sGgr = Float64Array.from(p.slips.ggr)
    this.sNr = Float64Array.from(p.slips.nr)
    this.sNLegs = Int32Array.from(p.slips.n_legs)
    this.sPrice = Float64Array.from(p.slips.price)
    this.sPhase = Uint8Array.from(p.slips.phase)
    this.sLead = Float64Array.from(p.slips.lead_min)
    this.sUnit = Int32Array.from(p.slips.unit)
    this.sChannel = Uint8Array.from(p.slips.channel)
    this.sCurrency = Int32Array.from(p.slips.currency)

    this.lSlip = Int32Array.from(p.legs.slip)
    this.lMatch = Int32Array.from(p.legs.match)
    this.lMarket = Int32Array.from(p.legs.market)
    this.lOption = Int32Array.from(p.legs.option)
    this.lPlayer = Int32Array.from(p.legs.player)
    this.lTeam = Int32Array.from(p.legs.team)
    this.lPrice = Float64Array.from(p.legs.price)
    this.lLine = Float64Array.from(p.legs.line)
    this.lTs = Float64Array.from(p.legs.ts)
    this.lEventTs = Float64Array.from(p.legs.event_ts)

    this.matchCompetition = Int32Array.from(p.dims.matches.competition)

    this.marketGroups = [...new Set(p.dims.markets.group)]
    this.marketGroupIdx = Int32Array.from(
      p.dims.markets.group.map((g) => this.marketGroups.indexOf(g)),
    )

    // even split of combined slip money across its legs
    this.legStakeAttr = new Float64Array(this.nLegs)
    this.legGgrAttr = new Float64Array(this.nLegs)
    for (let i = 0; i < this.nLegs; i++) {
      const s = this.lSlip[i]
      const n = this.sNLegs[s]
      this.legStakeAttr[i] = this.sStake[s] / n
      this.legGgrAttr[i] = this.sGgr[s] / n
    }

    // merge duplicate MatchIds (pre-match vs in-play catalogs)
    const nM = p.dims.matches.name.length
    this.matchGroupOf = new Int32Array(nM).fill(-1)
    this.fixtureGroups = []
    const groupByKey = new Map<string, number>()
    for (let m = 0; m < nM; m++) {
      const ko = p.dims.matches.kickoff[m]
      // day boundary shifted to 06:00 UTC: this tournament has 02:00 UTC
      // kickoffs, and the two catalogs can disagree by minutes across midnight
      const day = ko > 0 ? Math.floor((ko - 6 * 3600) / 86400) : -1
      const key = `${p.dims.matches.name[m]}|${day}`
      let g = groupByKey.get(key)
      if (g === undefined) {
        g = this.fixtureGroups.length
        groupByKey.set(key, g)
        this.fixtureGroups.push({
          name: p.dims.matches.name[m],
          kickoff: ko,
          competition: p.dims.matches.competition[m],
          matchIdxs: [],
        })
      }
      const grp = this.fixtureGroups[g]
      grp.matchIdxs.push(m)
      if (ko > 0 && (grp.kickoff <= 0 || ko < grp.kickoff)) grp.kickoff = ko
      this.matchGroupOf[m] = g
    }
  }

  /** Slip inclusion mask for the given filters. */
  computeMask(f: Filters): Uint8Array {
    const n = this.nSlips
    const mask = new Uint8Array(n)
    const { dateFrom, dateTo } = f
    for (let i = 0; i < n; i++) {
      const ts = this.sTs[i]
      if (dateFrom !== null && ts < dateFrom) continue
      if (dateTo !== null && ts >= dateTo + 86400) continue
      if (f.phases.size && !f.phases.has(this.sPhase[i])) continue
      if (f.channels.size && !f.channels.has(this.sChannel[i])) continue
      if (f.betTypes.size && !f.betTypes.has(this.sBetType[i])) continue
      if (f.units.size && !f.units.has(this.sUnit[i])) continue
      if (f.currencies.size && !f.currencies.has(this.sCurrency[i])) continue
      if (f.uids.size && !f.uids.has(this.sUid[i])) continue
      mask[i] = 1
    }

    // leg-scoped filters: slip stays if ANY leg matches all active leg filters
    const legScoped =
      f.competitions.size ||
      f.marketGroups.size ||
      f.markets.size ||
      f.fixtures.size ||
      f.teams.size ||
      f.players.size
    if (legScoped) {
      const groupSel = new Set(
        [...f.marketGroups].map((g) => this.marketGroups.indexOf(g)),
      )
      const legOk = new Uint8Array(n)
      for (let i = 0; i < this.nLegs; i++) {
        const s = this.lSlip[i]
        if (!mask[s] || legOk[s]) continue
        const m = this.lMatch[i]
        if (f.competitions.size && (m < 0 || !f.competitions.has(this.matchCompetition[m]))) continue
        if (f.fixtures.size && !f.fixtures.has(m)) continue
        if (f.marketGroups.size && !groupSel.has(this.marketGroupIdx[this.lMarket[i]])) continue
        if (f.markets.size && !f.markets.has(this.lMarket[i])) continue
        if (f.teams.size && !f.teams.has(this.lTeam[i])) continue
        if (f.players.size && !f.players.has(this.lPlayer[i])) continue
        legOk[s] = 1
      }
      for (let i = 0; i < n; i++) mask[i] = mask[i] && legOk[i] ? 1 : 0
    }
    return mask
  }

  totals(mask: Uint8Array): Totals {
    let slips = 0
    let stake = 0
    let ggr = 0
    let nr = 0
    const seen = new Uint8Array(this.p.dims.uids.length)
    let customers = 0
    for (let i = 0; i < this.nSlips; i++) {
      if (!mask[i]) continue
      slips++
      stake += this.sStake[i]
      ggr += this.sGgr[i]
      nr += this.sNr[i]
      const u = this.sUid[i]
      if (!seen[u]) {
        seen[u] = 1
        customers++
      }
    }
    return {
      slips,
      stake,
      ggr,
      nr,
      customers,
      avgStake: slips ? stake / slips : 0,
      marginPct: stake ? (ggr / stake) * 100 : 0,
    }
  }

  /** Group slips by a slip-level field. */
  groupBySlipField(
    mask: Uint8Array,
    field: Uint8Array | Int32Array,
    labels: readonly string[],
  ): GroupRow[] {
    const stake = new Float64Array(labels.length)
    const ggr = new Float64Array(labels.length)
    const slips = new Int32Array(labels.length)
    const seen: Set<number>[] = labels.map(() => new Set())
    for (let i = 0; i < this.nSlips; i++) {
      if (!mask[i]) continue
      const k = field[i]
      stake[k] += this.sStake[i]
      ggr[k] += this.sGgr[i]
      slips[k]++
      seen[k].add(this.sUid[i])
    }
    const rows: GroupRow[] = []
    for (let k = 0; k < labels.length; k++) {
      if (!slips[k]) continue
      rows.push({
        key: k,
        label: labels[k],
        slips: slips[k],
        stake: stake[k],
        ggr: ggr[k],
        customers: seen[k].size,
      })
    }
    rows.sort((a, b) => b.stake - a.stake)
    return rows
  }
}
