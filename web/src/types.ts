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
  total: number
}

export type PropertyTaxes = {
  tax_year?: number
  revenue_neutral_reassessment?: boolean
  homestead_applied?: boolean
  homestead_exclusion?: number
  current: TaxBreakdown
  future: TaxBreakdown
  delta: { total_dollars: number; total_percent: number | null }
  warnings?: string[]
  notes?: string[]
}

export type Manifest = {
  scenario_label?: string
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
