import type { TaxBreakdown, TaxLine } from './types'

export function additionalTaxTotal(breakdown: TaxBreakdown): number {
  return (breakdown.additional ?? []).reduce((sum, line) => sum + line.annual_tax, 0)
}

export function breakdownTotal(breakdown: TaxBreakdown): number {
  return (
    breakdown.county.annual_tax +
    breakdown.municipality.annual_tax +
    breakdown.school.annual_tax +
    additionalTaxTotal(breakdown)
  )
}

export function withBreakdownTotal(breakdown: TaxBreakdown): TaxBreakdown {
  return { ...breakdown, total: Math.round(breakdownTotal(breakdown) * 100) / 100 }
}

export function mapAdditionalLines(
  lines: TaxLine[] | undefined,
  taxable: number
): TaxLine[] {
  return (lines ?? []).map((line) => ({
    ...line,
    taxable_value: Math.round(taxable * 100) / 100,
    annual_tax:
      line.mills != null
        ? Math.round(((taxable * line.mills) / 1000) * 100) / 100
        : line.annual_tax,
  }))
}

/** Municipality revenue-neutral factor from current vs future muni tax lines. */
export function municipalityRevenueNeutralFactor(
  muniCurrent: TaxLine,
  muniFuture: TaxLine
): number {
  const nominal = muniCurrent.mills ?? muniFuture.mills_nominal
  const effective = muniFuture.mills
  if (nominal != null && effective != null && nominal !== 0) {
    return effective / nominal
  }
  return 1
}

/** Scale Pittsburgh parks/library (etc.) millage like municipality for reassessment. */
export function buildScaledAdditionalLines(
  lines: TaxLine[] | undefined,
  taxableFuture: number,
  revenueNeutralFactor: number
): TaxLine[] {
  const taxable = Math.round(taxableFuture * 100) / 100
  return (lines ?? []).map((line) => {
    const nominal = line.mills_nominal ?? line.mills
    const effective =
      nominal != null ? Math.round(nominal * revenueNeutralFactor * 10000) / 10000 : line.mills
    const annual_tax =
      effective != null
        ? Math.round(((taxable * effective) / 1000) * 100) / 100
        : line.annual_tax
    const out: TaxLine = {
      ...line,
      taxable_value: taxable,
      mills: effective,
      annual_tax,
    }
    if (nominal != null && revenueNeutralFactor !== 1) {
      out.mills_nominal = Math.round(nominal * 10000) / 10000
      out.revenue_neutral_factor = Math.round(revenueNeutralFactor * 1_000_000) / 1_000_000
    }
    return out
  })
}

/** Future misc-levy line for display; scales from muni factor if API future row missing. */
export function futureAdditionalLine(
  current: TaxLine,
  futureLine: TaxLine | undefined,
  muniCurrent: TaxLine,
  muniFuture: TaxLine
): TaxLine {
  if (futureLine) return futureLine
  const factor = municipalityRevenueNeutralFactor(muniCurrent, muniFuture)
  const scaled = buildScaledAdditionalLines(
    [current],
    muniFuture.taxable_value,
    factor
  )
  return scaled[0] ?? current
}
