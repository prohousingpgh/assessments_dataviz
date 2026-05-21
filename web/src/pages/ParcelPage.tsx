import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getParcel } from '../api'
import type { CountySummary, Parcel, PropertyTaxes, TaxLine } from '../types'
import { TaxingBodyLabel, type TaxingBodyKind } from '../components/TaxingBodyLabel'
import {
  formatJurisdictionName,
  formatMoney,
  formatMoneyRange,
  formatNumber,
  formatPct,
} from '../format'
import { defaultHomesteadToggle, HOMESTEAD_EXCLUSION } from '../homesteadExemption'
import { applyParcelTaxAdjustments } from '../taxAdjustments'
import type { TaxScenarioBreakdown } from '../types'

const SCENARIO_LOW = 'commercial_low'
const SCENARIO_ESTIMATE = 'baseline'
const SCENARIO_HIGH = 'commercial_high'

type ScenarioBounds = {
  low: TaxScenarioBreakdown
  estimate: TaxScenarioBreakdown
  high: TaxScenarioBreakdown
}

function getScenarioBounds(taxes: PropertyTaxes): ScenarioBounds | null {
  const scenarios = taxes.future_scenarios
  if (!scenarios) return null
  const low = scenarios[SCENARIO_LOW]
  const estimate = scenarios[SCENARIO_ESTIMATE]
  const high = scenarios[SCENARIO_HIGH]
  if (!low || !estimate || !high) return null
  return { low, estimate, high }
}

function hasCommercialRange(taxes: PropertyTaxes): boolean {
  return getScenarioBounds(taxes) != null
}

export function ParcelPage() {
  const { parcelId } = useParams<{ parcelId: string }>()
  const [parcel, setParcel] = useState<Parcel | null>(null)
  const [taxes, setTaxes] = useState<PropertyTaxes | null>(null)
  const [summary, setSummary] = useState<CountySummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [homesteadEnabled, setHomesteadEnabled] = useState(false)
  const [incomeBelow125Ami, setIncomeBelow125Ami] = useState(false)

  const taxAdjustments = useMemo(() => {
    if (!taxes || !parcel) return null
    return applyParcelTaxAdjustments(taxes, parcel, homesteadEnabled, incomeBelow125Ami)
  }, [taxes, parcel, homesteadEnabled, incomeBelow125Ami])

  const displayTaxes = taxAdjustments?.displayTaxes ?? null
  const incomeProtection = taxAdjustments?.income ?? null

  useEffect(() => {
    if (!parcelId) return
    setLoading(true)
    setHomesteadEnabled(false)
    setIncomeBelow125Ami(false)
    getParcel(parcelId)
      .then((data) => {
        setParcel(data.parcel)
        setTaxes(data.taxes)
        setSummary(data.county_summary)
        setHomesteadEnabled(defaultHomesteadToggle(data.parcel))
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
          {formatJurisdictionName(parcel.municipality)} ·{' '}
          {formatJurisdictionName(parcel.school_district)} school district · {parcel.use_description}
        </p>
        <p className="page-meta">Parcel {parcel.parcel_id}</p>
      </div>

      <SummaryStrip parcel={parcel} taxes={displayTaxes} bounds={displayTaxes ? getScenarioBounds(displayTaxes) : null} />

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

      {taxes && displayTaxes && (
        <section className="card">
          <h2>Estimated property taxes per year</h2>
          <p className="detail-foot tax-intro">
            {taxes.tax_year ? `${taxes.tax_year} nominal millage` : '2025 nominal millage'} · after reassessment,
            rates are adjusted so each jurisdiction collects the same total tax revenue (revenue-neutral
            reassessment). Your bill can still change if your home&apos;s value shifts more or less than average.
          </p>

          <label className="tax-option-toggle">
            <input
              type="checkbox"
              checked={homesteadEnabled}
              onChange={(e) => setHomesteadEnabled(e.target.checked)}
            />
            <span>I claim the homestead exemption (owner-occupied)</span>
          </label>
          <p className="tax-option-help">
            Reduces taxable assessed value by {formatMoney(HOMESTEAD_EXCLUSION)} for{' '}
            <strong>county, municipality, and school district</strong> taxes, today and after
            reassessment (county uses county assessed value; city and school use local assessed value).
          </p>

          <label className="tax-option-toggle">
            <input
              type="checkbox"
              checked={incomeBelow125Ami}
              onChange={(e) => setIncomeBelow125Ami(e.target.checked)}
            />
            <span>
              My household income is below 125% of Area Median Income
            </span>
          </label>
          <p className="tax-option-help">
            Under proposed protections, county property tax after reassessment would be limited to a{' '}
            <strong>50% increase</strong> over today&apos;s county tax (municipal and school taxes are
            unchanged). This is an illustrative calculation only.
          </p>

          {incomeProtection?.countyCapped && (
            <aside className="callout callout-info">
              County tax after reassessment capped at {formatMoney(displayTaxes.future.county.annual_tax)}{' '}
              (was {formatMoney(incomeProtection.uncappedCountyFuture)} without the income limit).
              Municipality and school district taxes are not capped.
            </aside>
          )}

          {hasCommercialRange(displayTaxes) && (
            <aside className="callout callout-info">
              Post-reassessment millage includes all existing commercial property. Because commercial
              reassessment is not modeled, the <strong>estimated</strong> tax uses +20% commercial growth;
              the range shows <strong>0%</strong> (low) through <strong>+40%</strong> (high). Residential
              values use modeled reassessment.
            </aside>
          )}

          {taxes.warnings && taxes.warnings.length > 0 && (
            <aside className="callout callout-warning">
              {taxes.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </aside>
          )}

          {(() => {
            const bounds = getScenarioBounds(displayTaxes)
            if (bounds) {
              return (
                <EstimatedRangeTaxTable
                  taxes={displayTaxes}
                  bounds={bounds}
                  homesteadEnabled={homesteadEnabled}
                  incomeCapped={incomeProtection?.countyCapped ?? false}
                  uncappedCountyFuture={incomeProtection?.uncappedCountyFuture}
                />
              )
            }
            return (
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
                  <TaxRow
                    kind="county"
                    line={displayTaxes.current.county}
                    future={displayTaxes.future.county}
                    showTaxable={homesteadEnabled}
                    cappedFrom={
                      incomeProtection?.countyCapped
                        ? incomeProtection.uncappedCountyFuture
                        : undefined
                    }
                  />
                  <TaxRow
                    kind="municipality"
                    line={displayTaxes.current.municipality}
                    future={displayTaxes.future.municipality}
                    showTaxable={homesteadEnabled}
                  />
                  <TaxRow
                    kind="school"
                    line={displayTaxes.current.school}
                    future={displayTaxes.future.school}
                    showTaxable={homesteadEnabled}
                  />
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total per year</th>
                    <td className="num">{formatMoney(displayTaxes.current.total)}</td>
                    <td className="num">{formatMoney(displayTaxes.future.total)}</td>
                    <td className="num tax-delta">
                      {formatMoney(displayTaxes.delta.total_dollars)}
                      {displayTaxes.delta.total_percent != null && (
                        <span className="tax-delta-pct">
                          {' '}
                          ({formatPct(displayTaxes.delta.total_percent)})
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )
          })()}

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

function TaxAmountWithRange({
  estimate,
  low,
  high,
  showTaxable,
  currentTaxable,
  estimateTaxable,
}: {
  estimate: number
  low: number
  high: number
  showTaxable?: boolean
  currentTaxable?: number
  estimateTaxable?: number
}) {
  const showRange = Math.abs(low - high) >= 0.01
  return (
    <>
      <strong>{formatMoney(estimate)}</strong>
      {showRange && <span className="tax-range-note">Range {formatMoneyRange(low, high)}</span>}
      {showTaxable && currentTaxable != null && estimateTaxable != null && (
        <span className="tax-mills-note">
          Taxable {formatMoney(currentTaxable)} → {formatMoney(estimateTaxable)}
        </span>
      )}
    </>
  )
}

function EstimatedRangeTaxTable({
  taxes,
  bounds,
  homesteadEnabled,
  incomeCapped,
  uncappedCountyFuture,
}: {
  taxes: PropertyTaxes
  bounds: ScenarioBounds
  homesteadEnabled: boolean
  incomeCapped: boolean
  uncappedCountyFuture?: number
}) {
  const { low, estimate, high } = bounds
  const bodies: { key: 'county' | 'municipality' | 'school'; kind: TaxingBodyKind; label: string }[] = [
    { key: 'county', kind: 'county', label: 'Allegheny County' },
    { key: 'municipality', kind: 'municipality', label: taxes.current.municipality.label },
    { key: 'school', kind: 'school', label: taxes.current.school.label },
  ]

  return (
    <table className="tax-table">
      <thead>
        <tr>
          <th scope="col">Taxing body</th>
          <th scope="col" className="num">
            Today
          </th>
          <th scope="col" className="num">
            After reassessment (estimated)
          </th>
          <th scope="col" className="num">
            Change
          </th>
        </tr>
      </thead>
      <tbody>
        {bodies.map(({ key, kind, label }) => {
          const curLine = taxes.current[key]
          const estLine = estimate[key]
          const lowLine = low[key]
          const highLine = high[key]
          const cur = curLine.annual_tax
          const est = estLine.annual_tax
          const delta = est - cur
          const millsNote = formatMillsNote(curLine.mills, null)
          const futureMillsNote = formatMillsNote(estLine.mills, estLine)
          const millsRangeNote = formatMillsRange(lowLine.mills, highLine.mills)
          return (
            <tr key={key}>
              <th scope="row">
                <TaxingBodyLabel kind={kind} name={label}>
                  <span className="tax-mills-note">{millsNote}</span>
                  {key === 'county' && incomeCapped && uncappedCountyFuture != null && (
                    <span className="tax-cap-note">Income limit applied (county only)</span>
                  )}
                </TaxingBodyLabel>
              </th>
              <td className="num">{formatMoney(cur)}</td>
              <td className="num">
                <TaxAmountWithRange
                  estimate={est}
                  low={lowLine.annual_tax}
                  high={highLine.annual_tax}
                  showTaxable={homesteadEnabled}
                  currentTaxable={curLine.taxable_value}
                  estimateTaxable={estLine.taxable_value}
                />
                {!homesteadEnabled && (
                  <span className="tax-mills-note">{futureMillsNote}</span>
                )}
                {millsRangeNote && (
                  <span className="tax-range-note">Millage range {millsRangeNote}</span>
                )}
                {key === 'county' && uncappedCountyFuture != null && incomeCapped && (
                  <span className="tax-mills-note">
                    Uncapped estimate {formatMoney(uncappedCountyFuture)}
                  </span>
                )}
              </td>
              <td className="num">
                <TaxAmountWithRange
                  estimate={delta}
                  low={low[key].annual_tax - cur}
                  high={high[key].annual_tax - cur}
                />
              </td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Total per year</th>
          <td className="num">{formatMoney(taxes.current.total)}</td>
          <td className="num">
            <TaxAmountWithRange
              estimate={estimate.total}
              low={low.total}
              high={high.total}
            />
          </td>
          <td className="num tax-delta">
            <TaxAmountWithRange
              estimate={estimate.delta.total_dollars}
              low={low.delta.total_dollars}
              high={high.delta.total_dollars}
            />
            {estimate.delta.total_percent != null && (
              <span className="tax-delta-pct"> ({formatPct(estimate.delta.total_percent)} est.)</span>
            )}
          </td>
        </tr>
      </tfoot>
    </table>
  )
}

function SummaryStrip({
  parcel,
  taxes,
  bounds,
}: {
  parcel: Parcel
  taxes: PropertyTaxes | null
  bounds: ScenarioBounds | null
}) {
  const valueDelta = parcel.value_change_dollars
  const valueDeltaPct = parcel.value_change_pct

  return (
    <section className="summary-strip" aria-label="Assessment and tax summary">
      <h2 className="summary-strip-title">At a glance</h2>
      <div className="summary-strip-grid">
        <p className="summary-group-label summary-cell-today-head">Today</p>
        <div className="summary-arrow" aria-hidden="true">
          →
        </div>
        <p className="summary-group-label summary-group-label-future summary-cell-future-head">
          If reassessment happens
        </p>

        <SummaryMetric
          className="summary-cell-today-value"
          label="Assessed value"
          value={formatMoney(parcel.current_assessment_total)}
        />
        <SummaryMetric
          className="summary-cell-future-value"
          label="Assessed value"
          value={formatMoney(parcel.new_assessment_total)}
          delta={valueDelta != null ? formatMoney(valueDelta) : undefined}
          deltaPct={valueDeltaPct}
        />

        <SummaryMetric
          className="summary-cell-today-tax"
          label="Estimated taxes / year"
          value={taxes ? formatMoney(taxes.current.total) : '—'}
        />
        <SummaryMetric
          className="summary-cell-future-tax"
          label="Estimated taxes / year"
          value={taxes ? formatMoney(taxes.future.total) : '—'}
          rangeNote={
            bounds
              ? `${formatMoneyRange(bounds.low.total, bounds.high.total)} (0%–40% commercial)`
              : undefined
          }
          delta={
            taxes?.delta.total_dollars != null ? formatMoney(taxes.delta.total_dollars) : undefined
          }
          deltaPct={taxes?.delta.total_percent ?? undefined}
          deltaRangeNote={
            bounds
              ? formatMoneyRange(bounds.low.delta.total_dollars, bounds.high.delta.total_dollars)
              : undefined
          }
        />
      </div>
      <p className="summary-disclaimer">
        Illustrative estimate only. Not a county reassessment notice or tax bill.
      </p>
    </section>
  )
}

function SummaryMetric({
  className,
  label,
  value,
  rangeNote,
  delta,
  deltaPct,
  deltaRangeNote,
}: {
  className?: string
  label: string
  value: string
  rangeNote?: string
  delta?: string
  deltaPct?: number | null
  deltaRangeNote?: string
}) {
  const showDelta = delta != null

  const changeClass =
    deltaPct != null && deltaPct > 0
      ? 'summary-metric-change up'
      : deltaPct != null && deltaPct < 0
        ? 'summary-metric-change down'
        : 'summary-metric-change'

  return (
    <div className={className ? `summary-metric ${className}` : 'summary-metric'}>
      <span className="summary-metric-label">{label}</span>
      <span className="summary-metric-value">{value}</span>
      <div className="summary-metric-extra">
        {rangeNote && <span className="summary-metric-range">{rangeNote}</span>}
        {showDelta && (
          <span className={changeClass}>
            {delta}
            {deltaPct != null && !Number.isNaN(deltaPct) && ` (${formatPct(deltaPct)})`}
            {deltaRangeNote && (
              <span className="summary-metric-note"> · range {deltaRangeNote}</span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

function TaxRow({
  kind,
  line,
  future,
  cappedFrom,
  showTaxable,
}: {
  kind: TaxingBodyKind
  line: PropertyTaxes['current']['county']
  future: PropertyTaxes['future']['county']
  cappedFrom?: number
  showTaxable?: boolean
}) {
  const delta = future.annual_tax - line.annual_tax
  const millsNote = formatMillsNote(line.mills, null)
  const futureMillsNote = formatMillsNote(future.mills, future)

  return (
    <tr>
      <th scope="row">
        <TaxingBodyLabel kind={kind} name={line.label}>
          <span className="tax-mills-note">{millsNote}</span>
          {cappedFrom != null && (
            <span className="tax-cap-note">Income limit applied (county only)</span>
          )}
        </TaxingBodyLabel>
      </th>
      <td className="num">{formatMoney(line.annual_tax)}</td>
      <td className="num">
        {formatMoney(future.annual_tax)}
        {showTaxable && (
          <span className="tax-mills-note">
            Taxable {formatMoney(line.taxable_value)} → {formatMoney(future.taxable_value)}
          </span>
        )}
        {cappedFrom != null && (
          <span className="tax-mills-note">
            Uncapped estimate {formatMoney(cappedFrom)}
          </span>
        )}
        {cappedFrom == null && !showTaxable && futureMillsNote !== millsNote && (
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

function formatMillsRange(
  a: number | null | undefined,
  b: number | null | undefined
): string | null {
  if (a == null || b == null) return null
  const min = Math.min(a, b)
  const max = Math.max(a, b)
  if (Math.abs(min - max) < 0.0001) return null
  return `${min.toFixed(4)} – ${max.toFixed(4)}`
}
