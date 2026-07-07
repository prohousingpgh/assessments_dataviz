import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, {
  type DataDrivenPropertyValueSpecification,
  type MapLayerMouseEvent,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getMapParcels, getMapTaxParcels, getMapValuationParcels } from '../api'
import { BASEMAP_STYLE_SOURCES, basemapRasterLayer } from './basemap'
import {
  formatTaxDelta,
  formatValuationRatio,
  parseMapNumericProp,
  taxDeltaColorExpression,
  valuationRatioColorExpression,
  valueChangeColorExpression,
} from './colors'
import type {
  MapColorStop,
  MapConfig,
  MapDisplayMode,
  TaxMapConfig,
  ValuationMapConfig,
} from './types'
import { MapRenderingUnavailableNotice } from './MapRenderingUnavailableNotice'
import { MAP_RENDERING_UNAVAILABLE_MESSAGE, isMapRenderingSupported } from './renderingSupport'

export type FocusedParcel = {
  parcelId: string
  addressDisplay?: string
  municipality?: string
  valueChangePct?: number | null
  valuationRatio?: number | null
}

type ParcelMapProps = {
  config: MapConfig | ValuationMapConfig | TaxMapConfig
  displayMode?: MapDisplayMode
  highlightParcelId?: string
  onParcelFocus?: (parcel: FocusedParcel) => void
  onDataError?: (message: string | null) => void
  initialCenter?: [number, number]
  initialZoom?: number
  maxBoundsOverride?: [[number, number], [number, number]]
  ariaLabel?: string
}

let pmtilesProtocolRegistered = false

/** Stable reference so valuation map effect does not remount on every parent render. */
const VALUATION_MAP_STOPS: MapColorStop[] = []

/** Use API random sampling below this zoom. PMTiles only at very close zoom (tiles are still thinned). */
const PMTILES_DETAIL_MIN_ZOOM = 17

function sampleLimitForZoom(zoom: number): number {
  if (zoom >= 15) return 25_000
  if (zoom >= 14) return 20_000
  if (zoom >= 13) return 16_000
  if (zoom >= 12) return 12_000
  return 10_000
}

function registerPmtilesProtocol() {
  if (pmtilesProtocolRegistered) return
  const protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)
  pmtilesProtocolRegistered = true
}

function resolveDisplayMode(
  config: MapConfig | ValuationMapConfig | TaxMapConfig,
  displayMode?: MapDisplayMode
): MapDisplayMode {
  if (displayMode) return displayMode
  if ('tax_change_color_stops' in config) return 'tax_change'
  if ('valuation_ratio_bins' in config) return 'valuation_ratio'
  return 'value_change'
}

function colorStopsForMode(
  config: MapConfig | ValuationMapConfig | TaxMapConfig,
  mode: MapDisplayMode
): MapColorStop[] {
  if (mode === 'tax_change') return (config as TaxMapConfig).tax_change_color_stops
  if (mode === 'valuation_ratio') return VALUATION_MAP_STOPS
  return (config as MapConfig).value_change_color_stops
}

function colorCenterForMode(
  config: MapConfig | ValuationMapConfig | TaxMapConfig,
  mode: MapDisplayMode
): number {
  if (mode === 'tax_change') return 0
  if (mode === 'valuation_ratio') return 1
  return (config as MapConfig).county_avg_value_change_pct
}

type PmtilesMapConfig = (MapConfig | ValuationMapConfig | TaxMapConfig) & {
  mode: 'pmtiles'
  pmtiles_url: string
  source_layer: string
}

function isPmtilesConfig(
  config: MapConfig | ValuationMapConfig | TaxMapConfig
): config is PmtilesMapConfig {
  return config.mode === 'pmtiles' && Boolean(config.pmtiles_url)
}

function circlePaint(mode: MapDisplayMode, stops: MapColorStop[], center: number) {
  const colorExpr =
    mode === 'tax_change'
      ? taxDeltaColorExpression('tax_delta_dollars', stops)
      : mode === 'valuation_ratio'
        ? valuationRatioColorExpression('valuation_ratio')
        : valueChangeColorExpression('value_change_pct', stops, center)
  return {
    'circle-color': colorExpr as DataDrivenPropertyValueSpecification<string>,
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['zoom'],
      9,
      2,
      12,
      4,
      14,
      6,
      16,
      8,
    ],
    'circle-opacity': 0.88,
    'circle-stroke-width': 0.5,
    'circle-stroke-color': '#ffffff',
  }
}

type ParcelLayerOptions = {
  fillLayerId: string
  highlightLayerId: string
  sourceId: string
  sourceLayer?: string
  minzoom?: number
  maxzoom?: number
}

function addParcelLayers(
  map: MapLibreMap,
  mode: MapDisplayMode,
  stops: MapColorStop[],
  center: number,
  options: ParcelLayerOptions
) {
  const { fillLayerId, highlightLayerId, sourceId, sourceLayer, minzoom, maxzoom } = options
  const layer: maplibregl.CircleLayerSpecification = {
    id: fillLayerId,
    type: 'circle',
    source: sourceId,
    paint: circlePaint(mode, stops, center) as maplibregl.CircleLayerSpecification['paint'],
  }
  if (sourceLayer) {
    layer['source-layer'] = sourceLayer
  }
  if (minzoom != null) {
    layer.minzoom = minzoom
  }
  if (maxzoom != null) {
    layer.maxzoom = maxzoom
  }
  if (mode === 'valuation_ratio') {
    layer.filter = [
      'case',
      ['has', 'valuation_ratio'],
      ['>', ['to-number', ['get', 'valuation_ratio']], -9998],
      true,
    ]
  } else if (mode === 'tax_change') {
    layer.filter = [
      'case',
      ['has', 'tax_delta_dollars'],
      ['>', ['to-number', ['get', 'tax_delta_dollars']], -9998],
      true,
    ]
  }
  map.addLayer(layer)

  map.addLayer({
    id: highlightLayerId,
    type: 'circle',
    source: sourceId,
    ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
    ...(minzoom != null ? { minzoom } : {}),
    ...(maxzoom != null ? { maxzoom } : {}),
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        9,
        3,
        14,
        8,
        16,
        12,
      ],
      'circle-color': '#ffffff',
      'circle-opacity': 0,
      'circle-stroke-color': '#1a1f26',
      'circle-stroke-width': 3,
    },
    filter: ['==', ['get', 'parcel_id'], ''],
  })
}

function setupLowZoomParcelSampling(
  map: MapLibreMap,
  mode: MapDisplayMode,
  onDataError: ((message: string | null) => void) | undefined,
  loadGenerationRef: { current: number },
  loadTimerRef: { current: number | null },
  abortRef: { current: AbortController | null },
  onlyBelowDetailZoom: boolean
) {
  const loadViewport = () => {
    if (onlyBelowDetailZoom && map.getZoom() >= PMTILES_DETAIL_MIN_ZOOM) return

    const generation = ++loadGenerationRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const bounds = padBounds(map.getBounds(), 0.15)
    const zoom = map.getZoom()
    const fetchParcels =
      mode === 'tax_change'
        ? getMapTaxParcels
        : mode === 'valuation_ratio'
          ? getMapValuationParcels
          : getMapParcels
    const params: Parameters<typeof getMapParcels>[0] = {
      west: bounds.west,
      south: bounds.south,
      east: bounds.east,
      north: bounds.north,
      zoom,
    }
    params.limit = sampleLimitForZoom(zoom)

    fetchParcels(
      params,
      controller.signal
    )
      .then((collection) => {
        if (generation !== loadGenerationRef.current) return
        const sourceId = onlyBelowDetailZoom ? 'parcels-sample' : 'parcels'
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
        source?.setData(collection)
        onDataError?.(null)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (generation !== loadGenerationRef.current) return
        console.error('Failed to load parcel points for map viewport', err)
        onDataError?.('Could not load parcel dots. Try refreshing or zooming in.')
      })
  }

  const scheduleLoad = () => {
    if (loadTimerRef.current != null) {
      window.clearTimeout(loadTimerRef.current)
    }
    loadTimerRef.current = window.setTimeout(loadViewport, 120)
  }

  loadViewport()
  map.on('moveend', scheduleLoad)
  map.on('zoomend', scheduleLoad)
}

function bindParcelInteractions(
  map: MapLibreMap,
  mode: MapDisplayMode,
  colorCenter: number,
  onParcelFocus?: (parcel: FocusedParcel) => void
) {
  const hoverPopup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
    className: 'map-popup',
  })
  const focusPopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    offset: 12,
    className: 'map-popup',
  })

  const onMouseMove = (event: MapLayerMouseEvent) => {
    map.getCanvas().style.cursor = 'pointer'
    const feature = event.features?.[0]
    if (!feature) return
    const props = feature.properties as Record<string, string | number | null>
    let detailHtml: string
    if (mode === 'valuation_ratio') {
      const vr = parseMapNumericProp(props.valuation_ratio)
      detailHtml = `Valuation ratio: ${formatValuationRatio(vr)} (1.0 = county median)`
    } else if (mode === 'tax_change') {
      const delta = parseMapNumericProp(props.tax_delta_dollars)
      detailHtml = `Estimated tax change: ${formatTaxDelta(delta)}`
    } else {
      const pct = parseMapNumericProp(props.value_change_pct)
      const relPct = pct == null ? null : pct - colorCenter
      const pctText =
        pct == null ? 'n/a' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
      const relText =
        relPct == null ? 'n/a' : `${relPct > 0 ? '+' : ''}${relPct.toFixed(1)} pp vs county avg`
      detailHtml = `Assessment change: ${pctText}<br/>Relative to county: ${relText}`
    }
    hoverPopup
      .setLngLat(event.lngLat)
      .setHTML(
        `<strong>${props.address_display ?? props.municipality ?? 'Home'}</strong><br/>` +
          detailHtml
      )
      .addTo(map)
  }

  const onMouseLeave = () => {
    map.getCanvas().style.cursor = ''
    hoverPopup.remove()
  }

  const onClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    const props = (feature?.properties ?? {}) as Record<string, string | number | null>
    const parcelId = props.parcel_id
    if (parcelId == null || parcelId === '') return
    const parcelIdStr = String(parcelId)

    hoverPopup.remove()

    let detailHtml: string
    let valueChangePct: number | null = null
    let valuationRatio: number | null = null

    if (mode === 'valuation_ratio') {
      valuationRatio = parseMapNumericProp(props.valuation_ratio)
      detailHtml = `Valuation ratio: ${formatValuationRatio(valuationRatio)} (1.0 = county median)<br/>`
    } else if (mode === 'tax_change') {
      const delta = parseMapNumericProp(props.tax_delta_dollars)
      detailHtml = `Estimated tax change: ${formatTaxDelta(delta)}<br/>`
    } else {
      const pct = parseMapNumericProp(props.value_change_pct)
      valueChangePct = pct
      const relPct = pct == null ? null : pct - colorCenter
      const pctText = pct == null ? 'n/a' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
      const relText =
        relPct == null ? 'n/a' : `${relPct > 0 ? '+' : ''}${relPct.toFixed(1)} pp vs county avg`
      detailHtml = `Assessment change: ${pctText}<br/>Relative to county: ${relText}<br/>`
    }

    setParcelHighlightFilter(map, parcelIdStr)

    focusPopup
      .setLngLat(event.lngLat)
      .setHTML(
        `<strong>${props.address_display ?? props.municipality ?? 'Home'}</strong><br/>` +
          detailHtml +
          `<a href="/home/${encodeURIComponent(parcelIdStr)}">Expand full property details</a>`
      )
      .addTo(map)

    map.easeTo({
      center: event.lngLat,
      zoom: Math.max(map.getZoom(), 14),
      duration: 700,
    })

    onParcelFocus?.({
      parcelId: parcelIdStr,
      addressDisplay: typeof props.address_display === 'string' ? props.address_display : undefined,
      municipality: typeof props.municipality === 'string' ? props.municipality : undefined,
      valueChangePct,
      valuationRatio,
    })
  }

  for (const layerId of ['parcels-fill', 'parcels-fill-tiles', 'parcels-fill-sample']) {
    map.on('mousemove', layerId, onMouseMove)
    map.on('mouseleave', layerId, onMouseLeave)
    map.on('click', layerId, onClick)
  }
}

function padBounds(bounds: maplibregl.LngLatBounds, fraction: number) {
  const west = bounds.getWest()
  const east = bounds.getEast()
  const south = bounds.getSouth()
  const north = bounds.getNorth()
  const padLon = (east - west) * fraction
  const padLat = (north - south) * fraction
  return {
    west: west - padLon,
    east: east + padLon,
    south: south - padLat,
    north: north + padLat,
  }
}

function setParcelHighlightFilter(map: MapLibreMap, parcelId: string | undefined) {
  const filter: maplibregl.FilterSpecification = ['==', ['get', 'parcel_id'], parcelId ?? '']
  for (const layerId of ['parcels-highlight', 'parcels-highlight-tiles', 'parcels-highlight-sample']) {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, filter)
    }
  }
}

function easeToParcelById(map: MapLibreMap, parcelId: string, mode: MapDisplayMode) {
  const base =
    mode === 'tax_change'
      ? '/api/map/tax/parcels'
      : mode === 'valuation_ratio'
        ? '/api/map/valuation/parcels'
        : '/api/map/parcels'
  const featureUrl = `${base}/${encodeURIComponent(parcelId)}`
  return fetch(featureUrl)
    .then((res) => (res.ok ? res.json() : null))
    .then((feature) => {
      if (!feature?.geometry?.coordinates) return
      const center = feature.geometry.coordinates as [number, number]
      map.easeTo({
        center,
        zoom: Math.max(map.getZoom(), 14),
        duration: 700,
      })
      return center
    })
    .catch(() => undefined)
}

export function ParcelMap({
  config,
  displayMode,
  highlightParcelId,
  onParcelFocus,
  onDataError,
  initialCenter,
  initialZoom,
  maxBoundsOverride,
  ariaLabel = 'Neighborhood map',
}: ParcelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const loadTimerRef = useRef<number | null>(null)
  const loadGenerationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const [renderingError, setRenderingError] = useState<string | null>(() =>
    isMapRenderingSupported() ? null : MAP_RENDERING_UNAVAILABLE_MESSAGE
  )

  const mode = resolveDisplayMode(config, displayMode)
  const stops = useMemo(() => colorStopsForMode(config, mode), [config, mode])
  const colorCenter = colorCenterForMode(config, mode)
  const usePmtiles = isPmtilesConfig(config)

  useEffect(() => {
    if (renderingError || !containerRef.current || config.mode === 'unavailable') return

    let map: MapLibreMap

    try {
      registerPmtilesProtocol()

      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: BASEMAP_STYLE_SOURCES,
          layers: [basemapRasterLayer()],
        },
        center: initialCenter ?? config.center,
        zoom: initialZoom ?? 10,
        maxBounds:
          maxBoundsOverride ??
          [
            [config.bounds.west - 0.05, config.bounds.south - 0.05],
            [config.bounds.east + 0.05, config.bounds.north + 0.05],
          ],
      })
    } catch (err) {
      console.error('Failed to initialize parcel map', err)
      window.setTimeout(() => setRenderingError(MAP_RENDERING_UNAVAILABLE_MESSAGE), 0)
      return
    }

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      if (usePmtiles) {
        map.addSource('parcels-tiles', {
          type: 'vector',
          url: `pmtiles://${window.location.origin}${config.pmtiles_url}`,
        })
        map.addSource('parcels-sample', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        addParcelLayers(map, mode, stops, colorCenter, {
          fillLayerId: 'parcels-fill-tiles',
          highlightLayerId: 'parcels-highlight-tiles',
          sourceId: 'parcels-tiles',
          sourceLayer: config.source_layer,
          minzoom: PMTILES_DETAIL_MIN_ZOOM,
        })
        addParcelLayers(map, mode, stops, colorCenter, {
          fillLayerId: 'parcels-fill-sample',
          highlightLayerId: 'parcels-highlight-sample',
          sourceId: 'parcels-sample',
          maxzoom: PMTILES_DETAIL_MIN_ZOOM,
        })
        setupLowZoomParcelSampling(
          map,
          mode,
          onDataError,
          loadGenerationRef,
          loadTimerRef,
          abortRef,
          true
        )
      } else if (config.mode === 'points') {
        map.addSource('parcels', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        addParcelLayers(map, mode, stops, colorCenter, {
          fillLayerId: 'parcels-fill',
          highlightLayerId: 'parcels-highlight',
          sourceId: 'parcels',
        })
        setupLowZoomParcelSampling(
          map,
          mode,
          onDataError,
          loadGenerationRef,
          loadTimerRef,
          abortRef,
          false
        )
      }

      bindParcelInteractions(map, mode, colorCenter, onParcelFocus)
      setParcelHighlightFilter(map, highlightParcelId)
      if (highlightParcelId) {
        void easeToParcelById(map, highlightParcelId, mode)
      }
    })

    return () => {
      if (loadTimerRef.current != null) {
        window.clearTimeout(loadTimerRef.current)
      }
      abortRef.current?.abort()
      loadGenerationRef.current += 1
      map.remove()
      mapRef.current = null
    }
  }, [
    config,
    mode,
    stops,
    colorCenter,
    usePmtiles,
    initialCenter,
    initialZoom,
    maxBoundsOverride,
    onDataError,
    onParcelFocus,
    renderingError,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => setParcelHighlightFilter(map, highlightParcelId)
    if (map.isStyleLoaded()) {
      apply()
    } else {
      map.once('load', apply)
    }
  }, [highlightParcelId, mode])

  if (renderingError) {
    return <MapRenderingUnavailableNotice compact title={ariaLabel} message={renderingError} />
  }

  return <div className="parcel-map" ref={containerRef} aria-label={ariaLabel} />
}
