import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getMapConfig } from '../api'
import { PageHeader } from '../components/PageHeader'
import { usePageTitle } from '../hooks/usePageTitle'
import { MAP_COLOR_STOPS, formatLegendLabel } from '../map/colors'
import { ParcelMap } from '../map/ParcelMap'
import type { MapConfig } from '../map/types'

export function MapPage() {
  usePageTitle('Neighborhood map')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const highlightParcelId = searchParams.get('parcel') ?? undefined

  const [config, setConfig] = useState<MapConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMapConfig()
      .then(setConfig)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load map'))
      .finally(() => setLoading(false))
  }, [])

  const onParcelSelect = useCallback(
    (parcelId: string) => {
      navigate(`/home/${encodeURIComponent(parcelId)}`)
    },
    [navigate]
  )

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
              highlightParcelId={highlightParcelId}
              onParcelSelect={onParcelSelect}
            />
          </div>
          <div className="map-legend" aria-label="Assessment change legend">
            {MAP_COLOR_STOPS.map((stop, index) => {
              const next = MAP_COLOR_STOPS[index + 1]
              const label = next
                ? `${formatLegendLabel(stop.pct)} (${stop.pct}% to ${next.pct}%)`
                : `${formatLegendLabel(stop.pct)} (${stop.pct}%+)`
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
            Click a home to open its detail page.
            {highlightParcelId && (
              <>
                {' '}
                Highlighting parcel{' '}
                <Link to={`/home/${encodeURIComponent(highlightParcelId)}`}>
                  {highlightParcelId}
                </Link>
                .
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}
