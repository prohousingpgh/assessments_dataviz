/** Dollar-weighted county residential base growth from total value ratio. */
export function countyBaseGrowthPct(ratio?: number | null): number | null {
  if (ratio == null || Number.isNaN(ratio) || ratio <= 0) return null
  return (ratio - 1) * 100
}

/** Primary county benchmark from summary stats (prefers dollar-weighted). */
export function countyBaseGrowthFromSummary(summary: {
  county_base_growth_pct?: number | null
  county_value_ratio?: number | null
} | null | undefined): number | null {
  if (!summary) return null
  if (summary.county_base_growth_pct != null && !Number.isNaN(summary.county_base_growth_pct)) {
    return summary.county_base_growth_pct
  }
  return countyBaseGrowthPct(summary.county_value_ratio)
}
