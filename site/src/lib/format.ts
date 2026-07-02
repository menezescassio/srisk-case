const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtInt = (v: number) => nf0.format(v)
export const fmtEur = (v: number) => `€${nf0.format(v)}`
export const fmtEur2 = (v: number) => `€${nf2.format(v)}`
export const fmtPct = (v: number, dp = 1) =>
  `${(dp === 0 ? nf0 : dp === 1 ? nf1 : nf2).format(v)}%`

/** Compact money for axes and dense tables: €1.3m, €457k, €82. */
export function fmtEurCompact(v: number): string {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `€${nf1.format(v / 1_000_000)}m`
  if (a >= 10_000) return `€${nf0.format(v / 1_000)}k`
  if (a >= 1_000) return `€${nf1.format(v / 1_000)}k`
  return `€${nf0.format(v)}`
}

export function fmtDate(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().slice(0, 10)
}

export function fmtDateTime(epochSec: number): string {
  const d = new Date(epochSec * 1000)
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

export function fmtLead(minutes: number): string {
  if (minutes <= -99999) return 'n/a'
  const sign = minutes < 0 ? 'after KO' : 'before KO'
  const m = Math.abs(minutes)
  if (m >= 1440) return `${nf1.format(m / 1440)}d ${sign}`
  if (m >= 60) return `${nf1.format(m / 60)}h ${sign}`
  return `${nf0.format(m)}min ${sign}`
}
