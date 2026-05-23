import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getParcel } from '../api'
import type { CountySummary, Parcel, PropertyTaxes, TaxLine } from '../types'
import { PageHeader } from '../components/PageHeader'
import { TaxingBodyLabel, type TaxingBodyKind } from '../components/TaxingBodyLabel'
import { usePageTitle } from '../hooks/usePageTitle'
import { CommercialGrowthSlider } from '../components/CommercialGrowthSlider'
import {
  clampCommercialGrowth,
  commercialGrowthRange,
  countyAvgFromTaxesOrSummary,
  describeCommercialGrowthAssumption,
  growthFromSliderPosition,
} from '../commercialGrowth'
import {
  formatJurisdictionName,
  formatMoney,
  formatNumber,
  formatPct,
} from '../format'
import {
  defaultHomesteadToggle,
  homesteadExclusionsForParcel,
  homesteadExclusionsFromTaxes,
} from '../homesteadExemption'
import { applyParcelTaxAdjustments } from '../taxAdjustments'

function hasCommercialSlider(taxes: PropertyTaxes): boolean {
  const bases = taxes.revenue_neutral_bases
  return Boolean(bases?.county || bases?.municipality || bases?.school)
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
  const [commercialGrowth, setCommercialGrowth] = useState<number | null>(null)

  useEffect(() => {
    setCommercialGrowth(null)
  }, [parcelId])

  const parcelResidentialGrowth =
    taxes?.parcel_residential_growth_rate ??
    (parcel?.current_assessment_total && parcel.current_assessment_total > 0
      ? ((parcel.new_assessment_total ?? 0) - parcel.current_assessment_total) /
        parcel.current_assessment_total
      : undefined)

  const countyAvgResidentialGrowth = useMemo(
    () => countyAvgFromTaxesOrSummary(taxes, summary),
    [taxes, summary]
  )

  const growthRange = useMemo(
    () => commercialGrowthRange(countyAvgResidentialGrowth, parcelResidentialGrowth),
    [countyAvgResidentialGrowth, parcelResidentialGrowth]
  )

  useEffect(() => {
    if (taxes && commercialGrowth === null) {
      setCommercialGrowth(growthFromSliderPosition(50, growthRange))
    }
  }, [taxes, commercialGrowth, growthRange])

  const commercialGrowthRate = clampCommercialGrowth(
    commercialGrowth ?? growthRange.center,
    growthRange
  )

  const commercialAssumptionNote = useMemo(
    () =>
      describeCommercialGrowthAssumption(
        commercialGrowthRate,
        countyAvgResidentialGrowth
      ),
    [commercialGrowthRate, countyAvgResidentialGrowth]
  )

  const taxAdjustments = useMemo(() => {
    if (!taxes || !parcel) return null
    return applyParcelTaxAdjustments(
      taxes,
      parcel,
      homesteadEnabled,
      incomeBelow125Ami,
      commercialGrowthRate,
      summary?.county_value_ratio
    )
  }, [
    taxes,
    parcel,
    homesteadEnabled,
    incomeBelow125Ami,
    commercialGrowthRate,
    summary?.county_value_ratio,
  ])

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

  usePageTitle(parcel?.address_display ?? 'Your home')

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
      <PageHeader title={parcel.address_display} className="page-header--parcel">
        <p className="parcel-sub">
          {formatJurisdictionName(parcel.municipality)} ·{' '}
          {formatJurisdictionName(parcel.school_district)} school district · {parcel.use_description}
        </p>
        <p className="page-meta">
          Parcel {parcel.parcel_id} ·{' '}
          <Link to={`/map?parcel=${encodeURIComponent(parcel.parcel_id)}`}>View on map</Link>
        </p>
      </PageHeader>

      <SummaryStrip
        parcel={parcel}
        taxes={displayTaxes}
        commercialAssumptionNote={commercialAssumptionNote}
      />

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
          <HomesteadHelpText
            parcel={parcel}
            taxes={taxes}
            countyValueRatio={summary?.county_value_ratio}
          />

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

          {hasCommercialSlider(taxes) && (
            <CommercialGrowthSlider
              range={growthRange}
              value={commercialGrowthRate}
              onChange={setCommercialGrowth}
            />
          )}

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

          {hasCommercialSlider(taxes) && (
            <p className="tax-assumption-note">{commercialAssumptionNote}</p>
          )}

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
        <Link to="/assumptions">Methodology & assumptions</Link>
      </p>
    </div>
  )
}

function HomesteadHelpText({
  parcel,
  taxes,
  countyValueRatio,
}: {
  parcel: Parcel
  taxes: PropertyTaxes | null
  countyValueRatio?: number | null
}) {
  const ex =
    (taxes && homesteadExclusionsFromTaxes(taxes)) ??
    homesteadExclusionsForParcel(parcel, countyValueRatio)
  const muniDiffers = ex.municipality.current !== ex.county.current
  const scaleNote =
    countyValueRatio != null && countyValueRatio > 0 ? (
      <>
        {' '}
        (after reassessment scaled by ≈{countyValueRatio.toFixed(2)}× countywide residential value,
        nearest $1,000)
      </>
    ) : (
      <> (after reassessment scaled with countywide residential value growth)</>
    )

  return (
    <p className="tax-option-help">
      Reduces taxable assessed value. <strong>County</strong>: {formatMoney(ex.county.current)} today,{' '}
      {formatMoney(ex.county.future)} after reassessment{scaleNote}. <strong>Municipality</strong>:{' '}
      {formatMoney(ex.municipality.current)} today, {formatMoney(ex.municipality.future)} after
      reassessment{scaleNote}. <strong>School district</strong>: {formatMoney(ex.school.current)} today,{' '}
      {formatMoney(ex.school.future)} after reassessment{scaleNote}.{' '}
      {muniDiffers && 'Municipality amount differs from county. '}
      <Link to="/homestead-exemptions">Full reference table</Link>. County uses county assessed value;
      city and school use local assessed value.
    </p>
  )
}

function SummaryStrip({
  parcel,
  taxes,
  commercialAssumptionNote,
}: {
  parcel: Parcel
  taxes: PropertyTaxes | null
  commercialAssumptionNote?: string
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
          note={commercialAssumptionNote}
          delta={
            taxes?.delta.total_dollars != null ? formatMoney(taxes.delta.total_dollars) : undefined
          }
          deltaPct={taxes?.delta.total_percent ?? undefined}
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
  note,
  delta,
  deltaPct,
}: {
  className?: string
  label: string
  value: string
  note?: string
  delta?: string
  deltaPct?: number | null
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
        {note && <span className="summary-metric-range">{note}</span>}
        {showDelta && (
          <span className={changeClass}>
            {delta}
            {deltaPct != null && !Number.isNaN(deltaPct) && ` (${formatPct(deltaPct)})`}
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

