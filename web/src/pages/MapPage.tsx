import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getMapConfig,
  getMapHexbins,
  getTaxMapConfig,
  getTaxMapHexbins,
  getValuationMapConfig,
  getValuationMapHexbins,
} from '../api'
import { PageHeader } from '../components/PageHeader'
import { usePageTitle } from '../hooks/usePageTitle'
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
} from '../map/colors'
import { MapGradientLegend } from '../map/MapGradientLegend'
import { HexSurfaceMap } from '../map/HexSurfaceMap'
import { ParcelMap, type FocusedParcel } from '../map/ParcelMap'
import { MapRenderingUnavailableNotice } from '../map/MapRenderingUnavailableNotice'
import { isMapRenderingSupported } from '../map/renderingSupport'
import type {
  MapConfig,
  MapHexbinCollection,
  TaxMapConfig,
  TaxMapHexbinCollection,
  ValuationMapConfig,
  ValuationMapHexbinCollection,
} from '../map/types'
import { MapPageSkeleton } from '../components/skeletons/MapPageSkeleton'

export function MapPage() {
  usePageTitle('Maps')
  const [searchParams] = useSearchParams()
  const queryParcelId = searchParams.get('parcel') ?? undefined
  const [mapRenderingSupported] = useState(() => isMapRenderingSupported())

  const [config, setConfig] = useState<MapConfig | null>(null)
  const [hexbins, setHexbins] = useState<MapHexbinCollection | null>(null)
  const [valuationConfig, setValuationConfig] = useState<ValuationMapConfig | null>(null)
  const [valuationHexbins, setValuationHexbins] = useState<ValuationMapHexbinCollection | null>(
    null
  )
  const [taxConfig, setTaxConfig] = useState<TaxMapConfig | null>(null)
  const [taxHexbins, setTaxHexbins] = useState<TaxMapHexbinCollection | null>(null)
  const [parcelSelection, setParcelSelection] = useState(() => ({
    queryParcelId,
    selectedParcelId: queryParcelId,
  }))
  const [error, setError] = useState<string | null>(null)
  const [mapDataError, setMapDataError] = useState<string | null>(null)
  const [valuationMapDataError, setValuationMapDataError] = useState<string | null>(null)
  const [taxMapDataError, setTaxMapDataError] = useState<string | null>(null)
  const [loading, setLoading] = useState(mapRenderingSupported)

  useEffect(() => {
    if (!mapRenderingSupported) return

    Promise.all([
      getMapConfig(),
      getMapHexbins({ hex_size_deg: 0.006, min_count: 8 }),
      getValuationMapConfig(),
      getValuationMapHexbins({ hex_size_deg: 0.006, min_count: 8 }),
      getTaxMapConfig(),
      getTaxMapHexbins({ hex_size_deg: 0.006, min_count: 8 }),
    ])
      .then(([cfg, hex, vCfg, vHex, tCfg, tHex]) => {
        setConfig(cfg)
        setHexbins(hex)
        setValuationConfig(vCfg)
        setValuationHexbins(vHex)
        setTaxConfig(tCfg)
        setTaxHexbins(tHex)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load maps'))
      .finally(() => setLoading(false))
  }, [mapRenderingSupported])

  const selectedParcelId =
    parcelSelection.queryParcelId === queryParcelId
      ? parcelSelection.selectedParcelId
      : queryParcelId

  const onParcelFocus = useCallback(
    (parcel: FocusedParcel) => {
      setParcelSelection({ queryParcelId, selectedParcelId: parcel.parcelId })
    },
    [queryParcelId]
  )

  const medianRatio = valuationConfig?.county_median_assessment_ratio
  const mapsUnavailable =
    config?.mode === 'unavailable' &&
    valuationConfig?.mode === 'unavailable' &&
    taxConfig?.mode === 'unavailable'

  if (!mapRenderingSupported) {
    return (
      <div className="page page--map">
        <PageHeader title="Maps">
          <p className="lead">
            Explore modeled reassessment patterns countywide. Maps show assessment change relative to
            countywide base growth, valuation ratio versus the county median, and estimated annual
            property tax change.
          </p>
        </PageHeader>
        <MapRenderingUnavailableNotice />
      </div>
    )
  }

  if (loading) return <MapPageSkeleton />

  return (
    <div className="page page--map">
      <PageHeader title="Maps">
        <p className="lead">
          Explore modeled reassessment patterns countywide. Maps show assessment change relative to
          countywide base growth, valuation ratio versus the county median, and estimated annual
          property tax change.
        </p>
      </PageHeader>
      {error && <p className="search-error">{error}</p>}
      {mapDataError && <p className="search-error">{mapDataError}</p>}
      {valuationMapDataError && <p className="search-error">{valuationMapDataError}</p>}
      {taxMapDataError && <p className="search-error">{taxMapDataError}</p>}

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

      {config && config.mode !== 'unavailable' && (
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

          <MapGradientLegend
            gradientCss={legendGradientCss(config.value_change_color_stops)}
            ariaLabel="Assessment change relative to county base growth, from much slower to much faster"
            lowLabel="Slower than county base"
            highLabel="Faster than county base"
            centerLabel="County base growth"
            minTick={`${config.value_change_color_stops[0]?.pct ?? -80} pp`}
            maxTick={`+${config.value_change_color_stops[config.value_change_color_stops.length - 1]?.pct ?? 80} pp`}
            centerPositionPct={relativeChangeCenterPosition(config.value_change_color_stops)}
          />

          <p className="page-meta map-help">
            Color shows how much a parcel changed relative to countywide base growth (total assessed
            value). <strong>pp</strong> means percentage points versus that benchmark. Click a home
            to focus it and use the popup link to open full details.
          </p>

          {hexbins && hexbins.features.length > 0 && (
            <section className="card panel hex-surface-panel">
              <h3>Countywide relative-change visualization</h3>
              <p className="detail-foot">
                3D countywide view of where assessment changes are faster or slower than countywide
                base growth. Height indicates how many homes are in each area; color indicates
                direction.
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

      {valuationConfig && valuationConfig.mode !== 'unavailable' && (
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

          <MapGradientLegend
            gradientCss={valuationRatioGradientCss(
              (valuationConfig.valuation_ratio_bins ?? VALUATION_RATIO_BINS) as ValuationRatioBin[]
            )}
            ariaLabel="Valuation ratio relative to county median, from below typical to above typical"
            lowLabel="Below county median"
            highLabel="Above county median"
            centerLabel="County median (1.0)"
            minTick="< 0.7"
            maxTick="> 1.5"
            centerPositionPct={valuationRatioCenterPosition()}
          />

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

      {taxConfig && taxConfig.mode !== 'unavailable' && (
        <section className="map-section map-section--tax">
          <h2>Tax change</h2>
          <p className="detail-foot">
            Estimated change in annual property taxes after reassessment, using the same default
            commercial-growth assumption as the parcel page (countywide average residential growth).
            Homestead applied where flagged. Yellow is no change; green is lower taxes; red is higher.
          </p>

          {taxConfig.mode === 'points' && (
            <p className="page-meta">
              Showing a random sample of up to 10,000 homes per view when zoomed out. Zoom in for
              more detail.
            </p>
          )}

          <div className="map-shell">
            <ParcelMap
              config={taxConfig}
              displayMode="tax_change"
              highlightParcelId={selectedParcelId}
              onParcelFocus={onParcelFocus}
              onDataError={setTaxMapDataError}
              ariaLabel="Tax change map"
            />
          </div>

          <MapGradientLegend
            gradientCss={legendGradientCss(
              taxConfig.tax_change_color_stops ?? TAX_DELTA_COLOR_STOPS
            )}
            ariaLabel="Estimated annual tax change from lower to higher"
            lowLabel="Lower taxes"
            highLabel="Higher taxes"
            centerLabel="No change ($0)"
            minTick="−$2,400/yr"
            maxTick="+$2,400/yr"
            centerPositionPct={taxDeltaCenterPosition(
              taxConfig.tax_change_color_stops ?? TAX_DELTA_COLOR_STOPS
            )}
          />

          <p className="page-meta map-help">
            Colors show modeled change in total annual property tax (all levies). Values beyond
            ±$2,400/yr use the darkest green or red. Click a home to open full details.
          </p>

          {taxHexbins && taxHexbins.features.length > 0 && (
            <section className="card panel hex-surface-panel">
              <h3>Countywide tax-change visualization</h3>
              <p className="detail-foot">
                3D countywide view of average estimated tax change by area. Height shows how many
                homes are in each area; color shows whether taxes rise or fall.
              </p>
              <div className="map-shell hex-surface-shell">
                <HexSurfaceMap
                  data={taxHexbins}
                  bounds={taxConfig.bounds}
                  center={taxConfig.center}
                  stops={taxConfig.tax_change_color_stops ?? TAX_DELTA_COLOR_STOPS}
                  displayMode="tax_change"
                />
              </div>
              <p className="page-meta map-help">
                Hover an area to see sample size and average tax change. Areas shown:{' '}
                {taxHexbins.meta?.returned ?? taxHexbins.features.length}.
              </p>
            </section>
          )}
        </section>
      )}
    </div>
  )
}
