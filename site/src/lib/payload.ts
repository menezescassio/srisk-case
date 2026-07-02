import { decryptJson } from './crypto'
import { fetchArtifact } from './artifacts'

/** Shape of the encrypted dashboard payload built by the pipeline
 * (pipeline/betflow/aggregate.py). Categorical columns are integer indexes
 * into `dims`. Money is EUR, timestamps are epoch seconds UTC. */

export interface FileStats {
  rows: number
  turnover_raw_rows: number
  ggr_raw_rows: number
  betslip_min: string
  betslip_max: string
}

export interface Recon {
  generated_at: string
  files: Record<'A' | 'B', FileStats>
  overlap_rows: number
  settlement_conflicts: number
  conflict_ggr_before: number
  conflict_ggr_after: number
  union_rows: number
  slips: number
  slips_simple: number
  slips_combined: number
  turnover_eur: number
  ggr_eur: number
  net_revenue_eur: number
  margin_pct: number
  raw_rows_turnover_eur: number
  raw_rows_ggr_eur: number
  unique_customers: number
  betslip_min: string
  betslip_max: string
  currency_rows_inferred: number
  fx: { as_of: string; rates_to_eur: Record<string, number> }
  duplicate_ambiguity: {
    exact_dup_rows: number
    exact_dup_rows_simple: number
    exact_dup_rows_combined: number
    exact_dup_stake_eur: number
  }
  phases: Record<string, { slips: number; stake_eur: number }>
  lineup_proxy_minutes: number
}

export interface MatchesDim {
  id: number[]
  name: string[]
  competition: number[]
  kickoff: number[]
}

export interface MarketsDim {
  name: string[]
  group: string[]
  star: boolean[]
}

export interface Dims {
  uids: string[]
  units: string[]
  currencies: string[]
  competitions: string[]
  phases: string[]
  channels: string[]
  bet_types: string[]
  options: string[]
  players: string[]
  teams: string[]
  markets: MarketsDim
  matches: MatchesDim
}

export interface SlipCols {
  ts: number[]
  uid: number[]
  bet_type: number[]
  stake: number[]
  ggr: number[]
  nr: number[]
  n_legs: number[]
  price: number[]
  phase: number[]
  lead_min: number[]
  unit: number[]
  channel: number[]
  currency: number[]
}

export interface LegCols {
  slip: number[]
  match: number[]
  market: number[]
  option: number[]
  player: number[]
  team: number[]
  price: number[]
  line: number[]
  ts: number[]
  event_ts: number[]
}

export interface WatchlistEntry {
  uid: string
  score: number
  slips: number
  stake: number
  ggr: number
  customer_margin_pct: number
  win_rate_pct: number
  avg_stake: number
  clv_pct: number | null
  clv_legs: number
  lineup_share_pct: number
  inplay_share_pct: number
  top_group: string
  top_group_share_pct: number
  channel: string
  components: { clv: number; win: number; lineup: number; stake: number; focus: number }
}

export type AnomalyType = 'price_drift' | 'repeated_support' | 'exposure' | 'negative_pocket'

export interface Anomaly {
  type: AnomalyType
  sel_key: string | null
  title: string
  detail: string
  stake: number
  ggr: number
  n_uids: number
  metric: number
}

export interface Risk {
  assumptions: {
    sel_min_legs: number
    uid_min_slips: number
    uid_min_stake_eur: number
    uid_min_clv_legs: number
    weights: Record<string, number>
    eligible_customers: number
    eligible_selections: number
  }
  watchlist: WatchlistEntry[]
  anomalies: Anomaly[]
}

export interface FindingsSection {
  id: string
  title: string
  paras: string[]
  bullets: string[]
}

export interface Findings {
  title: string
  window: string
  generated: string
  headline: { label: string; value: string }[]
  sections: FindingsSection[]
  tables: {
    phases: { name: string; stake: number; share: number; ggr: number; margin: number }[]
    groups: { name: string; stake: number; share: number; ggr: number; margin: number }[]
    watchlist: {
      uid: string
      score: number
      stake: number
      ggr: number
      clv_pct: number | null
      lineup_share_pct: number
      top_group: string
    }[]
    recon: { name: string; rows: number; turnover: number; ggr: number; note: string }[]
  }
  signature: string
}

export interface Payload {
  meta: {
    client: string
    logo_png_b64: string | null
    recon: Recon
  }
  risk: Risk
  findings: Findings
  dims: Dims
  slips: SlipCols
  legs: LegCols
}

export async function loadPayload(password: string): Promise<Payload> {
  const buf = await fetchArtifact('data.enc')
  return decryptJson<Payload>(buf, password)
}
