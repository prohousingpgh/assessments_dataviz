import type { MapColorStop } from './types'

export const MAP_COLOR_STOPS: MapColorStop[] = [
  { pct: -50, color: '#2166ac' },
  { pct: 0, color: '#67a9cf' },
  { pct: 50, color: '#d1e5f0' },
  { pct: 100, color: '#fddbc7' },
  { pct: 150, color: '#ef8a62' },
  { pct: 200, color: '#b2182b' },
]

export function valueChangeColorExpression(
  property: string,
  stops: MapColorStop[] = MAP_COLOR_STOPS
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

export function formatLegendLabel(pct: number): string {
  if (pct <= -50) return 'Large decrease'
  if (pct < 0) return 'Decrease'
  if (pct < 50) return 'Moderate increase'
  if (pct < 100) return 'Large increase'
  if (pct < 150) return 'Very large increase'
  return 'Extreme increase'
}
