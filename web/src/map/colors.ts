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
  if (pct < 10) return 'About county base growth'
  if (pct < 40) return 'Slightly faster than county'
  if (pct < 80) return 'Faster than county'
  return 'Much faster than county'
}

/** CSS linear-gradient matching map color stops (for legend bar). */
export function legendGradientCss(stops: MapColorStop[] = MAP_COLOR_STOPS): string {
  const sorted = [...stops].sort((a, b) => a.pct - b.pct)
  if (sorted.length === 0) return 'transparent'
  const min = sorted[0].pct
  const max = sorted[sorted.length - 1].pct
  const span = max - min || 1
  const parts = sorted.map(
    (stop) => `${stop.color} ${(((stop.pct - min) / span) * 100).toFixed(1)}%`
  )
  return `linear-gradient(to right, ${parts.join(', ')})`
}

export type ValuationRatioBin = {
  color: string
  label: string
  ratio?: number
}

/** CSS linear-gradient approximating step-based valuation ratio bins. */
export function valuationRatioGradientCss(
  bins: readonly ValuationRatioBin[] = VALUATION_RATIO_BINS,
  minRatio = 0.65,
  maxRatio = 1.55
): string {
  if (bins.length === 0) return 'transparent'
  const span = maxRatio - minRatio || 1
  const points: { ratio: number; color: string }[] = [{ ratio: minRatio, color: bins[0].color }]
  for (const bin of bins) {
    if (bin.ratio != null) {
      points.push({ ratio: bin.ratio, color: bin.color })
    }
  }
  const parts = points.map(
    (point) => `${point.color} ${(((point.ratio - minRatio) / span) * 100).toFixed(1)}%`
  )
  const lastColor = points[points.length - 1]?.color ?? bins[0].color
  return `linear-gradient(to right, ${parts.join(', ')}, ${lastColor} 100%)`
}

export function relativeChangeCenterPosition(stops: MapColorStop[] = MAP_COLOR_STOPS): number {
  const sorted = [...stops].sort((a, b) => a.pct - b.pct)
  const min = sorted[0]?.pct ?? 0
  const max = sorted[sorted.length - 1]?.pct ?? 0
  if (max === min) return 50
  return ((0 - min) / (max - min)) * 100
}

export function valuationRatioCenterPosition(minRatio = 0.65, maxRatio = 1.55): number {
  const span = maxRatio - minRatio || 1
  return ((1 - minRatio) / span) * 100
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

export const TAX_DELTA_SPAN_DOLLARS = 2400

export const TAX_DELTA_COLOR_STOPS: MapColorStop[] = [
  { pct: -2400, color: '#006837' },
  { pct: -1200, color: '#31a354' },
  { pct: -400, color: '#a1d99b' },
  { pct: 0, color: '#ffffbf' },
  { pct: 400, color: '#fcae91' },
  { pct: 1200, color: '#de2d26' },
  { pct: 2400, color: '#a50026' },
]

export function taxDeltaColorExpression(
  property = 'tax_delta_dollars',
  stops: MapColorStop[] = TAX_DELTA_COLOR_STOPS
): unknown[] {
  const sorted = [...stops].sort((a, b) => a.pct - b.pct)
  const expr: unknown[] = [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', property], 0],
  ]
  for (const stop of sorted) {
    expr.push(stop.pct, stop.color)
  }
  return expr
}

export function taxDeltaCenterPosition(stops: MapColorStop[] = TAX_DELTA_COLOR_STOPS): number {
  const sorted = [...stops].sort((a, b) => a.pct - b.pct)
  const min = sorted[0]?.pct ?? 0
  const max = sorted[sorted.length - 1]?.pct ?? 0
  if (max === min) return 50
  return ((0 - min) / (max - min)) * 100
}

export function formatTaxDelta(dollars: number | null | undefined): string {
  if (dollars == null || Number.isNaN(dollars)) return 'n/a'
  const rounded = Math.round(dollars)
  const formatted = Math.abs(rounded).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
  if (rounded > 0) return `+${formatted}/yr`
  if (rounded < 0) return `−${formatted}/yr`
  return `${formatted}/yr`
}

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
