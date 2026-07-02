import { useApp } from '../state/AppContext'
import { countActive } from '../lib/store'
import { fmtInt } from '../lib/format'
import { MultiSelect } from './MultiSelect'

export function FilterBar() {
  const { payload, store, filters, setFilters, resetFilters, totals, grandTotals } = useApp()
  const d = payload.dims

  const sel =
    (key:
      | 'phases'
      | 'channels'
      | 'betTypes'
      | 'units'
      | 'currencies'
      | 'competitions'
      | 'marketGroups'
      | 'markets') =>
    (next: Set<number | string>) =>
      setFilters((f) => ({ ...f, [key]: next }) as typeof f)

  const idx = (arr: readonly string[]) =>
    arr.map((label, value) => ({ value, label }))

  const nActive = countActive(filters)

  return (
    <div className="fbar">
      <div className="fbar__row">
        <MultiSelect label="Phase" options={idx(d.phases)} selected={filters.phases as Set<number | string>} onChange={sel('phases')} />
        <MultiSelect label="Channel" options={idx(d.channels)} selected={filters.channels as Set<number | string>} onChange={sel('channels')} />
        <MultiSelect label="Bet type" options={idx(d.bet_types)} selected={filters.betTypes as Set<number | string>} onChange={sel('betTypes')} />
        <MultiSelect label="Competition" options={idx(d.competitions)} selected={filters.competitions as Set<number | string>} onChange={sel('competitions')} searchable />
        <MultiSelect
          label="Market group"
          options={store.marketGroups.map((g) => ({ value: g, label: g }))}
          selected={filters.marketGroups as Set<number | string>}
          onChange={sel('marketGroups')}
        />
        <MultiSelect label="Market" options={d.markets.name.map((label, value) => ({ value, label }))} selected={filters.markets as Set<number | string>} onChange={sel('markets')} searchable />
        <MultiSelect label="Unit" options={idx(d.units)} selected={filters.units as Set<number | string>} onChange={sel('units')} searchable />
        <MultiSelect label="Currency" options={idx(d.currencies)} selected={filters.currencies as Set<number | string>} onChange={sel('currencies')} />
        <div className="fbar__dates num">
          <input
            type="date"
            value={filters.dateFrom ? new Date(filters.dateFrom * 1000).toISOString().slice(0, 10) : ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                dateFrom: e.target.value ? Date.parse(e.target.value + 'T00:00:00Z') / 1000 : null,
              }))
            }
          />
          <span>to</span>
          <input
            type="date"
            value={filters.dateTo ? new Date(filters.dateTo * 1000).toISOString().slice(0, 10) : ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                dateTo: e.target.value ? Date.parse(e.target.value + 'T00:00:00Z') / 1000 : null,
              }))
            }
          />
        </div>
        {nActive > 0 && (
          <button className="fbar__reset" onClick={resetFilters}>
            Reset ({nActive})
          </button>
        )}
      </div>
      <div className="fbar__note num">
        {totals.slips === grandTotals.slips
          ? `${fmtInt(totals.slips)} slips, all data`
          : `${fmtInt(totals.slips)} of ${fmtInt(grandTotals.slips)} slips selected`}
      </div>
    </div>
  )
}
