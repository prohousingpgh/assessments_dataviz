import { useEffect, useMemo, useRef } from 'react'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { valueChangeColorExpression } from './colors'
import type { MapBounds, MapColorStop, MapHexbinCollection } from './types'

type HexSurfaceMapProps = {
  data: MapHexbinCollection
  bounds: MapBounds
  center: [number, number]
  stops: MapColorStop[]
  countyAveragePct: number
}

export function HexSurfaceMap({
  data,
  bounds,
  center,
  stops,
  countyAveragePct,
}: HexSurfaceMapProps) {
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
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
          hexbins: {
            type: 'geojson',
            data,
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
          {
            id: 'hex-fill',
            type: 'fill-extrusion',
            source: 'hexbins',
            paint: {
              'fill-extrusion-color': valueChangeColorExpression(
                'rel_change_pp',
                stops,
                0
              ) as maplibregl.DataDrivenPropertyValueSpecification<string>,
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
      const rel = Number(props.rel_change_pp ?? 0)
      const count = Number(props.count ?? 0)
      popup
        .setLngLat(event.lngLat)
        .setHTML(
          `Hex sample: ${count.toLocaleString()} parcels<br/>` +
            `Relative change: ${rel > 0 ? '+' : ''}${rel.toFixed(1)} pp vs county avg<br/>` +
            `County avg change: ${countyAveragePct.toFixed(1)}%`
        )
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
  }, [bounds, center, countyAveragePct, data, heightScale, stops])

  return <div className="parcel-map hex-surface-map" ref={containerRef} aria-label="3D hex surface map" />
}

