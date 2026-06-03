export type SearchResult = {
  parcel_id: string
  address_display: string
  municipality: string
  school_district: string
  use_description: string
  current_assessment_total: number
  new_assessment_total: number
  value_change_pct: number | null
}

export type Parcel = SearchResult & {
  land_area_sqft: number | null
  building_area_sqft: number | null
  current_assessment_land: number | null
  new_assessment_land: number | null
  value_change_dollars: number | null
  address_search?: string
  county_total?: number | null
  local_total?: number | null
  homestead_flag?: string | null
}

export type CountySummary = {
  parcel_count?: number
  avg_value_change_pct?: number
  county_value_ratio?: number
}

export type TaxLine = {
  label: string
  taxable_value: number
  mills: number | null
  mills_nominal?: number | null
  revenue_neutral_factor?: number | null
  mills_label?: string | null
  annual_tax: number
}

export type TaxBreakdown = {
  county: TaxLine
  municipality: TaxLine
  school: TaxLine
  /** Extra local levies (e.g. Pittsburgh parks & library). */
  additional?: TaxLine[]
  total: number
}

export type TaxDelta = {
  total_dollars: number
  total_percent: number | null
}

export type TaxScenarioBreakdown = {
  id: string
  label: string
  short_label: string
  commercial_growth_rate?: number
  county: TaxLine
  municipality: TaxLine
  school: TaxLine
  additional?: TaxLine[]
  total: number
  delta: TaxDelta
  jurisdiction_factors?: Record<string, number>
}

export type HomesteadBodyExclusions = {
  current: number
  future: number
}

export type HomesteadExclusionsByBody = {
  county: HomesteadBodyExclusions
  municipality: HomesteadBodyExclusions
  school: HomesteadBodyExclusions
}

export type RevenueNeutralBase = {
  jurisdiction_type?: string
  jurisdiction_name?: string
  method?: 'sums' | 'interpolation'
  current_taxable_sum?: number
  residential_future_taxable?: number
  commercial_current_taxable?: number
  factors_by_growth?: Record<string, number>
}

export type RevenueNeutralBases = {
  reference_commercial_growth?: number
  county?: RevenueNeutralBase
  municipality?: RevenueNeutralBase
  school?: RevenueNeutralBase
}

export type PropertyTaxes = {
  tax_year?: number
  revenue_neutral_reassessment?: boolean
  parcel_residential_growth_rate?: number | null
  /** Countywide average residential assessment growth (decimal); slider midpoint. */
  county_avg_residential_growth_rate?: number | null
  commercial_growth_rate?: number
  revenue_neutral_bases?: RevenueNeutralBases
  homestead_applied?: boolean
  homestead_exclusion?: number
  homestead_exclusion_future?: number
  homestead_exclusion_school?: number
  homestead_exclusion_school_future?: number
  homestead_exclusion_municipality?: number
  homestead_exclusion_municipality_future?: number
  homestead_exclusions?: HomesteadExclusionsByBody
  county_residential_value_ratio?: number | null
  default_scenario?: string
  current: TaxBreakdown
  future: TaxBreakdown
  delta: TaxDelta
  future_scenarios?: Record<string, TaxScenarioBreakdown>
  warnings?: string[]
  notes?: string[]
}

export type Manifest = {
  scenario_label?: string
  parcel_count?: number
  data_as_of?: string
  disclaimer?: string
  methodology_url?: string
  valuation_date?: string
  tax_year?: number
  tax_millage_year?: number
  tax_assumptions?: string
  county_residential_value_ratio?: number
  county_summary?: CountySummary
}
