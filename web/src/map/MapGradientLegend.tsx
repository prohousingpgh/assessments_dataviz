type MapGradientLegendProps = {
  gradientCss: string
  /** Accessible description of what the gradient represents. */
  ariaLabel: string
  lowLabel: string
  highLabel: string
  centerLabel: string
  minTick: string
  maxTick: string
  /** Horizontal position of center mark, 0–100. Omit to hide the mark. */
  centerPositionPct?: number
}

export function MapGradientLegend({
  gradientCss,
  ariaLabel,
  lowLabel,
  highLabel,
  centerLabel,
  minTick,
  maxTick,
  centerPositionPct,
}: MapGradientLegendProps) {
  const showCenterMark = centerPositionPct != null

  return (
    <div className="map-gradient-legend">
      <div className="map-gradient-legend-endpoints">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
      <div className="map-gradient-legend-track">
        <div
          className="map-gradient-legend-bar"
          style={{ background: gradientCss }}
          role="img"
          aria-label={ariaLabel}
        />
        {showCenterMark && (
          <span
            className="map-gradient-legend-center-mark"
            style={{ left: `${centerPositionPct}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="map-gradient-legend-ticks">
        <span>{minTick}</span>
        <span className="map-gradient-legend-tick-center">{centerLabel}</span>
        <span>{maxTick}</span>
      </div>
    </div>
  )
}
