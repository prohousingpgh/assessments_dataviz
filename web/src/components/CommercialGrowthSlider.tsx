import {
  type CommercialGrowthRange,
  growthFromSliderPosition,
  sliderPositionForGrowth,
} from '../commercialGrowth'
import { formatPct } from '../format'

type CommercialGrowthSliderProps = {
  range: CommercialGrowthRange
  value: number
  onChange: (value: number) => void
}

export function CommercialGrowthSlider({
  range,
  value,
  onChange,
}: CommercialGrowthSliderProps) {
  const position = sliderPositionForGrowth(value, range)
  const residentialPct = range.residential * 100

  return (
    <div className="commercial-growth-control">
      <div className="commercial-growth-header">
        <label htmlFor="commercial-growth-slider">
          <strong>Commercial assessment growth</strong>
        </label>
        <span className="commercial-growth-value" aria-live="polite">
          {formatPct(value * 100)} commercial
        </span>
      </div>
      <input
        id="commercial-growth-slider"
        type="range"
        className="commercial-growth-slider"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(e) =>
          onChange(growthFromSliderPosition(Number(e.target.value), range))
        }
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={position}
        aria-valuetext={`${position} percent along scale from slower to faster commercial growth`}
      />
      <div className="commercial-growth-ticks" aria-hidden="true">
        <span>Slower ({formatPct(range.min * 100)})</span>
        <span>Same as residential ({formatPct(range.center * 100)})</span>
        <span>Faster ({formatPct(range.max * 100)})</span>
      </div>
      <p className="tax-option-help">
        We do not model commercial reassessment parcel-by-parcel. Drag the slider to set how much
        existing commercial assessed value grows when calculating revenue-neutral millage. The
        center marks your home&apos;s modeled residential growth ({formatPct(residentialPct)}).
      </p>
    </div>
  )
}
