import type { Parcel, PropertyTaxes, TaxBreakdown, TaxLine, TaxScenarioBreakdown } from './types'

export const HOMESTEAD_EXCLUSION = 18_000

export type HomesteadResult = {
  taxes: PropertyTaxes
  applied: boolean
  changed: boolean
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function millTax(taxable: number, mills: number | null | undefined): number {
  if (taxable <= 0 || mills == null) return 0
  return (taxable * mills) / 1000
}

function homesteadTaxable(assessed: number, applyHomestead: boolean): number {
  const base = Math.max(0, assessed)
  if (!applyHomestead) return base
  return Math.max(0, base - HOMESTEAD_EXCLUSION)
}

function scaleAssessed(base: number, newFmv: number, curFmv: number): number {
  if (base <= 0) return newFmv > 0 ? newFmv : 0
  if (curFmv <= 0) return base
  return base * (newFmv / curFmv)
}

function updateLine(line: TaxLine, taxable: number, mills: number | null | undefined): TaxLine {
  return {
    ...line,
    taxable_value: roundMoney(taxable),
    annual_tax: roundMoney(millTax(taxable, mills)),
  }
}

function parcelHasHomesteadFlag(parcel: Parcel): boolean {
  return (parcel.homestead_flag || '').trim().toUpperCase() === 'HOM'
}

export function defaultHomesteadToggle(parcel: Parcel): boolean {
  return parcelHasHomesteadFlag(parcel)
}

function buildAdjustedBreakdown(
  parcel: Parcel,
  enabled: boolean,
  countyLineCur: TaxLine,
  countyLineFut: TaxLine,
  muniLineCur: TaxLine,
  muniLineFut: TaxLine,
  schoolLineCur: TaxLine,
  schoolLineFut: TaxLine
): { current: TaxBreakdown; future: TaxBreakdown; delta: PropertyTaxes['delta'] } {
  const curFmv = parcel.current_assessment_total ?? 0
  const futFmv = parcel.new_assessment_total ?? 0

  const countyCurAssessed = parcel.county_total ?? curFmv
  const countyFutAssessed = scaleAssessed(countyCurAssessed, futFmv, curFmv)
  const localCurAssessed = parcel.local_total ?? curFmv
  const localFutAssessed = scaleAssessed(localCurAssessed, futFmv, curFmv)

  const countyCur = updateLine(
    countyLineCur,
    homesteadTaxable(countyCurAssessed, enabled),
    countyLineCur.mills
  )
  const countyFut = updateLine(
    countyLineFut,
    homesteadTaxable(countyFutAssessed, enabled),
    countyLineFut.mills
  )
  const muniCur = updateLine(
    muniLineCur,
    homesteadTaxable(localCurAssessed, enabled),
    muniLineCur.mills
  )
  const muniFut = updateLine(
    muniLineFut,
    homesteadTaxable(localFutAssessed, enabled),
    muniLineFut.mills
  )
  const schoolCur = updateLine(
    schoolLineCur,
    homesteadTaxable(localCurAssessed, enabled),
    schoolLineCur.mills
  )
  const schoolFut = updateLine(
    schoolLineFut,
    homesteadTaxable(localFutAssessed, enabled),
    schoolLineFut.mills
  )

  const currentTotal =
    countyCur.annual_tax + muniCur.annual_tax + schoolCur.annual_tax
  const futureTotal =
    countyFut.annual_tax + muniFut.annual_tax + schoolFut.annual_tax
  const delta = futureTotal - currentTotal
  const deltaPct = currentTotal > 0 ? (delta / currentTotal) * 100 : null

  return {
    current: {
      county: countyCur,
      municipality: muniCur,
      school: schoolCur,
      total: roundMoney(currentTotal),
    },
    future: {
      county: countyFut,
      municipality: muniFut,
      school: schoolFut,
      total: roundMoney(futureTotal),
    },
    delta: {
      total_dollars: roundMoney(delta),
      total_percent: deltaPct != null ? roundMoney(deltaPct) : null,
    },
  }
}

function adjustScenario(
  scen: TaxScenarioBreakdown,
  parcel: Parcel,
  enabled: boolean,
  currentTotal: number
): TaxScenarioBreakdown {
  const curFmv = parcel.current_assessment_total ?? 0
  const futFmv = parcel.new_assessment_total ?? 0
  const countyFutAssessed = scaleAssessed(parcel.county_total ?? curFmv, futFmv, curFmv)
  const localFutAssessed = scaleAssessed(parcel.local_total ?? curFmv, futFmv, curFmv)

  const countyFut = updateLine(
    scen.county,
    homesteadTaxable(countyFutAssessed, enabled),
    scen.county.mills
  )
  const muniFut = updateLine(
    scen.municipality,
    homesteadTaxable(localFutAssessed, enabled),
    scen.municipality.mills
  )
  const schoolFut = updateLine(
    scen.school,
    homesteadTaxable(localFutAssessed, enabled),
    scen.school.mills
  )
  const futureTotal =
    countyFut.annual_tax + muniFut.annual_tax + schoolFut.annual_tax
  const delta = futureTotal - currentTotal
  const deltaPct = currentTotal > 0 ? (delta / currentTotal) * 100 : null

  return {
    ...scen,
    county: countyFut,
    municipality: muniFut,
    school: schoolFut,
    total: roundMoney(futureTotal),
    delta: {
      total_dollars: roundMoney(delta),
      total_percent: deltaPct != null ? roundMoney(deltaPct) : null,
    },
  }
}

export function applyHomesteadExemption(
  taxes: PropertyTaxes,
  parcel: Parcel,
  enabled: boolean
): HomesteadResult {
  const baseline = buildAdjustedBreakdown(
    parcel,
    enabled,
    taxes.current.county,
    taxes.future.county,
    taxes.current.municipality,
    taxes.future.municipality,
    taxes.current.school,
    taxes.future.school
  )

  let futureScenarios = taxes.future_scenarios
  if (futureScenarios) {
    const updated: Record<string, TaxScenarioBreakdown> = {}
    for (const [id, scen] of Object.entries(futureScenarios)) {
      updated[id] = adjustScenario(scen, parcel, enabled, baseline.current.total)
    }
    futureScenarios = updated
  }

  const defaultId = taxes.default_scenario ?? 'baseline'
  const defaultScen = futureScenarios?.[defaultId]

  const adjusted: PropertyTaxes = {
    ...taxes,
    homestead_applied: enabled,
    homestead_exclusion: enabled ? HOMESTEAD_EXCLUSION : 0,
    current: baseline.current,
    future: defaultScen
      ? {
          county: defaultScen.county,
          municipality: defaultScen.municipality,
          school: defaultScen.school,
          total: defaultScen.total,
        }
      : baseline.future,
    delta: defaultScen?.delta ?? baseline.delta,
    future_scenarios: futureScenarios,
  }

  const dataHadHomestead = taxes.homestead_applied === true
  const changed =
    enabled !== dataHadHomestead ||
    Math.abs(adjusted.current.total - taxes.current.total) > 0.005 ||
    Math.abs(adjusted.future.total - taxes.future.total) > 0.005

  return {
    taxes: adjusted,
    applied: enabled,
    changed,
  }
}
