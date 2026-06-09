import { formatPct } from './format'
import { buildScaledAdditionalLines, withBreakdownTotal } from './taxBreakdown'
import type {
  PropertyTaxes,
  RevenueNeutralBase,
  TaxBreakdown,
  TaxDelta,
  TaxLine,
} from './types'

const REFERENCE_GROWTH = 0.2
/** Commercial growth slider endpoints (decimal): +20% … +220%. */
export const COMMERCIAL_GROWTH_MIN = 0.2
export const COMMERCIAL_GROWTH_MAX = 2.2

export type CommercialGrowthRange = {
  /** Countywide average residential growth — slider midpoint (decimal, ≥ 0). */
  center: number
  min: number
  max: number
  /** This parcel's residential growth (for comparison copy only). */
  parcelResidential?: number
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function roundMills(n: number): number {
  return Math.round(n * 10000) / 10000
}

function millTax(taxable: number, mills: number | null | undefined): number {
  if (taxable <= 0 || mills == null) return 0
  return (taxable * mills) / 1000
}

export function parcelResidentialGrowthRate(
  currentTotal: number | null | undefined,
  futureTotal: number | null | undefined
): number {
  if (currentTotal == null || futureTotal == null || currentTotal <= 0) {
    return REFERENCE_GROWTH
  }
  return (futureTotal - currentTotal) / currentTotal
}

/** Countywide residential base growth as a decimal (0.85 = +85%). Prefers dollar-weighted ratio. */
export function countyAverageResidentialGrowth(
  avgValueChangePct?: number | null,
  countyValueRatio?: number | null
): number {
  if (
    countyValueRatio != null &&
    !Number.isNaN(countyValueRatio) &&
    countyValueRatio > 0
  ) {
    return countyValueRatio - 1
  }
  if (avgValueChangePct != null && !Number.isNaN(avgValueChangePct)) {
    return avgValueChangePct / 100
  }
  return REFERENCE_GROWTH
}

/** Fixed commercial range with countywide average residential growth at the slider midpoint. */
export function commercialGrowthRange(
  countyAvgResidentialGrowth: number,
  parcelResidentialGrowth?: number | null
): CommercialGrowthRange {
  const center = Math.max(
    0,
    Number.isFinite(countyAvgResidentialGrowth)
      ? countyAvgResidentialGrowth
      : REFERENCE_GROWTH
  )
  const range: CommercialGrowthRange = {
    center,
    min: COMMERCIAL_GROWTH_MIN,
    max: COMMERCIAL_GROWTH_MAX,
  }
  if (
    parcelResidentialGrowth != null &&
    Number.isFinite(parcelResidentialGrowth)
  ) {
    range.parcelResidential = parcelResidentialGrowth
  }
  return range
}

/** Format a growth rate stored as a decimal (0.45 → "+45.0%"). */
export function formatCommercialGrowthPercent(decimalRate: number): string {
  return formatPct(decimalRate * 100)
}

/**
 * Map slider 0–100% to growth: 0% = min, 50% = county average (center), 100% = max.
 * Piecewise so the midpoint stays at the countywide average (center).
 */
export function growthFromSliderPosition(
  positionPercent: number,
  range: CommercialGrowthRange
): number {
  const p = Math.max(0, Math.min(100, positionPercent))
  if (p <= 50) {
    const lowSpan = range.center - range.min
    if (lowSpan <= 0) return range.center
    return range.min + (lowSpan * p) / 50
  }
  const highSpan = range.max - range.center
  if (highSpan <= 0) return range.center
  return range.center + (highSpan * (p - 50)) / 50
}

export function sliderPositionForGrowth(
  growth: number,
  range: CommercialGrowthRange
): number {
  const g = Math.max(range.min, Math.min(range.max, growth))
  if (g <= range.center) {
    const lowSpan = range.center - range.min
    if (lowSpan <= 0) return 50
    return Math.round(((g - range.min) / lowSpan) * 50)
  }
  const highSpan = range.max - range.center
  if (highSpan <= 0) return 50
  return Math.round(50 + ((g - range.center) / highSpan) * 50)
}

export function clampCommercialGrowth(
  growth: number,
  range: CommercialGrowthRange
): number {
  return Math.max(range.min, Math.min(range.max, growth))
}

/** Growth rates at the three labeled slider stops (for tick labels). */
export function sliderEndpointGrowth(
  range: CommercialGrowthRange,
  stop: 'min' | 'center' | 'max'
): number {
  if (stop === 'min') return range.min
  if (stop === 'max') return range.max
  return range.center
}

export function defaultCommercialGrowthRate(taxes: PropertyTaxes): number {
  const countyAvg =
    taxes.county_avg_residential_growth_rate ??
    countyAverageResidentialGrowth(
      undefined,
      taxes.county_residential_value_ratio
    )
  return commercialGrowthRange(countyAvg).center
}

export function countyAvgFromTaxesOrSummary(
  taxes: PropertyTaxes | null,
  summary: {
    avg_value_change_pct?: number
    county_value_ratio?: number
    county_base_growth_pct?: number
  } | null
): number {
  if (taxes?.county_avg_residential_growth_rate != null) {
    return taxes.county_avg_residential_growth_rate
  }
  const ratio = summary?.county_value_ratio ?? taxes?.county_residential_value_ratio
  if (summary?.county_base_growth_pct != null) {
    return summary.county_base_growth_pct / 100
  }
  return countyAverageResidentialGrowth(summary?.avg_value_change_pct, ratio)
}

/**
 * Narrative for commercial vs residential growth. Compare commercial to the
 * countywide average residential rate (slider center), not this parcel's rate.
 */
export function describeCommercialGrowthAssumption(
  commercialGrowth: number,
  countyResidentialGrowth: number
): string {
  const c = commercialGrowth
  const r = countyResidentialGrowth

  if (r < -0.01 && c <= 0.005) {
    return 'Assumes commercial valuations held steady while residential values declined countywide.'
  }
  if (r > 0.01 && c <= 0.005) {
    return 'Assumes commercial valuations did not increase while residential values rose countywide.'
  }

  const diff = c - r
  const scale = Math.max(Math.abs(r), Math.abs(c), 0.05)
  const relativeDiff = diff / scale

  if (Math.abs(diff) < 0.03 || Math.abs(relativeDiff) < 0.05) {
    return 'Assumes commercial valuations grew at about the same rate as residential countywide.'
  }
  if (diff < 0) {
    if (relativeDiff > -0.12) {
      return 'Assumes commercial valuations grew more slowly than residential countywide.'
    }
    if (relativeDiff > -0.25) {
      return 'Assumes commercial valuations grew somewhat more slowly than residential countywide.'
    }
    return 'Assumes commercial valuations grew significantly more slowly than residential countywide.'
  }
  if (relativeDiff < 0.12) {
    return 'Assumes commercial valuations grew somewhat faster than residential countywide.'
  }
  if (relativeDiff < 0.25) {
    return 'Assumes commercial valuations grew faster than residential countywide.'
  }
  return 'Assumes commercial valuations grew significantly faster than residential countywide.'
}

function parseGrowthKey(key: string): number {
  return Number.parseFloat(key)
}

function interpolateFactor(factorsByGrowth: Record<string, number>, growth: number): number {
  const points = Object.entries(factorsByGrowth)
    .map(([k, f]) => ({ growth: parseGrowthKey(k), factor: f }))
    .filter((p) => !Number.isNaN(p.growth))
    .sort((a, b) => a.growth - b.growth)

  if (points.length === 0) return 1
  if (points.length === 1) return points[0].factor

  if (growth <= points[0].growth) return points[0].factor
  const last = points[points.length - 1]
  if (growth >= last.growth) return last.factor

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (growth >= a.growth && growth <= b.growth) {
      const span = b.growth - a.growth
      if (span <= 0) return b.factor
      const t = (growth - a.growth) / span
      return a.factor + (b.factor - a.factor) * t
    }
  }
  return last.factor
}

export function revenueNeutralFactor(base: RevenueNeutralBase, growth: number): number {
  if (base.method === 'interpolation' && base.factors_by_growth) {
    return interpolateFactor(base.factors_by_growth, growth)
  }
  const cur = base.current_taxable_sum ?? 0
  const resFut = base.residential_future_taxable ?? 0
  const comm = base.commercial_current_taxable ?? 0
  const futureSum = resFut + comm * (1 + growth)
  if (futureSum <= 0) return 1
  return cur / futureSum
}

function buildFutureLine(
  currentLine: TaxLine,
  taxableFuture: number,
  nominalMills: number | null,
  factor: number
): TaxLine {
  const effectiveMills =
    nominalMills != null ? roundMills(nominalMills * factor) : null
  const annual = millTax(taxableFuture, effectiveMills)
  const line: TaxLine = {
    ...currentLine,
    taxable_value: roundMoney(taxableFuture),
    mills: effectiveMills,
    annual_tax: roundMoney(annual),
  }
  if (nominalMills != null && factor !== 1) {
    line.mills_nominal = roundMills(nominalMills)
    line.revenue_neutral_factor = Math.round(factor * 1_000_000) / 1_000_000
  }
  return line
}

function futureTaxableFromLine(line: TaxLine): number {
  return line.taxable_value
}

export function applyCommercialGrowth(
  taxes: PropertyTaxes,
  commercialGrowthRate: number
): PropertyTaxes {
  const bases = taxes.revenue_neutral_bases
  if (!bases?.county && !bases?.municipality && !bases?.school) {
    return taxes
  }

  const countyAvg =
    taxes.county_avg_residential_growth_rate ??
    countyAverageResidentialGrowth(
      undefined,
      taxes.county_residential_value_ratio
    )
  const range = commercialGrowthRange(countyAvg)
  const growth = clampCommercialGrowth(commercialGrowthRate, range)

  const countyFactor = bases.county
    ? revenueNeutralFactor(bases.county, growth)
    : 1
  const muniFactor = bases.municipality
    ? revenueNeutralFactor(bases.municipality, growth)
    : 1
  const schoolFactor = bases.school
    ? revenueNeutralFactor(bases.school, growth)
    : 1

  const countyNominal = taxes.current.county.mills
  const muniNominal = taxes.current.municipality.mills
  const schoolNominal = taxes.current.school.mills

  const countyFut = buildFutureLine(
    taxes.future.county,
    futureTaxableFromLine(taxes.future.county),
    countyNominal,
    countyFactor
  )
  const muniFut = buildFutureLine(
    taxes.future.municipality,
    futureTaxableFromLine(taxes.future.municipality),
    muniNominal,
    muniFactor
  )
  const schoolFut = buildFutureLine(
    taxes.future.school,
    futureTaxableFromLine(taxes.future.school),
    schoolNominal,
    schoolFactor
  )

  const additionalFut = buildScaledAdditionalLines(
    taxes.current.additional,
    muniFut.taxable_value,
    muniFactor
  )
  const future: TaxBreakdown = withBreakdownTotal({
    county: countyFut,
    municipality: muniFut,
    school: schoolFut,
    additional: additionalFut,
    total: 0,
  })

  const delta: TaxDelta = {
    total_dollars: roundMoney(future.total - taxes.current.total),
    total_percent:
      taxes.current.total > 0
        ? roundMoney(((future.total - taxes.current.total) / taxes.current.total) * 100)
        : null,
  }

  return {
    ...taxes,
    commercial_growth_rate: growth,
    future,
    delta,
    future_scenarios: undefined,
  }
}

export { REFERENCE_GROWTH }
