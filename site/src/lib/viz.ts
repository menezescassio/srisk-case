/** Chart color system, validated with the dataviz palette validator against
 * the dark surface #14181d (lightness band, chroma floor, CVD separation,
 * contrast all PASS in this fixed order). Categorical hues are assigned in
 * this order and never cycled; extra series fold into "Other". */

export const CAT = ['#BA7F3B', '#4E8FD9', '#2FA57D', '#9D7FE0', '#C9766A'] as const

/** Diverging pair for polarity (operator GGR + / -) with neutral midpoint. */
export const POS = '#2FA57D'
export const NEG = '#C9766A'
export const NEUTRAL = '#6d7681'

/** Sequential ramp (magnitude), bronze light -> dark on dark surface. */
export const SEQ = ['#3a2f22', '#5c4526', '#7d5c2e', '#9e7335', '#BA7F3B', '#d9a967']

export const GRID_LINE = 'rgba(168, 176, 185, 0.12)'
export const AXIS_TEXT = '#6d7681'

/** Fixed phase order and their colors (identity, stable across views). */
export const PHASE_COLORS: Record<string, string> = {
  'early pre-match': '#4E8FD9',
  'day-of pre-match': '#2FA57D',
  'post-lineups (proxy)': '#BA7F3B',
  'in-play': '#9D7FE0',
  'suspect timing': '#C9766A',
}

export const CHANNEL_COLORS: Record<string, string> = {
  online: '#4E8FD9',
  retail: '#BA7F3B',
  tpv: '#9D7FE0',
}
