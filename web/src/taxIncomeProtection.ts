import { additionalTaxTotal } from './taxBreakdown'
import type { PropertyTaxes, TaxScenarioBreakdown } from './types'

/** Max county tax after reassessment = 150% of today's county tax (50% increase cap). */
export const COUNTY_TAX_CAP_MULTIPLIER = 1.5

export type IncomeProtectionResult = {
  taxes: PropertyTaxes
  countyCapped: boolean
  uncappedCountyFuture: number
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function capCountyFuture(
  taxes: PropertyTaxes,
  enabled: boolean
): { taxes: PropertyTaxes; countyCapped: boolean; uncappedCountyFuture: number } {
  const countyCur = taxes.current.county.annual_tax
  const countyFut = taxes.future.county.annual_tax

  if (!enabled) {
    return { taxes, countyCapped: false, uncappedCountyFuture: countyFut }
  }

  const cap = countyCur * COUNTY_TAX_CAP_MULTIPLIER
  const cappedCountyFut = Math.min(countyFut, cap)
  const countyCapped = cappedCountyFut < countyFut - 0.005

  if (!countyCapped) {
    return { taxes, countyCapped: false, uncappedCountyFuture: countyFut }
  }

  const futureTotal =
    cappedCountyFut +
    taxes.future.municipality.annual_tax +
    taxes.future.school.annual_tax +
    additionalTaxTotal(taxes.future)
  const delta = futureTotal - taxes.current.total
  const deltaPct =
    taxes.current.total > 0 ? (delta / taxes.current.total) * 100 : null

  return {
    taxes: {
      ...taxes,
      future: {
        ...taxes.future,
        county: { ...taxes.future.county, annual_tax: roundMoney(cappedCountyFut) },
        total: roundMoney(futureTotal),
      },
      delta: {
        total_dollars: roundMoney(delta),
        total_percent: deltaPct != null ? roundMoney(deltaPct) : null,
      },
    },
    countyCapped: true,
    uncappedCountyFuture: countyFut,
  }
}

function capScenario(
  scen: TaxScenarioBreakdown,
  currentCountyTax: number,
  currentTotal: number,
  enabled: boolean
): { scen: TaxScenarioBreakdown; capped: boolean; uncappedCounty: number } {
  const countyFut = scen.county.annual_tax
  if (!enabled) {
    return { scen, capped: false, uncappedCounty: countyFut }
  }

  const cap = currentCountyTax * COUNTY_TAX_CAP_MULTIPLIER
  const cappedCountyFut = Math.min(countyFut, cap)
  const countyCapped = cappedCountyFut < countyFut - 0.005
  if (!countyCapped) {
    return { scen, capped: false, uncappedCounty: countyFut }
  }

  const futureTotal =
    cappedCountyFut +
    scen.municipality.annual_tax +
    scen.school.annual_tax +
    (scen.additional ?? []).reduce((sum, line) => sum + line.annual_tax, 0)
  const delta = futureTotal - currentTotal
  const deltaPct = currentTotal > 0 ? (delta / currentTotal) * 100 : null

  return {
    scen: {
      ...scen,
      county: { ...scen.county, annual_tax: roundMoney(cappedCountyFut) },
      total: roundMoney(futureTotal),
      delta: {
        total_dollars: roundMoney(delta),
        total_percent: deltaPct != null ? roundMoney(deltaPct) : null,
      },
    },
    capped: true,
    uncappedCounty: countyFut,
  }
}

export function applyIncomeProtection(
  taxes: PropertyTaxes,
  enabled: boolean
): IncomeProtectionResult {
  let working = taxes
  let countyCapped = false
  let uncappedCountyFuture = taxes.future.county.annual_tax

  const base = capCountyFuture(working, enabled)
  working = base.taxes
  countyCapped = base.countyCapped
  uncappedCountyFuture = base.uncappedCountyFuture

  if (working.future_scenarios) {
    const updated: Record<string, TaxScenarioBreakdown> = {}
    for (const [id, scen] of Object.entries(working.future_scenarios)) {
      const result = capScenario(
        scen,
        working.current.county.annual_tax,
        working.current.total,
        enabled
      )
      updated[id] = result.scen
      if (id === (working.default_scenario ?? 'baseline') && result.capped) {
        countyCapped = true
        uncappedCountyFuture = result.uncappedCounty
      }
    }
    const defaultId = working.default_scenario ?? 'baseline'
    const baseline = updated[defaultId]
    working = {
      ...working,
      future_scenarios: updated,
      future: baseline
        ? {
            county: baseline.county,
            municipality: baseline.municipality,
            school: baseline.school,
            additional: baseline.additional,
            total: baseline.total,
          }
        : working.future,
      delta: baseline?.delta ?? working.delta,
    }
  }

  return { taxes: working, countyCapped, uncappedCountyFuture }
}
