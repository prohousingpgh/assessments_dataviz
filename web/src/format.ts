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
