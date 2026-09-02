import { useState } from 'react'
import {
  legendGradientCss,
  MAP_COLOR_STOPS,
  relativeChangeCenterPosition,
  TAX_DELTA_COLOR_STOPS,
  taxDeltaCenterPosition,
  VALUATION_RATIO_BINS,
  valuationRatioCenterPosition,
  valuationRatioGradientCss,
  type ValuationRatioBin,
} from './colors'
import { MapGradientLegend } from './MapGradientLegend'
import { HexSurfaceMap } from './HexSurfaceMap'
import { ParcelMap, type FocusedParcel } from './ParcelMap'
import type {
  MapConfig,
  MapHexbinCollection,
  TaxMapConfig,
  TaxMapHexbinCollection,
  ValuationMapConfig,
  ValuationMapHexbinCollection,
} from './types'

export type MapViewId = 'assessment' | 'valuation' | 'tax'

type SurfaceMode = 'parcels' | 'hex'

type MapViewSectionProps = {
  viewId: MapViewId
  title: string
  description: string
  config: MapConfig | ValuationMapConfig | TaxMapConfig
  hexbins: MapHexbinCollection | ValuationMapHexbinCollection | TaxMapHexbinCollection | null
  highlightParcelId?: string
  onParcelFocus: (parcel: FocusedParcel) => void
  onDataError: (message: string | null) => void
  caption: string
}

function displayModeForView(viewId: MapViewId) {
  if (viewId === 'valuation') return 'valuation_ratio' as const
  if (viewId === 'tax') return 'tax_change' as const
  return undefined
}

function legendForView(
  viewId: MapViewId,
  config: MapConfig | ValuationMapConfig | TaxMapConfig
) {
  if (viewId === 'assessment' && 'value_change_color_stops' in config) {
    const stops = config.value_change_color_stops
    return {
      gradientCss: legendGradientCss(stops),
      ariaLabel:
        'Assessment change relative to county base growth, from much slower to much faster',
      lowLabel: 'Slower than county base',
      highLabel: 'Faster than county base',
      centerLabel: 'County base growth',
      minTick: `${stops[0]?.pct ?? -80} pp`,
      maxTick: `+${stops[stops.length - 1]?.pct ?? 80} pp`,
      centerPositionPct: relativeChangeCenterPosition(stops),
    }
  }

  if (viewId === 'valuation') {
    const bins = ((config as ValuationMapConfig).valuation_ratio_bins ??
      VALUATION_RATIO_BINS) as ValuationRatioBin[]
    return {
      gradientCss: valuationRatioGradientCss(bins),
      ariaLabel: 'Valuation ratio relative to county median, from below typical to above typical',
      lowLabel: 'Below county median',
      highLabel: 'Above county median',
      centerLabel: 'County median (1.0)',
      minTick: '< 0.7',
      maxTick: '> 1.5',
      centerPositionPct: valuationRatioCenterPosition(),
    }
  }

  const taxConfig = config as TaxMapConfig
  const stops = taxConfig.tax_change_color_stops ?? TAX_DELTA_COLOR_STOPS
  return {
    gradientCss: legendGradientCss(stops),
    ariaLabel: 'Estimated annual tax change from lower to higher',
    lowLabel: 'Lower taxes',
    highLabel: 'Higher taxes',
    centerLabel: 'No change ($0)',
    minTick: '−$2,400/yr',
    maxTick: '+$2,400/yr',
    centerPositionPct: taxDeltaCenterPosition(stops),
  }
}

function hexStopsForView(
  viewId: MapViewId,
  config: MapConfig | ValuationMapConfig | TaxMapConfig
) {
  if (viewId === 'assessment' && 'value_change_color_stops' in config) {
    return config.value_change_color_stops
  }
  if (viewId === 'tax') {
    return (config as TaxMapConfig).tax_change_color_stops ?? TAX_DELTA_COLOR_STOPS
  }
  return MAP_COLOR_STOPS
}

function ariaLabelForView(viewId: MapViewId) {
  if (viewId === 'valuation') return 'Valuation ratio map'
  if (viewId === 'tax') return 'Tax change map'
  return 'Assessment change map'
}

export function MapViewSection({
  viewId,
  title,
  description,
  config,
  hexbins,
  highlightParcelId,
  onParcelFocus,
  onDataError,
  caption,
}: MapViewSectionProps) {
  const [surface, setSurface] = useState<SurfaceMode>('parcels')
  const displayMode = displayModeForView(viewId)
  const legend = legendForView(viewId, config)
  const hasHex = hexbins != null && hexbins.features.length > 0

  return (
    <section className="map-section" aria-labelledby={`map-view-${viewId}`}>
      <div className="map-view-toolbar">
        <div>
          <h2 id={`map-view-${viewId}`}>{title}</h2>
          <p className="detail-foot">{description}</p>
        </div>
        {hasHex && (
          <div className="map-surface-toggle" role="group" aria-label="Map surface">
            <button
              type="button"
              aria-pressed={surface === 'parcels'}
              onClick={() => setSurface('parcels')}
            >
              Parcels
            </button>
            <button
              type="button"
              aria-pressed={surface === 'hex'}
              onClick={() => setSurface('hex')}
            >
              Countywide 3D
            </button>
          </div>
        )}
      </div>

      {surface === 'parcels' || !hasHex ? (
        <>
          <div className="map-shell">
            <ParcelMap
              config={config}
              displayMode={displayMode}
              highlightParcelId={highlightParcelId}
              onParcelFocus={onParcelFocus}
              onDataError={onDataError}
              ariaLabel={ariaLabelForView(viewId)}
            />
          </div>
          <MapGradientLegend {...legend} />
        </>
      ) : (
        <div className="map-shell hex-surface-shell">
          <HexSurfaceMap
            data={hexbins}
            bounds={config.bounds}
            center={config.center}
            stops={hexStopsForView(viewId, config)}
            displayMode={displayMode}
            countyAveragePct={
              viewId === 'assessment' && 'county_avg_value_change_pct' in config
                ? config.county_avg_value_change_pct
                : undefined
            }
          />
        </div>
      )}

      <p className="map-caption">{caption}</p>
    </section>
  )
}
