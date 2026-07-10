import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getMapConfig, getMapParcelFeature, getParcel } from '../api'
import type { CountySummary, Parcel, PropertyTaxes, TaxLine } from '../types'
import { PageHeader } from '../components/PageHeader'
import { TaxingBodyLabel, type TaxingBodyKind } from '../components/TaxingBodyLabel'
import { futureAdditionalLine } from '../taxBreakdown'
import { usePageTitle } from '../hooks/usePageTitle'
import { ParcelMap, type FocusedParcel } from '../map/ParcelMap'
import type { MapConfig } from '../map/types'
import { CommercialGrowthSlider } from '../components/CommercialGrowthSlider'
import {
  clampCommercialGrowth,
  commercialGrowthRange,
  countyAvgFromTaxesOrSummary,
  describeCommercialGrowthAssumption,
} from '../commercialGrowth'
import {
  formatAssessmentRange,
  formatJurisdictionName,
  formatMoney,
  formatNumber,
  formatProportionalTaxChangeRange,
  formatProportionalTaxRange,
  formatProportionalValueRange,
  formatPct,
} from '../format'
import {
  defaultHomesteadToggle,
  homesteadExclusionsForParcel,
  homesteadExclusionsFromTaxes,
} from '../homesteadExemption'
import { applyParcelTaxAdjustments } from '../taxAdjustments'
import { countyBaseGrowthFromSummary } from '../countyGrowth'
import { ParcelPageSkeleton } from '../components/skeletons/ParcelPageSkeleton'

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
  const [mapConfig, setMapConfig] = useState<MapConfig | null>(null)
  const [nearbyCenter, setNearbyCenter] = useState<[number, number] | null>(null)
  const [nearbyMapError, setNearbyMapError] = useState<string | null>(null)
  const [focusedNearbyParcel, setFocusedNearbyParcel] = useState<FocusedParcel | null>(null)

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
      setCommercialGrowth(growthRange.center)
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

  const reassessmentTaxNote = useMemo(
    () => describeReassessmentTaxFootnote(parcelResidentialGrowth, countyAvgResidentialGrowth),
    [parcelResidentialGrowth, countyAvgResidentialGrowth]
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
        setFocusedNearbyParcel({
          parcelId: data.parcel.parcel_id,
          addressDisplay: data.parcel.address_display,
          municipality: data.parcel.municipality,
          valueChangePct: data.parcel.value_change_pct,
        })
        setError(null)
      })
      .catch((e) => {
        setParcel(null)
        setTaxes(null)
        setFocusedNearbyParcel(null)
        setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => setLoading(false))
  }, [parcelId])

  useEffect(() => {
    if (!parcel?.parcel_id) return
    let cancelled = false
    Promise.all([getMapConfig(), getMapParcelFeature(parcel.parcel_id)])
      .then(([cfg, feature]) => {
        if (cancelled) return
        const coords = feature.geometry?.coordinates as [number, number] | undefined
        if (!coords) {
          setNearbyMapError('Could not locate this parcel on the map.')
          setMapConfig(null)
          setNearbyCenter(null)
          return
        }
        setMapConfig(cfg)
        setNearbyCenter(coords)
        setNearbyMapError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setNearbyMapError(e instanceof Error ? e.message : 'Could not load nearby map.')
        setMapConfig(null)
        setNearbyCenter(null)
      })
    return () => {
      cancelled = true
    }
  }, [parcel?.parcel_id])

  usePageTitle(parcel?.address_display ?? 'Your home')

  if (loading) return <ParcelPageSkeleton />
  if (error || !parcel) {
    return (
      <div className="page">
        <p className="search-error">{error ?? 'Home not found'}</p>
        <Link to="/">Back to search</Link>
      </div>
    )
  }

  const buildingCurrent = assessmentBuilding(
    parcel.current_assessment_total,
    parcel.current_assessment_land
  )
  const buildingNew = assessmentBuilding(parcel.new_assessment_total, parcel.new_assessment_land)

  const countyBasePct = countyBaseGrowthFromSummary(summary)
  const meanParcelPct = summary?.avg_value_change_pct

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
        <aside className="callout callout-info parcel-estimates-note">
          Reassessed values and tax figures below are <strong>modeled estimates</strong> — not
          official county assessments or tax bills.
        </aside>
      </PageHeader>

      {parcel.assessment_quality_warning && (
        <aside className="callout callout-warning parcel-quality-warning" role="status">
          <strong>Possible data issue.</strong> {parcel.assessment_quality_warning}
        </aside>
      )}

      <div className="compare-grid">
        <section className="card">
          <h2>Assessed value today</h2>
          <div className="headline-metrics">
            <div className="headline-metric">
              <p className="headline-label">Assessed value</p>
              <p className="stat-value">{formatMoney(parcel.current_assessment_total)}</p>
            </div>
            <div className="headline-metric">
              <p className="headline-label">Estimated taxes / year</p>
              <p className="stat-value">{displayTaxes ? formatMoney(displayTaxes.current.total) : '—'}</p>
            </div>
          </div>
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
            Tied to the <strong>2012</strong> base year via the county&apos;s{' '}
            <strong>Common Level Ratio</strong> (2026 CLR: <strong>50.14</strong>) — often well below
            today&apos;s market value.
          </p>
          <p className="detail-foot">
            {formatNumber(parcel.building_area_sqft)} sq ft living · {formatNumber(parcel.land_area_sqft)} sq ft lot
          </p>
        </section>

        <section className="card card-accent">
          <h2>Reassessed value (estimated)</h2>
          <div className="headline-metrics">
            <div className="headline-metric">
              <p className="headline-label">Estimated assessed value</p>
              <p className="stat-value">{formatAssessmentRange(parcel.new_assessment_total)}</p>
            </div>
            <div className="headline-metric">
              <p className="headline-label">Estimated taxes / year</p>
              <p className="stat-value">
                {displayTaxes
                  ? formatProportionalTaxRange(
                      parcel.new_assessment_total,
                      displayTaxes.future.total
                    )
                  : '—'}
              </p>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Land</dt>
              <dd>
                {formatProportionalValueRange(
                  parcel.new_assessment_total,
                  parcel.new_assessment_land
                )}
              </dd>
            </div>
            <div>
              <dt>Building</dt>
              <dd>{formatProportionalValueRange(parcel.new_assessment_total, buildingNew)}</dd>
            </div>
            {displayTaxes && (
              <div>
                <dt>Tax change / year</dt>
                <dd>
                  {formatProportionalTaxChangeRange(
                    parcel.new_assessment_total,
                    displayTaxes.current.total,
                    displayTaxes.future.total
                  )}
                </dd>
              </div>
            )}
          </dl>
          <p className="detail-foot">
            Modeled at <strong>current market value</strong>, not the CLR. Values and taxes are
            ~±10% ranges.{' '}
            <Link to="/assumptions">Methodology</Link>
          </p>
          <p className="detail-foot">{reassessmentTaxNote}</p>
        </section>
      </div>

      {taxes && displayTaxes && (
        <section className="mills-summary card" aria-label="Tax millage rates">
          <h2 className="mills-summary-title">Millage rates</h2>
          <p className="detail-foot mills-summary-intro">
            {taxes.tax_year ? `${taxes.tax_year} nominal millage` : '2026 nominal millage'} for the
            three main taxing bodies. After reassessment, rates adjust so each jurisdiction collects
            the same total revenue.
          </p>
          <div className="mills-summary-grid">
            <MillageSummaryItem
              kind="county"
              line={displayTaxes.current.county}
              future={displayTaxes.future.county}
            />
            <MillageSummaryItem
              kind="municipality"
              line={displayTaxes.current.municipality}
              future={displayTaxes.future.municipality}
            />
            <MillageSummaryItem
              kind="school"
              line={displayTaxes.current.school}
              future={displayTaxes.future.school}
            />
          </div>
        </section>
      )}

      <section className="card">
        <h2>Nearby parcels</h2>
        <p className="detail-foot">
          Zoomed to roughly a 1.5-block radius around this property. Color shows relative change
          versus countywide base growth (~total assessed value). Click a parcel to focus it, then
          use the popup to open full details.
        </p>
        {nearbyMapError && <p className="search-error">{nearbyMapError}</p>}
        {!nearbyMapError &&
          mapConfig &&
          mapConfig.mode !== 'unavailable' &&
          nearbyCenter && (
          <>
            <div className="map-shell">
              <ParcelMap
                config={mapConfig}
                highlightParcelId={focusedNearbyParcel?.parcelId}
                onParcelFocus={setFocusedNearbyParcel}
                onDataError={setNearbyMapError}
                initialCenter={nearbyCenter}
                initialZoom={16}
              />
            </div>
          </>
        )}
        {!nearbyMapError && mapConfig?.mode === 'unavailable' && (
          <p className="page-meta">Nearby parcel map is unavailable in this data bundle.</p>
        )}
      </section>

      {taxes && displayTaxes && (
        <section className="card">
          <h2>Estimated property taxes per year</h2>
          <p className="detail-foot tax-intro">
            {taxes.tax_year ? `${taxes.tax_year} nominal millage` : '2026 nominal millage'} · after reassessment,
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
            <span>I claim the long-time owner occupant protection (LOOP)</span>
          </label>
          <p className="tax-option-help">
            Under LOOP protections for households earning under 125% AMI who have lived in their home
            for 10 or more years, county property tax after reassessment would be limited to a{' '}
            <strong>50% increase</strong> over today&apos;s county tax (municipal and school taxes
            are unchanged). This is an illustrative calculation only.
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

          <table className="tax-table tax-table-breakdown">
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
              {(displayTaxes.current.additional ?? []).map((line, index) => (
                <TaxRow
                  key={line.mills_label ?? line.label ?? index}
                  kind="local"
                  line={line}
                  future={futureAdditionalLine(
                    line,
                    displayTaxes.future.additional?.[index],
                    displayTaxes.current.municipality,
                    displayTaxes.future.municipality
                  )}
                  showTaxable={homesteadEnabled}
                />
              ))}
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
                <td className="num" data-label="Today">
                  <span className="tax-cell-value">{formatMoney(displayTaxes.current.total)}</span>
                </td>
                <td className="num" data-label="After reassessment">
                  <span className="tax-cell-value">{formatMoney(displayTaxes.future.total)}</span>
                </td>
                <td className="num tax-delta" data-label="Change">
                  <div className="tax-cell-stack">
                    <span className="tax-cell-value">
                      {formatMoney(displayTaxes.delta.total_dollars)}
                    </span>
                    {displayTaxes.delta.total_percent != null && (
                      <span className="tax-delta-pct">
                        ({formatPct(displayTaxes.delta.total_percent)})
                      </span>
                    )}
                  </div>
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

      {countyBasePct != null && (
        <section className="card">
          <h2>Your home vs the county</h2>
          <p>
            Countywide residential assessed value in this dataset would grow by about{' '}
            <strong>{formatPct(countyBasePct)}</strong>
            {summary?.county_value_ratio != null && (
              <> ({summary.county_value_ratio.toFixed(2)}× total current value)</>
            )}
            .
          </p>
          <p className="detail-foot">
            Your change ({formatPct(parcel.value_change_pct)}) can be higher or lower than this
            countywide growth rate.
            {meanParcelPct != null && (
              <>
                {' '}
                Mean change per parcel (unweighted): {formatPct(meanParcelPct)}.
              </>
            )}
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

function MillageSummaryItem({
  kind,
  line,
  future,
}: {
  kind: TaxingBodyKind
  line: PropertyTaxes['current']['county']
  future: PropertyTaxes['future']['county']
}) {
  return (
    <div className="mills-summary-item">
      <TaxingBodyLabel kind={kind} name={line.label} />
      <p className="mills-summary-rate">
        <span className="mills-summary-label">Today</span>
        {formatCurrentMillsNote(line)}
      </p>
      <p className="mills-summary-rate">
        <span className="mills-summary-label">After reassessment</span>
        {formatFutureMillsNote(future)}
      </p>
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
  const currentMillsNote = formatCurrentMillsNote(line)
  const futureMillsNote = formatFutureMillsNote(future)

  return (
    <tr>
      <th scope="row">
        <TaxingBodyLabel kind={kind} name={line.label}>
          {cappedFrom != null && (
            <span className="tax-cap-note">Income limit applied (county only)</span>
          )}
        </TaxingBodyLabel>
      </th>
      <td className="num" data-label="Today">
        <div className="tax-cell-stack">
          <span className="tax-cell-value">{formatMoney(line.annual_tax)}</span>
          <span className="tax-mills-note">{currentMillsNote}</span>
        </div>
      </td>
      <td className="num" data-label="After reassessment">
        <div className="tax-cell-stack">
          <span className="tax-cell-value">{formatMoney(future.annual_tax)}</span>
          <span className="tax-mills-note">{futureMillsNote}</span>
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
        </div>
      </td>
      <td className="num" data-label="Change">
        <span className="tax-cell-value">{formatMoney(delta)}</span>
      </td>
    </tr>
  )
}

function formatCurrentMillsNote(line: TaxLine): string {
  if (line.split_mills) {
    return `Current: land ${formatMillsAmount(line.split_mills.land)} / building ${formatMillsAmount(line.split_mills.building)} mills`
  }
  const mills = line.mills_nominal ?? line.mills
  if (mills == null) return 'Current millage: unavailable'
  return `Current millage: ${formatMillsAmount(mills)} mills`
}

function formatFutureMillsNote(line: TaxLine): string {
  if (line.split_mills) {
    const factor = line.revenue_neutral_factor ?? 1
    const land = line.split_mills.land * factor
    const building = line.split_mills.building * factor
    return `After reassessment: land ${formatMillsAmount(land)} / building ${formatMillsAmount(building)} mills`
  }
  const mills = line.mills
  if (mills == null) return 'After reassessment: unavailable'
  return `After reassessment: ${formatMillsAmount(mills)} mills`
}

function describeReassessmentTaxFootnote(
  parcelGrowth: number | undefined,
  countyGrowth: number | undefined
): string {
  const base =
    'After reassessment, millage rates are reset so total tax revenue stays flat, as required by Pennsylvania anti-windfall provisions. The median taxpayer would see no change in their taxes.'

  if (
    parcelGrowth == null ||
    countyGrowth == null ||
    !Number.isFinite(parcelGrowth) ||
    !Number.isFinite(countyGrowth)
  ) {
    return `${base} Your taxes may still change if your home's value shifts more or less than the county average.`
  }

  const diff = parcelGrowth - countyGrowth
  if (Math.abs(diff) < 0.03) {
    return `${base} Your taxes may stay about the same because we estimate your home's value changed at about the county average.`
  }

  const taxDirection = diff > 0 ? 'go up' : 'go down'
  const pace = diff > 0 ? 'faster' : 'slower'
  const valueVerb = parcelGrowth >= 0 ? 'increased' : 'decreased'

  return `${base} Your taxes may ${taxDirection} because we estimate your home's value ${valueVerb} at a rate ${pace} than the county average.`
}

function assessmentBuilding(
  total: number | null | undefined,
  land: number | null | undefined
): number | null {
  if (total == null || land == null) return null
  return total - land
}

function formatMillsAmount(mills: number | null | undefined): string {
  if (mills == null) return '—'
  return mills.toFixed(2)
}

