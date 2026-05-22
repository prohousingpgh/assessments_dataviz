import type {
  PropertyTaxes,
  RevenueNeutralBase,
  TaxBreakdown,
  TaxDelta,
  TaxLine,
} from './types'

const REFERENCE_GROWTH = 0.2
const ABSOLUTE_GROWTH_CAP = 1.5

export type CommercialGrowthRange = {
  /** Residential growth used as the slider midpoint (may be negative). */
  residential: number
  /** Commercial growth at slider center (≥ 0). */
  center: number
  min: number
  max: number
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

/** Symmetric range around residential growth; residential sits at the slider midpoint. */
export function commercialGrowthRange(residentialGrowth: number): CommercialGrowthRange {
  const residential = Number.isFinite(residentialGrowth) ? residentialGrowth : REFERENCE_GROWTH
  const center = Math.max(0, residential)
  const halfSpan = Math.max(0.15, center * 0.5, 0.2)
  return {
    residential,
    center,
    min: Math.max(0, center - halfSpan),
    max: Math.min(ABSOLUTE_GROWTH_CAP, center + halfSpan),
  }
}

export function growthFromSliderPosition(
  positionPercent: number,
  range: CommercialGrowthRange
): number {
  const t = Math.max(0, Math.min(100, positionPercent)) / 100
  const span = range.max - range.min
  if (span <= 0) return range.center
  return range.min + span * t
}

export function sliderPositionForGrowth(
  growth: number,
  range: CommercialGrowthRange
): number {
  const span = range.max - range.min
  if (span <= 0) return 50
  const t = (growth - range.min) / span
  return Math.round(Math.max(0, Math.min(1, t)) * 100)
}

export function defaultCommercialGrowthRate(taxes: PropertyTaxes): number {
  const residential =
    taxes.parcel_residential_growth_rate ?? REFERENCE_GROWTH
  return commercialGrowthRange(residential).center
}

export function describeCommercialGrowthAssumption(
  commercialGrowth: number,
  residentialGrowth: number
): string {
  const c = commercialGrowth
  const r = residentialGrowth

  if (r < -0.01 && c <= 0.005) {
    return 'Assumes commercial valuations held steady while residential values declined.'
  }
  if (r > 0.01 && c <= 0.005) {
    return 'Assumes commercial valuations did not increase while residential values rose.'
  }

  const diff = c - Math.max(0, r)
  if (Math.abs(diff) < 0.02) {
    return 'Assumes commercial valuations grew at about the same rate as residential.'
  }
  if (diff < 0) {
    if (diff > -0.08) {
      return 'Assumes commercial valuations grew more slowly than residential.'
    }
    if (diff > -0.2) {
      return 'Assumes commercial valuations grew somewhat more slowly than residential.'
    }
    return 'Assumes commercial valuations grew significantly more slowly than residential.'
  }
  if (diff < 0.08) {
    return 'Assumes commercial valuations grew somewhat faster than residential.'
  }
  if (diff < 0.2) {
    return 'Assumes commercial valuations grew faster than residential.'
  }
  return 'Assumes commercial valuations grew significantly faster than residential.'
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

  const residential = taxes.parcel_residential_growth_rate ?? REFERENCE_GROWTH
  const range = commercialGrowthRange(residential)
  const growth = Math.max(0, Math.min(range.max, commercialGrowthRate))

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

  const future: TaxBreakdown = {
    county: countyFut,
    municipality: muniFut,
    school: schoolFut,
    total: roundMoney(
      countyFut.annual_tax + muniFut.annual_tax + schoolFut.annual_tax
    ),
  }

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
