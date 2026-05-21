import { useEffect, useState } from 'react'
import { getManifest } from '../api'
import type { Manifest } from '../types'
import { formatPct } from '../format'

export function AssumptionsPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getManifest()
      .then(setManifest)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  if (error) return <p className="search-error">{error}</p>
  if (!manifest) return <p className="page-meta">Loading…</p>

  const ratio = manifest.county_residential_value_ratio ?? manifest.county_summary?.county_value_ratio
  const avgPct = manifest.county_summary?.avg_value_change_pct

  return (
    <div className="page">
      <h1>How we estimate</h1>
      <p className="lead">
        Transparent assumptions behind the numbers on this site. Full pipeline:{' '}
        <a href={manifest.methodology_url} target="_blank" rel="noreferrer">
          prohousingpgh/agc_assessments
        </a>
      </p>

      <div className="compare-grid">
        <section className="card">
          <h2>What we model</h2>
          <p>
            Market-value-style assessments using OpenAvmKit: regression, spatial comparables, and
            gradient-boosted models combined into one prediction per home, split by property type
            (single-family, multi-family, commercial in the underlying pipeline; this site shows
            homeowner parcels only).
          </p>
          <p className="detail-foot">Valuation date: {manifest.valuation_date ?? '2025-01-01'}</p>
        </section>
        <section className="card">
          <h2>What we do not claim</h2>
          <p>
            This is not the county&apos;s official reassessment. Your actual change may differ after
            appeals, homestead status, abatements, and elected officials&apos; millage decisions.
          </p>
        </section>
      </div>

      <section className="card">
        <h2>Data sources</h2>
        <ul className="bullet-list">
          <li>Current assessments — WPRDC property assessments</li>
          <li>Modeled future values — OpenAvmKit run via agc_assessments</li>
          <li>
            Property tax millage —{' '}
            <a
              href="https://apps.alleghenycounty.us/website/MillMuni.asp?Year=2025"
              target="_blank"
              rel="noreferrer"
            >
              Allegheny County Treasurer (2025)
            </a>
          </li>
          <li>Parcel boundaries — Allegheny County GIS (for future map views)</li>
        </ul>
        {manifest.data_as_of && <p className="detail-foot">Data as of {manifest.data_as_of}</p>}
      </section>

      <section className="card">
        <h2>Property tax estimates</h2>
        <ul className="bullet-list">
          <li>
            Annual tax = taxable assessed value × millage ÷ 1,000, for county, municipality, and school
            district separately.
          </li>
          <li>County tax uses county assessed value (WPRDC COUNTYTOTAL); city and school use local assessed value (LOCALTOTAL).</li>
          <li>
            If a homestead flag (HOM) is on the parcel, a $18,000 homestead exclusion is subtracted from taxable value for county, municipality, and school taxes.
          </li>
          <li>
            After reassessment, each taxing body (county, municipality, and school district separately) adjusts
            its millage so total tax receipts for that body stay the same: aggregate pre-reassessment receipts
            equal aggregate post-reassessment receipts, using sums of taxable value × millage for all parcels in
            that body. Existing commercial property values are included in those totals.
          </li>
          <li>
            Commercial reassessment is not modeled. Revenue-neutral millage uses +20% commercial growth as
            the estimate, with a range from 0% (low bound) to +40% (high bound) from current commercial
            assessed values.
          </li>
          <li>
            Your home&apos;s tax can still rise or fall if its assessed value changes more or less than the jurisdiction average.
          </li>
        </ul>
        {manifest.tax_assumptions && <p className="detail-foot">{manifest.tax_assumptions}</p>}
      </section>

      {(ratio != null || avgPct != null) && (
        <section className="card">
          <h2>Countywide context (this dataset)</h2>
          {ratio != null && (
            <p>
              Total residential assessed value (new ÷ current): <strong>{ratio.toFixed(2)}×</strong>
            </p>
          )}
          {avgPct != null && (
            <p>
              Average percent change across homeowner parcels: <strong>{formatPct(avgPct)}</strong>
            </p>
          )}
        </section>
      )}

      <aside className="callout callout-info">{manifest.disclaimer}</aside>
    </div>
  )
}
