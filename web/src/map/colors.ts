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
