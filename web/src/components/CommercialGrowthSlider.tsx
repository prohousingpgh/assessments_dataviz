import {
  type CommercialGrowthRange,
  formatCommercialGrowthPercent,
  growthFromSliderPosition,
  sliderEndpointGrowth,
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
  const displayGrowth = growthFromSliderPosition(position, range)
  const tickMin = sliderEndpointGrowth(range, 'min')
  const tickCenter = sliderEndpointGrowth(range, 'center')
  const tickMax = sliderEndpointGrowth(range, 'max')
  const parcelPct =
    range.parcelResidential != null ? range.parcelResidential * 100 : null

  return (
    <div className="commercial-growth-control">
      <div className="commercial-growth-header">
        <label htmlFor="commercial-growth-slider">
          <strong>Commercial assessment growth</strong>
        </label>
        <span className="commercial-growth-value" aria-live="polite">
          {formatCommercialGrowthPercent(displayGrowth)} commercial
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
        aria-valuetext={`${formatCommercialGrowthPercent(displayGrowth)} commercial growth`}
      />
      <div className="commercial-growth-ticks" aria-hidden="true">
        <span>Slower ({formatCommercialGrowthPercent(tickMin)})</span>
        <span>County base ({formatCommercialGrowthPercent(tickCenter)})</span>
        <span>Faster ({formatCommercialGrowthPercent(tickMax)})</span>
      </div>
      <p className="tax-option-help">
        We do not model commercial reassessment parcel-by-parcel. Drag the slider to set how much
        existing commercial assessed value grows when calculating revenue-neutral millage. The
        center is <strong>countywide residential base growth</strong> in this dataset (
        {formatCommercialGrowthPercent(tickCenter)} — total modeled future value ÷ total current
        value) — the same starting point for every address.
        {parcelPct != null && (
          <>
            {' '}
            This home&apos;s modeled residential growth is {formatPct(parcelPct)}.
          </>
        )}
      </p>
    </div>
  )
}
