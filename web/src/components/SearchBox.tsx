import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchParcels } from '../api'
import type { SearchResult } from '../types'
import { formatMoney, formatPct } from '../format'

type Props = {
  initialQuery?: string
  autoFocus?: boolean
}

export function SearchBox({ initialQuery = '', autoFocus }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([])
      setError(null)
      return
    }

    const handle = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await searchParcels(query.trim())
        setResults(data.results)
      } catch (e) {
        setResults([])
        setError(e instanceof Error ? e.message : 'Search failed')
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => window.clearTimeout(handle)
  }, [query])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (results.length === 1) {
      navigate(`/home/${results[0].parcel_id}`)
    }
  }

  return (
    <div className="search-box">
      <form onSubmit={onSubmit}>
        <label className="search-label" htmlFor="address-search">
          Your home address
        </label>
        <input
          id="address-search"
          className="search-input"
          type="search"
          placeholder="e.g. 412 Shawnee Ave, Millvale PA"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={autoFocus}
          autoComplete="street-address"
        />
      </form>
      {loading && <p className="search-meta">Searching…</p>}
      {error && <p className="search-error">{error}</p>}
      {!loading && !error && query.trim().length >= 3 && results.length === 0 && (
        <p className="search-meta">No matching homes found. Try a shorter street name or add your city.</p>
      )}
      {results.length > 0 && (
        <ul className="search-results" role="listbox">
          {results.map((r) => (
            <li key={r.parcel_id}>
              <button
                type="button"
                className="search-result-btn"
                onClick={() => navigate(`/home/${r.parcel_id}`)}
              >
                <span className="search-result-address">{r.address_display}</span>
                <span className="search-result-meta">
                  {r.use_description} · {r.municipality} · {formatPct(r.value_change_pct)} assessed value
                </span>
                <span className="search-result-values">
                  {formatMoney(r.current_assessment_total)} → {formatMoney(r.new_assessment_total)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
