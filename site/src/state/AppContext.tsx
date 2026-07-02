import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Payload } from '../lib/payload'
import { Store, emptyFilters, type Filters, type Totals } from '../lib/store'

interface AppState {
  payload: Payload
  store: Store
  filters: Filters
  setFilters: (update: (f: Filters) => Filters) => void
  resetFilters: () => void
  mask: Uint8Array
  totals: Totals
  grandTotals: Totals
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({
  payload,
  children,
}: {
  payload: Payload
  children: ReactNode
}) {
  const store = useMemo(() => new Store(payload), [payload])
  const [filters, setFiltersState] = useState<Filters>(emptyFilters())

  const mask = useMemo(() => store.computeMask(filters), [store, filters])
  const totals = useMemo(() => store.totals(mask), [store, mask])
  const grandTotals = useMemo(
    () => store.totals(new Uint8Array(store.nSlips).fill(1)),
    [store],
  )

  const value: AppState = {
    payload,
    store,
    filters,
    setFilters: (update) => setFiltersState((f) => update(structuredCloneFilters(f))),
    resetFilters: () => setFiltersState(emptyFilters()),
    mask,
    totals,
    grandTotals,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function structuredCloneFilters(f: Filters): Filters {
  return {
    dateFrom: f.dateFrom,
    dateTo: f.dateTo,
    phases: new Set(f.phases),
    channels: new Set(f.channels),
    betTypes: new Set(f.betTypes),
    units: new Set(f.units),
    currencies: new Set(f.currencies),
    competitions: new Set(f.competitions),
    marketGroups: new Set(f.marketGroups),
    markets: new Set(f.markets),
    fixtures: new Set(f.fixtures),
    teams: new Set(f.teams),
    players: new Set(f.players),
    uids: new Set(f.uids),
  }
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}
