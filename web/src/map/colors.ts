import type { MapColorStop } from './types'

export const MAP_COLOR_STOPS: MapColorStop[] = [
  { pct: -80, color: '#2166ac' },
  { pct: -40, color: '#67a9cf' },
  { pct: -10, color: '#d1e5f0' },
  { pct: 10, color: '#fddbc7' },
  { pct: 40, color: '#ef8a62' },
  { pct: 80, color: '#b2182b' },
]

export function valueChangeColorExpression(
  property: string,
  stops: MapColorStop[] = MAP_COLOR_STOPS,
  countyAveragePct = 0
): unknown[] {
  const sorted = [...stops].sort((a, b) => a.pct - b.pct)
  const expr: unknown[] = [
    'interpolate',
    ['linear'],
    ['-', ['coalesce', ['get', property], countyAveragePct], countyAveragePct],
  ]
  for (const stop of sorted) {
    expr.push(stop.pct, stop.color)
  }
  return expr
}

export function formatLegendLabel(pct: number): string {
  if (pct < -40) return 'Much slower than county'
  if (pct < -10) return 'Slower than county'
  if (pct < 10) return 'About county average'
  if (pct < 40) return 'Slightly faster than county'
  if (pct < 80) return 'Faster than county'
  return 'Much faster than county'
}

/** Binned valuation ratio scale (1.0 = county median new÷old assessment ratio). */
export const VALUATION_RATIO_BINS = [
  { color: '#4575b4', label: '< 0.7' },
  { color: '#91bfdb', label: '0.7 – 0.8', ratio: 0.7 },
  { color: '#abd9e9', label: '0.8 – 0.9', ratio: 0.8 },
  { color: '#d9ef8b', label: '0.9 – 1.0', ratio: 0.9 },
  { color: '#ffffbf', label: '1.0 – 1.1', ratio: 1.0 },
  { color: '#fee090', label: '1.1 – 1.2', ratio: 1.1 },
  { color: '#fdae61', label: '1.2 – 1.3', ratio: 1.2 },
  { color: '#f46d43', label: '1.3 – 1.5', ratio: 1.3 },
  { color: '#d73027', label: '> 1.5', ratio: 1.5 },
] as const

export function valuationRatioColorExpression(property = 'valuation_ratio'): unknown[] {
  const expr: unknown[] = ['step', ['coalesce', ['get', property], 1], VALUATION_RATIO_BINS[0].color]
  for (const bin of VALUATION_RATIO_BINS) {
    if ('ratio' in bin) {
      expr.push(bin.ratio, bin.color)
    }
  }
  return expr
}

export function formatValuationRatio(ratio: number | null | undefined): string {
  if (ratio == null || Number.isNaN(ratio)) return 'n/a'
  return ratio.toFixed(2)
}

/** Sentinel in PMTiles / GeoJSON for missing numeric properties. */
export const MAP_MISSING_NUMERIC = -9999

export function parseMapNumericProp(
  value: string | number | null | undefined
): number | null {
  if (value == null || value === '') return null
  if (value === MAP_MISSING_NUMERIC || value === String(MAP_MISSING_NUMERIC)) return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n === MAP_MISSING_NUMERIC) return null
  return n
}
