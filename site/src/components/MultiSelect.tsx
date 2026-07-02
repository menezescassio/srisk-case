import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  options: { value: number | string; label: string }[]
  selected: Set<number | string>
  onChange: (next: Set<number | string>) => void
  searchable?: boolean
}

export function MultiSelect({ label, options, selected, onChange, searchable }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const shown = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const active = selected.size > 0

  return (
    <div className={`msel${active ? ' msel--active' : ''}`} ref={ref}>
      <button className="msel__btn" onClick={() => setOpen((v) => !v)}>
        {label}
        {active && <span className="msel__count num">{selected.size}</span>}
        <span className="msel__chev">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="msel__pop">
          {searchable && (
            <input
              className="msel__search num"
              placeholder="search"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <div className="msel__list">
            {shown.slice(0, 300).map((o) => {
              const on = selected.has(o.value)
              return (
                <label key={String(o.value)} className="msel__item">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = new Set(selected)
                      if (on) next.delete(o.value)
                      else next.add(o.value)
                      onChange(next)
                    }}
                  />
                  <span>{o.label}</span>
                </label>
              )
            })}
            {shown.length > 300 && (
              <div className="msel__more num">{shown.length - 300} more, refine search</div>
            )}
          </div>
          {active && (
            <button className="msel__clear" onClick={() => onChange(new Set())}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
