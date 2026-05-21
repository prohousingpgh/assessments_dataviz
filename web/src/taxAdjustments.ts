import { applyHomesteadExemption } from './homesteadExemption'
import { applyIncomeProtection } from './taxIncomeProtection'
import type { Parcel, PropertyTaxes } from './types'

export function applyParcelTaxAdjustments(
  taxes: PropertyTaxes,
  parcel: Parcel,
  homesteadEnabled: boolean,
  incomeBelow125Ami: boolean,
  countyResidentialValueRatio?: number | null
): {
  displayTaxes: PropertyTaxes
  homestead: ReturnType<typeof applyHomesteadExemption>
  income: ReturnType<typeof applyIncomeProtection> | null
} {
  const homestead = applyHomesteadExemption(
    taxes,
    parcel,
    homesteadEnabled,
    countyResidentialValueRatio
  )
  let working = homestead.taxes

  let income: ReturnType<typeof applyIncomeProtection> | null = null
  if (incomeBelow125Ami) {
    income = applyIncomeProtection(working, true)
    working = income.taxes
  }

  return { displayTaxes: working, homestead, income }
}
