import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getMapConfig,
  getMapHexbins,
  getValuationMapConfig,
  getValuationMapHexbins,
} from '../api'
import { PageHeader } from '../components/PageHeader'
import { usePageTitle } from '../hooks/usePageTitle'
import { formatLegendLabel, MAP_COLOR_STOPS, VALUATION_RATIO_BINS } from '../map/colors'
import { HexSurfaceMap } from '../map/HexSurfaceMap'
import { ParcelMap, type FocusedParcel } from '../map/ParcelMap'
import type {
  MapConfig,
  MapHexbinCollection,
  ValuationMapConfig,
  ValuationMapHexbinCollection,
} from '../map/types'

export function MapPage() {
  usePageTitle('Maps')
  const [searchParams] = useSearchParams()
  const queryParcelId = searchParams.get('parcel') ?? undefined

  const [config, setConfig] = useState<MapConfig | null>(null)
  const [hexbins, setHexbins] = useState<MapHexbinCollection | null>(null)
  const [valuationConfig, setValuationConfig] = useState<ValuationMapConfig | null>(null)
  const [valuationHexbins, setValuationHexbins] = useState<ValuationMapHexbinCollection | null>(
    null
  )
  const [selectedParcelId, setSelectedParcelId] = useState<string | undefined>(queryParcelId)
  const [error, setError] = useState<string | null>(null)
  const [mapDataError, setMapDataError] = useState<string | null>(null)
  const [valuationMapDataError, setValuationMapDataError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setSelectedParcelId(queryParcelId)
  }, [queryParcelId])

  useEffect(() => {
    Promise.all([
      getMapConfig(),
      getMapHexbins({ hex_size_deg: 0.006, min_count: 8 }),
      getValuationMapConfig(),
      getValuationMapHexbins({ hex_size_deg: 0.006, min_count: 8 }),
    ])
      .then(([cfg, hex, vCfg, vHex]) => {
        setConfig(cfg)
        setHexbins(hex)
        setValuationConfig(vCfg)
        setValuationHexbins(vHex)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load maps'))
      .finally(() => setLoading(false))
  }, [])

  const onParcelFocus = useCallback((parcel: FocusedParcel) => {
    setSelectedParcelId(parcel.parcelId)
  }, [])

  const medianRatio = valuationConfig?.county_median_assessment_ratio
  const mapsUnavailable =
    !loading && config?.mode === 'unavailable' && valuationConfig?.mode === 'unavailable'

  return (
    <div className="page page--map">
      <PageHeader title="Maps">
        <p className="lead">
          Explore modeled reassessment patterns countywide. The first map shows change relative to
          the county average; the second shows each home&apos;s valuation ratio versus the county
          median (<strong>1.0</strong> = typical).
        </p>
      </PageHeader>

      {loading && <p className="page-meta">Loading maps…</p>}
      {error && <p className="search-error">{error}</p>}
      {mapDataError && <p className="search-error">{mapDataError}</p>}
      {valuationMapDataError && <p className="search-error">{valuationMapDataError}</p>}

      {mapsUnavailable && (
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
        <section className="map-section">
          <h2>Assessment change</h2>
          <p className="detail-foot">
            Residential homes only. Color shows estimated change in assessed value if the county
            reassesses properties.
          </p>

          <div className="map-shell">
            <ParcelMap
              config={config}
              highlightParcelId={selectedParcelId}
              onParcelFocus={onParcelFocus}
              onDataError={setMapDataError}
              ariaLabel="Assessment change map"
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
            Color shows how much a parcel changed relative to the county average growth rate.{' '}
            <strong>pp</strong> means percentage points versus county average. Click a home to
            focus it and use the popup link to open full details.
          </p>

          {hexbins && hexbins.features.length > 0 && (
            <section className="card panel hex-surface-panel">
              <h3>Countywide relative-change visualization</h3>
              <p className="detail-foot">
                3D countywide view of where assessment changes are faster or slower than the county
                average. Height indicates how many homes are in each area; color indicates direction.
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
                Hover an area to see sample size and relative change. Areas shown:{' '}
                {hexbins.meta?.returned ?? hexbins.features.length}.
              </p>
            </section>
          )}
        </section>
      )}

      {!loading && valuationConfig && valuationConfig.mode !== 'unavailable' && (
        <section className="map-section map-section--valuation">
          <h2>Valuation ratio</h2>
          <p className="detail-foot">
            How each home&apos;s modeled reassessment compares to the county median. Valuation
            ratio is (new assessed value ÷ old assessed value), divided by the county median of
            that ratio.
          </p>

          {medianRatio != null && (
            <p className="page-meta">
              County median new÷old assessment ratio: <strong>{medianRatio.toFixed(3)}×</strong>
            </p>
          )}

          {valuationConfig.mode === 'points' && (
            <p className="page-meta">
              Showing a random sample of up to 10,000 homes per view when zoomed out. Zoom in for
              more detail.
            </p>
          )}

          <div className="map-shell">
            <ParcelMap
              config={valuationConfig}
              displayMode="valuation_ratio"
              highlightParcelId={selectedParcelId}
              onParcelFocus={onParcelFocus}
              onDataError={setValuationMapDataError}
              ariaLabel="Valuation ratio map"
            />
          </div>

          <div className="map-legend" aria-label="Valuation ratio legend">
            {(valuationConfig.valuation_ratio_bins ?? VALUATION_RATIO_BINS).map((bin) => (
              <div key={bin.label} className="map-legend-item">
                <span
                  className="map-legend-swatch"
                  style={{ background: bin.color }}
                  aria-hidden="true"
                />
                <span>{bin.label}</span>
              </div>
            ))}
          </div>

          <p className="page-meta map-help">
            Values below <strong>1.0</strong> reassess lower than the median parcel (their share of
            the tax base tends to fall). Values above <strong>1.0</strong> reassess higher than the
            median (their share tends to rise). This is an assessment shift metric, not a tax bill.
          </p>

          {valuationHexbins && valuationHexbins.features.length > 0 && (
            <section className="card panel hex-surface-panel">
              <h3>Countywide valuation-ratio visualization</h3>
              <p className="detail-foot">
                3D countywide view of average valuation ratio by area. Height shows how many homes
                are in each area; color shows whether the area is above or below the county median.
              </p>
              <div className="map-shell hex-surface-shell">
                <HexSurfaceMap
                  data={valuationHexbins}
                  bounds={valuationConfig.bounds}
                  center={valuationConfig.center}
                  stops={MAP_COLOR_STOPS}
                  displayMode="valuation_ratio"
                />
              </div>
              <p className="page-meta map-help">
                Hover an area to see sample size and average ratio. Areas shown:{' '}
                {valuationHexbins.meta?.returned ?? valuationHexbins.features.length}.
              </p>
            </section>
          )}
        </section>
      )}
    </div>
  )
}
