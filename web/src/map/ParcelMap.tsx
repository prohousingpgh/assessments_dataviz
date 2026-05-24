import { useEffect, useRef } from 'react'
import maplibregl, {
  type DataDrivenPropertyValueSpecification,
  type MapLayerMouseEvent,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getMapParcels } from '../api'
import { valueChangeColorExpression } from './colors'
import type { MapConfig } from './types'

type ParcelMapProps = {
  config: MapConfig
  highlightParcelId?: string
  onParcelSelect?: (parcelId: string) => void
}

let pmtilesProtocolRegistered = false

function registerPmtilesProtocol() {
  if (pmtilesProtocolRegistered) return
  const protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)
  pmtilesProtocolRegistered = true
}

function circlePaint(stops: MapConfig['value_change_color_stops']) {
  return {
    'circle-color': valueChangeColorExpression(
      'value_change_pct',
      stops
    ) as DataDrivenPropertyValueSpecification<string>,
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['zoom'],
      9,
      1.5,
      12,
      3,
      14,
      5,
      16,
      8,
    ],
    'circle-opacity': 0.88,
    'circle-stroke-width': 0.5,
    'circle-stroke-color': '#ffffff',
  }
}

function addParcelLayers(
  map: MapLibreMap,
  config: MapConfig,
  sourceId: string,
  sourceLayer?: string
) {
  const layer: maplibregl.CircleLayerSpecification = {
    id: 'parcels-fill',
    type: 'circle',
    source: sourceId,
    paint: circlePaint(config.value_change_color_stops) as maplibregl.CircleLayerSpecification['paint'],
  }
  if (sourceLayer) {
    layer['source-layer'] = sourceLayer
  }
  map.addLayer(layer)

  map.addLayer({
    id: 'parcels-highlight',
    type: 'circle',
    source: sourceId,
    ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
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

function bindParcelInteractions(
  map: MapLibreMap,
  onParcelSelect?: (parcelId: string) => void
) {
  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
    className: 'map-popup',
  })

  map.on('mousemove', 'parcels-fill', (event: MapLayerMouseEvent) => {
    map.getCanvas().style.cursor = 'pointer'
    const feature = event.features?.[0]
    if (!feature) return
    const props = feature.properties as Record<string, string | number | null>
    const pct = props.value_change_pct
    const pctText =
      pct == null || pct === -9999
        ? 'n/a'
        : `${Number(pct) > 0 ? '+' : ''}${Number(pct).toFixed(1)}%`
    popup
      .setLngLat(event.lngLat)
      .setHTML(
        `<strong>${props.address_display ?? props.municipality ?? 'Home'}</strong><br/>` +
          `Assessment change: ${pctText}`
      )
      .addTo(map)
  })

  map.on('mouseleave', 'parcels-fill', () => {
    map.getCanvas().style.cursor = ''
    popup.remove()
  })

  map.on('click', 'parcels-fill', (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    const parcelId = feature?.properties?.parcel_id
    if (typeof parcelId === 'string' && onParcelSelect) {
      onParcelSelect(parcelId)
    }
  })
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

export function ParcelMap({
  config,
  highlightParcelId,
  onParcelSelect,
}: ParcelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const loadTimerRef = useRef<number | null>(null)
  const loadGenerationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!containerRef.current || config.mode === 'unavailable') return

    registerPmtilesProtocol()

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },
      center: config.center,
      zoom: 10,
      maxBounds: [
        [config.bounds.west - 0.05, config.bounds.south - 0.05],
        [config.bounds.east + 0.05, config.bounds.north + 0.05],
      ],
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      if (config.mode === 'pmtiles' && config.pmtiles_url) {
        map.addSource('parcels', {
          type: 'vector',
          url: `pmtiles://${window.location.origin}${config.pmtiles_url}`,
        })
        addParcelLayers(map, config, 'parcels', config.source_layer)
      } else if (config.mode === 'points') {
        map.addSource('parcels', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        addParcelLayers(map, config, 'parcels')

        const loadViewport = () => {
          const generation = ++loadGenerationRef.current
          abortRef.current?.abort()
          const controller = new AbortController()
          abortRef.current = controller

          const bounds = padBounds(map.getBounds(), 0.15)
          const zoom = map.getZoom()

          getMapParcels(
            {
              west: bounds.west,
              south: bounds.south,
              east: bounds.east,
              north: bounds.north,
              zoom,
            },
            controller.signal
          )
            .then((collection) => {
              if (generation !== loadGenerationRef.current) return
              const source = map.getSource('parcels') as maplibregl.GeoJSONSource | undefined
              source?.setData(collection)
            })
            .catch((err: unknown) => {
              if (err instanceof DOMException && err.name === 'AbortError') return
              if (generation !== loadGenerationRef.current) return
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

      bindParcelInteractions(map, onParcelSelect)
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
  }, [config, onParcelSelect])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('parcels-highlight')) return
    map.setFilter('parcels-highlight', [
      '==',
      ['get', 'parcel_id'],
      highlightParcelId ?? '',
    ])
    if (highlightParcelId) {
      const featureUrl = `/api/map/parcels/${encodeURIComponent(highlightParcelId)}`
      fetch(featureUrl)
        .then((res) => (res.ok ? res.json() : null))
        .then((feature) => {
          if (!feature?.geometry?.coordinates) return
          map.flyTo({
            center: feature.geometry.coordinates as [number, number],
            zoom: Math.max(map.getZoom(), 15),
            duration: 900,
          })
        })
        .catch(() => undefined)
    }
  }, [highlightParcelId])

  return <div className="parcel-map" ref={containerRef} aria-label="Neighborhood map" />
}
