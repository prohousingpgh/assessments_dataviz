import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getMapConfig, getMapHexbins } from '../api'
import { PageHeader } from '../components/PageHeader'
import { usePageTitle } from '../hooks/usePageTitle'
import { formatLegendLabel } from '../map/colors'
import { HexSurfaceMap } from '../map/HexSurfaceMap'
import { ParcelMap, type FocusedParcel } from '../map/ParcelMap'
import type { MapConfig, MapHexbinCollection } from '../map/types'

export function MapPage() {
  usePageTitle('Neighborhood map')
  const [searchParams] = useSearchParams()
  const queryParcelId = searchParams.get('parcel') ?? undefined

  const [config, setConfig] = useState<MapConfig | null>(null)
  const [hexbins, setHexbins] = useState<MapHexbinCollection | null>(null)
  const [selectedParcelId, setSelectedParcelId] = useState<string | undefined>(queryParcelId)
  const [error, setError] = useState<string | null>(null)
  const [mapDataError, setMapDataError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setSelectedParcelId(queryParcelId)
  }, [queryParcelId])

  useEffect(() => {
    Promise.all([getMapConfig(), getMapHexbins({ hex_size_deg: 0.006, min_count: 8 })])
      .then(([cfg, hex]) => {
        setConfig(cfg)
        setHexbins(hex)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load map'))
      .finally(() => setLoading(false))
  }, [])

  const onParcelFocus = useCallback((parcel: FocusedParcel) => {
    setSelectedParcelId(parcel.parcelId)
  }, [])

  return (
    <div className="page page--map">
      <PageHeader title="Neighborhood map">
        <p className="lead">
          Residential homes only. Color shows estimated change in assessed value if the county
          reassesses properties.
        </p>
      </PageHeader>

      {loading && <p className="page-meta">Loading map…</p>}
      {error && <p className="search-error">{error}</p>}
      {mapDataError && <p className="search-error">{mapDataError}</p>}

      {!loading && config?.mode === 'unavailable' && (
        <section className="card panel map-unavailable">
          <p>
            Map locations are not in the current data bundle yet. Rebuild the database with WPRDC
            parcel centroids, then optionally build vector tiles:
          </p>
          <pre className="code-block">
            {`python scripts/build_db.py \\
  --predictions residential_predictions.csv \\
  --assessments wprdc_property_assessments.csv \\
  --centroids parcel_centroids.csv

python scripts/build_map_tiles.py --db data/parcels.db`}
          </pre>
          <p className="page-meta">
            See{' '}
            <a
              href="https://data.wprdc.org/dataset/parcel-centroids-in-allegheny-county-with-geographic-identifiers"
              target="_blank"
              rel="noreferrer"
            >
              WPRDC parcel centroids
            </a>{' '}
            for centroid coordinates.
          </p>
        </section>
      )}

      {!loading && config && config.mode !== 'unavailable' && (
        <>
          <div className="map-shell">
            <ParcelMap
              config={config}
              highlightParcelId={selectedParcelId}
              onParcelFocus={onParcelFocus}
              onDataError={setMapDataError}
            />
          </div>
          <div className="map-legend" aria-label="Assessment change legend">
            {config.value_change_color_stops.map((stop, index) => {
              const next = config.value_change_color_stops[index + 1]
              const label = next
                ? `${formatLegendLabel(stop.pct)} (${stop.pct} to ${next.pct} pp)`
                : `${formatLegendLabel(stop.pct)} (${stop.pct}+ pp)`
              return (
                <div key={stop.pct} className="map-legend-item">
                  <span
                    className="map-legend-swatch"
                    style={{ background: stop.color }}
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                </div>
              )
            })}
          </div>
          <p className="page-meta map-help">
            Color shows how much a parcel changed relative to the county average growth rate.
            {' '}
            <strong>pp</strong> means percentage points versus county average.
            Click a home to focus it and use the popup link to open full details.
          </p>

          {hexbins && hexbins.features.length > 0 && (
            <section className="card panel hex-surface-panel">
              <h2>Countywide relative-change surface (hex bins)</h2>
              <p className="detail-foot">
                3D hex bins show where assessment changes are faster or slower than the county
                average. Height indicates parcel concentration in each hex, and
                color indicates direction.
              </p>
              <div className="map-shell hex-surface-shell">
                <HexSurfaceMap
                  data={hexbins}
                  bounds={config.bounds}
                  center={config.center}
                  stops={config.value_change_color_stops}
                  countyAveragePct={config.county_avg_value_change_pct}
                />
              </div>
              <p className="page-meta map-help">
                Hover a hex to see sample size and relative change. Hex bins shown: {hexbins.meta?.returned ?? hexbins.features.length}.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  )
}

