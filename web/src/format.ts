export function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

const JURISDICTION_ABBREV: Record<string, string> = {
  MT: 'Mt',
  ST: 'St',
  MC: 'Mc',
  TWP: 'Twp',
  BORO: 'Boro',
  BOR: 'Bor',
  SD: 'SD',
}

/** Title-case jurisdiction names that arrive in ALL CAPS from county data. */
export function formatJurisdictionName(name: string | null | undefined): string {
  if (!name) return '—'
  const trimmed = name.trim()
  if (!trimmed) return '—'
  if (trimmed !== trimmed.toUpperCase()) return trimmed

  const capWord = (word: string): string => {
    const key = word.toUpperCase()
    if (JURISDICTION_ABBREV[key]) return JURISDICTION_ABBREV[key]
    if (/^mc[a-z]/.test(word)) {
      return `Mc${word.charAt(2).toUpperCase()}${word.slice(3)}`
    }
    return word.charAt(0).toUpperCase() + word.slice(1)
  }

  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word) =>
      word
        .split('-')
        .map((part) => capWord(part))
        .join('-')
    )
    .join(' ')
}

/** Minimum total band width for modeled assessment display ranges. */
const ASSESSMENT_BAND_MIN = 10_000

/** Round band values to the nearest $1,000. */
const ASSESSMENT_BAND_ROUND = 1_000

/** Round displayed valuation ranges to the nearest $1,000. */
const VALUATION_DISPLAY_ROUND = 1_000

/** Round displayed tax ranges to the nearest $10. */
const TAX_DISPLAY_ROUND = 10

function roundToBandIncrement(value: number): number {
  return Math.round(value / ASSESSMENT_BAND_ROUND) * ASSESSMENT_BAND_ROUND
}

function roundValuation(value: number): number {
  return Math.round(value / VALUATION_DISPLAY_ROUND) * VALUATION_DISPLAY_ROUND
}

function roundTax(value: number): number {
  return Math.round(value / TAX_DISPLAY_ROUND) * TAX_DISPLAY_ROUND
}

function assessmentBandWidth(value: number): number {
  const tenth = Math.round(value * 0.1)
  return Math.max(ASSESSMENT_BAND_MIN, roundToBandIncrement(tenth))
}

function midpointError(low: number, width: number, value: number): number {
  return Math.abs(low + width / 2 - value)
}

/** Display range with the estimate near the midpoint (width ≈ 10%, min $10k). */
export function assessmentBand(value: number): { low: number; high: number } {
  const width = assessmentBandWidth(value)
  const baseLow = roundToBandIncrement(value - width / 2)
  let low = baseLow
  let error = midpointError(low, width, value)

  for (const candidate of [baseLow - ASSESSMENT_BAND_ROUND, baseLow + ASSESSMENT_BAND_ROUND]) {
    if (candidate < 0) continue
    const candidateError = midpointError(candidate, width, value)
    if (candidateError < error) {
      low = candidate
      error = candidateError
    }
  }

  return { low, high: low + width }
}

export function formatAssessmentRange(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  const { low, high } = assessmentBand(value)
  return formatMoneyRange(low, high)
}

/** Scale a component value by the assessment display band. */
export function proportionalValueRange(
  assessment: number | null | undefined,
  component: number | null | undefined
): { low: number; high: number } | null {
  if (assessment == null || component == null || assessment <= 0 || Number.isNaN(component)) {
    return null
  }
  const { low, high } = assessmentBand(assessment)
  return {
    low: roundValuation(component * (low / assessment)),
    high: roundValuation(component * (high / assessment)),
  }
}

export function formatProportionalValueRange(
  assessment: number | null | undefined,
  component: number | null | undefined
): string {
  const range = proportionalValueRange(assessment, component)
  if (!range) return formatMoney(component)
  return formatMoneyRange(range.low, range.high)
}

/** Scale a tax estimate by the assessment display band (proportional to low/high assessment). */
export function proportionalTaxRange(
  assessment: number | null | undefined,
  tax: number | null | undefined
): { low: number; high: number } | null {
  if (assessment == null || tax == null || assessment <= 0 || Number.isNaN(tax)) return null
  const { low, high } = assessmentBand(assessment)
  return {
    low: roundTax(tax * (low / assessment)),
    high: roundTax(tax * (high / assessment)),
  }
}

export function proportionalTaxChangeRange(
  assessment: number | null | undefined,
  currentTax: number | null | undefined,
  futureTax: number | null | undefined
): { low: number; high: number } | null {
  const range = proportionalTaxRange(assessment, futureTax)
  if (range == null || currentTax == null || Number.isNaN(currentTax)) return null
  return {
    low: roundTax(range.low - currentTax),
    high: roundTax(range.high - currentTax),
  }
}

/** Tax change range with direction arrows (↑ increase, ↓ decrease). */
export function formatTaxChangeRange(low: number, high: number): string {
  const min = Math.min(low, high)
  const max = Math.max(low, high)
  if (Math.abs(min - max) < 0.01) {
    if (min > 0) return `↑ ${formatMoney(min)}`
    if (min < 0) return `↓ ${formatMoney(Math.abs(min))}`
    return '—'
  }
  if (min >= 0) return `↑ ${formatMoney(min)}–${formatMoney(max)}`
  if (max <= 0) return `↓ ${formatMoney(Math.abs(max))}–${formatMoney(Math.abs(min))}`
  return `↓ ${formatMoney(Math.abs(min))} to ↑ ${formatMoney(max)}`
}

export function formatProportionalTaxRange(
  assessment: number | null | undefined,
  tax: number | null | undefined
): string {
  const range = proportionalTaxRange(assessment, tax)
  if (!range) return formatMoney(tax)
  return formatMoneyRange(range.low, range.high)
}

export function formatProportionalTaxChangeRange(
  assessment: number | null | undefined,
  currentTax: number | null | undefined,
  futureTax: number | null | undefined
): string {
  const range = proportionalTaxChangeRange(assessment, currentTax, futureTax)
  if (!range) {
    if (futureTax != null && currentTax != null) {
      const delta = futureTax - currentTax
      return formatTaxChangeRange(delta, delta)
    }
    return '—'
  }
  return formatTaxChangeRange(range.low, range.high)
}

/** Currency range with the smaller amount first (scenario labels may not match tax order). */
export function formatMoneyRange(a: number, b: number): string {
  const min = Math.min(a, b)
  const max = Math.max(a, b)
  if (Math.abs(min - max) < 0.01) return formatMoney(min)
  return `${formatMoney(min)} – ${formatMoney(max)}`
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
