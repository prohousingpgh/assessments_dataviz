import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchParcels } from '../api'
import type { SearchResult } from '../types'
import { formatAssessmentRange, formatMoney, formatPct } from '../format'
import { Skeleton } from './Skeleton'

type Props = {
  initialQuery?: string
  autoFocus?: boolean
  large?: boolean
}

export function SearchBox({ initialQuery = '', autoFocus, large }: Props) {
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

  const inputClass = large ? 'search-input field--lg' : 'search-input'

  return (
    <div className="search-box">
      <form onSubmit={onSubmit}>
        <label className="search-label" htmlFor="address-search">
          Your home address
        </label>
        <input
          id="address-search"
          className={inputClass}
          type="search"
          placeholder="e.g. 412 Shawnee Ave, Millvale PA"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={autoFocus}
          autoComplete="street-address"
        />
      </form>
      <p className="search-meta">
        Modeled estimates from OpenAvmKit — not official county assessments or tax bills.
      </p>
      {loading && (
        <>
          <span className="visually-hidden" aria-live="polite">
            Searching…
          </span>
          <ul className="search-results search-results--skeleton" aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="search-result-skeleton">
                <Skeleton block height={18} width="78%" />
                <div className="skeleton-stack skeleton-stack--sm">
                  <Skeleton block height={14} width="62%" />
                  <Skeleton block height={14} width="48%" />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p className="search-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && query.trim().length >= 3 && results.length === 0 && (
        <p className="search-meta">
          No matching homes found. Try a shorter street name or add your city.
        </p>
      )}
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.parcel_id}>
              <button
                type="button"
                className="search-result-btn"
                onClick={() => navigate(`/home/${r.parcel_id}`)}
              >
                <span className="search-result-address">{r.address_display}</span>
                <span className="search-result-meta">
                  {r.use_description} · {r.municipality} · {formatPct(r.value_change_pct)} assessed
                  value
                  {r.has_assessment_quality_warning && (
                    <span className="search-result-flag"> · Possible data issue</span>
                  )}
                </span>
                <span className="search-result-values">
                  {formatMoney(r.current_assessment_total)} →{' '}
                  {formatAssessmentRange(r.new_assessment_total)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
