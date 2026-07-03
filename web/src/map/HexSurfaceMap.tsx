import { useEffect, useMemo, useRef } from 'react'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { BASEMAP_STYLE_SOURCES, basemapRasterLayer } from './basemap'
import { formatTaxDelta, valuationRatioColorExpression, taxDeltaColorExpression, valueChangeColorExpression } from './colors'
import type {
  MapBounds,
  MapColorStop,
  MapDisplayMode,
  MapHexbinCollection,
  TaxMapHexbinCollection,
  ValuationMapHexbinCollection,
} from './types'

type HexSurfaceMapProps = {
  data: MapHexbinCollection | ValuationMapHexbinCollection | TaxMapHexbinCollection
  bounds: MapBounds
  center: [number, number]
  stops: MapColorStop[]
  displayMode?: MapDisplayMode
  countyAveragePct?: number
}

export function HexSurfaceMap({
  data,
  bounds,
  center,
  stops,
  displayMode = 'value_change',
  countyAveragePct = 0,
}: HexSurfaceMapProps) {
  const colorProperty =
    displayMode === 'tax_change'
      ? 'avg_tax_delta_dollars'
      : displayMode === 'valuation_ratio'
        ? 'avg_valuation_ratio'
        : 'rel_change_pp'
  const colorCenter = displayMode === 'valuation_ratio' ? 1 : 0
  const useValuationBins = displayMode === 'valuation_ratio'
  const useTaxDelta = displayMode === 'tax_change'
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)

  const heightScale = useMemo(() => {
    const maxCount = Math.max(
      1,
      ...data.features.map((f) => Number((f.properties as { count?: number }).count ?? 0))
    )
    return 5200 / maxCount
  }, [data.features])

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          ...BASEMAP_STYLE_SOURCES,
          hexbins: {
            type: 'geojson',
            data,
          },
        },
        layers: [
          basemapRasterLayer(),
          {
            id: 'hex-fill',
            type: 'fill-extrusion',
            source: 'hexbins',
            paint: {
              'fill-extrusion-color': (useValuationBins
                ? valuationRatioColorExpression(colorProperty)
                : useTaxDelta
                  ? taxDeltaColorExpression(colorProperty, stops)
                  : valueChangeColorExpression(colorProperty, stops, colorCenter)) as maplibregl.DataDrivenPropertyValueSpecification<string>,
              'fill-extrusion-height': [
                '*',
                ['coalesce', ['get', 'count'], 0],
                heightScale,
              ],
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.88,
            },
          },
        ],
      },
      center,
      zoom: 9.3,
      pitch: 58,
      bearing: 0,
      minZoom: 8,
      maxZoom: 16,
      dragPan: true,
      dragRotate: true,
      pitchWithRotate: true,
      scrollZoom: true,
      touchZoomRotate: true,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
      className: 'map-popup',
    })

    map.on('mousemove', 'hex-fill', (event) => {
      map.getCanvas().style.cursor = 'pointer'
      const feature = event.features?.[0]
      if (!feature) return
      const props = feature.properties as Record<string, string | number | null>
      const count = Number(props.count ?? 0)
      const detail =
        displayMode === 'valuation_ratio'
          ? `Avg valuation ratio: ${Number(props.avg_valuation_ratio ?? 0).toFixed(2)} (1.0 = median)`
          : displayMode === 'tax_change'
            ? `Avg tax change: ${formatTaxDelta(Number(props.avg_tax_delta_dollars ?? 0))}`
            : `Relative change: ${Number(props.rel_change_pp ?? 0) > 0 ? '+' : ''}${Number(props.rel_change_pp ?? 0).toFixed(1)} pp vs county avg<br/>` +
              `County avg change: ${countyAveragePct.toFixed(1)}%`
      popup
        .setLngLat(event.lngLat)
        .setHTML(`Area sample: ${count.toLocaleString()} parcels<br/>` + detail)
        .addTo(map)
    })

    map.on('mouseleave', 'hex-fill', () => {
      map.getCanvas().style.cursor = ''
      popup.remove()
    })

    mapRef.current = map
    return () => {
      popup.remove()
      map.remove()
      mapRef.current = null
    }
  }, [bounds, center, colorCenter, colorProperty, countyAveragePct, data, displayMode, heightScale, stops])

  return (
    <div
      className="parcel-map hex-surface-map"
      ref={containerRef}
      aria-label="Countywide 3D visualization"
    />
  )
}

