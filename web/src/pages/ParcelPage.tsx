import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getParcel } from '../api'
import type { CountySummary, Parcel, PropertyTaxes, TaxLine } from '../types'
import { formatMoney, formatNumber, formatPct } from '../format'

export function ParcelPage() {
  const { parcelId } = useParams<{ parcelId: string }>()
  const [parcel, setParcel] = useState<Parcel | null>(null)
  const [taxes, setTaxes] = useState<PropertyTaxes | null>(null)
  const [summary, setSummary] = useState<CountySummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!parcelId) return
    setLoading(true)
    getParcel(parcelId)
      .then((data) => {
        setParcel(data.parcel)
        setTaxes(data.taxes)
        setSummary(data.county_summary)
        setError(null)
      })
      .catch((e) => {
        setParcel(null)
        setTaxes(null)
        setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => setLoading(false))
  }, [parcelId])

  if (loading) return <p className="page-meta">Loading your home…</p>
  if (error || !parcel) {
    return (
      <div className="page">
        <p className="search-error">{error ?? 'Home not found'}</p>
        <Link to="/">Back to search</Link>
      </div>
    )
  }

  const buildingCurrent =
    parcel.current_assessment_total != null && parcel.current_assessment_land != null
      ? parcel.current_assessment_total - parcel.current_assessment_land
      : null

  const medianPct = summary?.avg_value_change_pct

  return (
    <div className="page">
      <div className="parcel-header">
        <h1>{parcel.address_display}</h1>
        <p className="parcel-sub">
          {parcel.municipality} · {parcel.school_district} school district · {parcel.use_description}
        </p>
        <p className="page-meta">Parcel {parcel.parcel_id}</p>
      </div>

      <SummaryStrip parcel={parcel} taxes={taxes} />

      <div className="compare-grid">
        <section className="card">
          <h2>Assessed value today</h2>
          <p className="stat-value">{formatMoney(parcel.current_assessment_total)}</p>
          <dl className="detail-list">
            <div>
              <dt>Land</dt>
              <dd>{formatMoney(parcel.current_assessment_land)}</dd>
            </div>
            <div>
              <dt>Building</dt>
              <dd>{formatMoney(buildingCurrent)}</dd>
            </div>
          </dl>
          <p className="detail-foot">
            {formatNumber(parcel.building_area_sqft)} sq ft living · {formatNumber(parcel.land_area_sqft)} sq ft lot
          </p>
        </section>

        <section className="card card-accent">
          <h2>If reassessment happens (modeled)</h2>
          <p className="stat-value">{formatMoney(parcel.new_assessment_total)}</p>
          <p className="delta-line">
            Change: {formatMoney(parcel.value_change_dollars)} ({formatPct(parcel.value_change_pct)})
          </p>
          <p className="detail-foot">
            Based on recent sales and property characteristics (OpenAvmKit ensemble model).
          </p>
        </section>
      </div>

      {taxes && (
        <section className="card">
          <h2>Estimated property taxes per year</h2>
          <p className="detail-foot tax-intro">
            {taxes.tax_year ? `${taxes.tax_year} nominal millage` : '2025 nominal millage'} · after reassessment,
            rates are adjusted so each jurisdiction collects the same total tax revenue (revenue-neutral
            reassessment). Your bill can still change if your home&apos;s value shifts more or less than average.
            {taxes.homestead_applied && (
              <>
                {' '}
                · county homestead exclusion of {formatMoney(taxes.homestead_exclusion)} applied
              </>
            )}
          </p>

          {taxes.warnings && taxes.warnings.length > 0 && (
            <aside className="callout callout-warning">
              {taxes.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </aside>
          )}

          <table className="tax-table">
            <thead>
              <tr>
                <th scope="col">Taxing body</th>
                <th scope="col" className="num">
                  Today
                </th>
                <th scope="col" className="num">
                  After reassessment
                </th>
                <th scope="col" className="num">
                  Change
                </th>
              </tr>
            </thead>
            <tbody>
              <TaxRow line={taxes.current.county} future={taxes.future.county} />
              <TaxRow line={taxes.current.municipality} future={taxes.future.municipality} />
              <TaxRow line={taxes.current.school} future={taxes.future.school} />
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total per year</th>
                <td className="num">{formatMoney(taxes.current.total)}</td>
                <td className="num">{formatMoney(taxes.future.total)}</td>
                <td className="num tax-delta">
                  {formatMoney(taxes.delta.total_dollars)}
                  {taxes.delta.total_percent != null && (
                    <span className="tax-delta-pct"> ({formatPct(taxes.delta.total_percent)})</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>

          {taxes.notes && (
            <ul className="bullet-list tax-notes">
              {taxes.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {medianPct != null && (
        <section className="card">
          <h2>Your home vs the county</h2>
          <p>
            Average assessed-value change across included homeowner parcels in this dataset:{' '}
            <strong>{formatPct(medianPct)}</strong>
            {summary?.county_value_ratio != null && (
              <>
                {' '}
                (total residential assessed value ratio ≈ {summary.county_value_ratio.toFixed(2)}×)
              </>
            )}
          </p>
          <p className="detail-foot">
            Your change ({formatPct(parcel.value_change_pct)}) can be higher or lower than this average.
          </p>
        </section>
      )}

      <p className="page-actions">
        <Link to="/">Search another address</Link>
        {' · '}
        <Link to="/assumptions">How we estimate</Link>
      </p>
    </div>
  )
}

function SummaryStrip({
  parcel,
  taxes,
}: {
  parcel: Parcel
  taxes: PropertyTaxes | null
}) {
  const valueDelta = parcel.value_change_dollars
  const valueDeltaPct = parcel.value_change_pct
  const taxDelta = taxes?.delta.total_dollars
  const taxDeltaPct = taxes?.delta.total_percent

  return (
    <section className="summary-strip" aria-label="Assessment and tax summary">
      <h2 className="summary-strip-title">At a glance</h2>
      <div className="summary-strip-grid">
        <div className="summary-group">
          <p className="summary-group-label">Today</p>
          <div className="summary-metrics">
            <SummaryMetric label="Assessed value" value={formatMoney(parcel.current_assessment_total)} />
            <SummaryMetric
              label="Estimated taxes / year"
              value={taxes ? formatMoney(taxes.current.total) : '—'}
            />
          </div>
        </div>

        <div className="summary-arrow" aria-hidden="true">
          →
        </div>

        <div className="summary-group summary-group-future">
          <p className="summary-group-label">If reassessment happens</p>
          <div className="summary-metrics">
            <SummaryMetric
              label="Assessed value"
              value={formatMoney(parcel.new_assessment_total)}
              delta={valueDelta != null ? formatMoney(valueDelta) : undefined}
              deltaPct={valueDeltaPct}
            />
            <SummaryMetric
              label="Estimated taxes / year"
              value={taxes ? formatMoney(taxes.future.total) : '—'}
              delta={taxDelta != null ? formatMoney(taxDelta) : undefined}
              deltaPct={taxDeltaPct ?? undefined}
            />
          </div>
        </div>
      </div>
      <p className="summary-disclaimer">
        Illustrative estimate only. Not a county reassessment notice or tax bill.
      </p>
    </section>
  )
}

function SummaryMetric({
  label,
  value,
  delta,
  deltaPct,
}: {
  label: string
  value: string
  delta?: string
  deltaPct?: number | null
}) {
  const showDelta = delta != null && deltaPct != null && !Number.isNaN(deltaPct)

  return (
    <div className="summary-metric">
      <span className="summary-metric-label">{label}</span>
      <span className="summary-metric-value">{value}</span>
      {showDelta && (
        <span
          className={
            deltaPct > 0 ? 'summary-metric-change up' : deltaPct < 0 ? 'summary-metric-change down' : 'summary-metric-change'
          }
        >
          {delta} ({formatPct(deltaPct)})
        </span>
      )}
    </div>
  )
}

function TaxRow({
  line,
  future,
}: {
  line: PropertyTaxes['current']['county']
  future: PropertyTaxes['future']['county']
}) {
  const delta = future.annual_tax - line.annual_tax
  const millsNote = formatMillsNote(line.mills, null)
  const futureMillsNote = formatMillsNote(future.mills, future)

  return (
    <tr>
      <th scope="row">
        {line.label}
        <span className="tax-mills-note">{millsNote}</span>
      </th>
      <td className="num">{formatMoney(line.annual_tax)}</td>
      <td className="num">
        {formatMoney(future.annual_tax)}
        {futureMillsNote !== millsNote && (
          <span className="tax-mills-note">{futureMillsNote}</span>
        )}
      </td>
      <td className="num">{formatMoney(delta)}</td>
    </tr>
  )
}

function formatMillsNote(
  effective: number | null | undefined,
  line: TaxLine | null
): string {
  if (effective == null) return 'millage unavailable'
  if (
    line?.mills_nominal != null &&
    line.revenue_neutral_factor != null &&
    line.revenue_neutral_factor !== 1
  ) {
    return `${effective.toFixed(4)} mills (adjusted from ${line.mills_nominal.toFixed(4)})`
  }
  return `${effective.toFixed(4)} mills`
}
