import { useCallback, useEffect, useId, useRef, useState } from 'react'
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
import {
  SegmentedControl,
  SegmentedPanel,
} from '../components/SegmentedControl'
import { usePageTitle } from '../hooks/usePageTitle'
import { MapViewSection, type MapViewId } from '../map/MapViewSection'
import { type FocusedParcel } from '../map/ParcelMap'
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
import { MapViewSkeleton } from '../components/skeletons/MapPageSkeleton'

const MAP_VIEW_OPTIONS = [
  { value: 'assessment' as const, label: 'Assessment change' },
  { value: 'valuation' as const, label: 'Valuation ratio' },
  { value: 'tax' as const, label: 'Tax change' },
]

const HEX_PARAMS = { hex_size_deg: 0.006, min_count: 8 }

function parseViewParam(value: string | null): MapViewId {
  if (value === 'valuation' || value === 'tax') return value
  return 'assessment'
}

type ViewData = {
  config: MapConfig | ValuationMapConfig | TaxMapConfig | null
  hexbins: MapHexbinCollection | ValuationMapHexbinCollection | TaxMapHexbinCollection | null
  error: string | null
  loading: boolean
}

const EMPTY_VIEW: ViewData = { config: null, hexbins: null, error: null, loading: false }

async function fetchViewData(view: MapViewId) {
  if (view === 'valuation') {
    const [config, hexbins] = await Promise.all([
      getValuationMapConfig(),
      getValuationMapHexbins(HEX_PARAMS),
    ])
    return { config, hexbins }
  }
  if (view === 'tax') {
    const [config, hexbins] = await Promise.all([
      getTaxMapConfig(),
      getTaxMapHexbins(HEX_PARAMS),
    ])
    return { config, hexbins }
  }
  const [config, hexbins] = await Promise.all([
    getMapConfig(),
    getMapHexbins(HEX_PARAMS),
  ])
  return { config, hexbins }
}

function viewDescription(view: MapViewId, medianRatio?: number | null) {
  if (view === 'valuation') {
    const median =
      medianRatio != null
        ? ` County median new÷old assessment ratio: ${medianRatio.toFixed(3)}×.`
        : ''
    return `How each home's modeled reassessment compares to the county median.${median} Showing a random sample of up to 10,000 homes per view when zoomed out.`
  }
  if (view === 'tax') {
    return 'Estimated change in annual property taxes after reassessment, using the same default commercial-growth assumption as the parcel page. Homestead applied where flagged. Yellow is no change; green is lower taxes; red is higher. Showing a random sample of up to 10,000 homes per view when zoomed out.'
  }
  return 'Residential homes only. Color shows estimated change in assessed value if the county reassesses properties.'
}

function viewCaption(view: MapViewId, hexCount?: number) {
  if (view === 'valuation') {
    return `Values below 1.0 reassess lower than the median parcel; values above 1.0 reassess higher. Click a home to focus it and open full details.${hexCount != null ? ` Countywide 3D areas shown: ${hexCount}.` : ''}`
  }
  if (view === 'tax') {
    return `Colors show modeled change in total annual property tax (all levies). Values beyond ±$2,400/yr use the darkest green or red. Click a home to open full details.${hexCount != null ? ` Countywide 3D areas shown: ${hexCount}.` : ''}`
  }
  return `Color shows change relative to countywide base growth (total assessed value). pp means percentage points versus that benchmark. Click a home to focus it and use the popup link to open full details.${hexCount != null ? ` Countywide 3D areas shown: ${hexCount}.` : ''}`
}

export function MapPage() {
  usePageTitle('Maps')
  const mapTabsId = useId()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryParcelId = searchParams.get('parcel') ?? undefined
  const activeView = parseViewParam(searchParams.get('view'))
  const [mapRenderingSupported] = useState(() => isMapRenderingSupported())
  const [viewCache, setViewCache] = useState<Partial<Record<MapViewId, ViewData>>>({})
  const loadedViewsRef = useRef<Set<MapViewId>>(new Set())
  const [parcelSelection, setParcelSelection] = useState(() => ({
    queryParcelId,
    selectedParcelId: queryParcelId,
  }))
  const [mapDataError, setMapDataError] = useState<string | null>(null)

  const activeData = viewCache[activeView] ?? { ...EMPTY_VIEW, loading: true }

  useEffect(() => {
    if (!mapRenderingSupported) return
    if (loadedViewsRef.current.has(activeView)) return

    let cancelled = false
    setViewCache((prev) => ({
      ...prev,
      [activeView]: { ...EMPTY_VIEW, loading: true },
    }))

    fetchViewData(activeView)
      .then(({ config, hexbins }) => {
        if (cancelled) return
        loadedViewsRef.current.add(activeView)
        setViewCache((prev) => ({
          ...prev,
          [activeView]: { config, hexbins, error: null, loading: false },
        }))
      })
      .catch((e) => {
        if (cancelled) return
        setViewCache((prev) => ({
          ...prev,
          [activeView]: {
            ...EMPTY_VIEW,
            error: e instanceof Error ? e.message : 'Failed to load map',
          },
        }))
      })

    return () => {
      cancelled = true
    }
  }, [activeView, mapRenderingSupported])

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

  const setActiveView = useCallback(
    (view: MapViewId) => {
      const next = new URLSearchParams(searchParams)
      if (view === 'assessment') {
        next.delete('view')
      } else {
        next.set('view', view)
      }
      setSearchParams(next, { replace: true })
      setMapDataError(null)
    },
    [searchParams, setSearchParams]
  )

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

  const valuationConfig =
    viewCache.valuation?.config && 'county_median_assessment_ratio' in viewCache.valuation.config
      ? viewCache.valuation.config
      : null
  const medianRatio = valuationConfig?.county_median_assessment_ratio
  const hexCount =
    activeData.hexbins?.features.length && activeData.hexbins.features.length > 0
      ? activeData.hexbins.features.length
      : undefined
  const showViewSkeleton = activeData.loading && !activeData.config

  return (
    <div className="page page--map">
      <PageHeader title="Maps">
        <p className="lead">
          Explore modeled reassessment patterns countywide. Choose a view below to compare assessment
          change, valuation ratio, and estimated tax change.
        </p>
      </PageHeader>

      <SegmentedControl
        id={mapTabsId}
        options={MAP_VIEW_OPTIONS}
        value={activeView}
        onChange={setActiveView}
        ariaLabel="Map views"
      />

      {activeData.error && (
        <p className="search-error" role="alert">
          {activeData.error}
        </p>
      )}
      {mapDataError && (
        <p className="search-error" role="alert">
          {mapDataError}
        </p>
      )}

      {MAP_VIEW_OPTIONS.map((option) => {
        const isActive = option.value === activeView
        return (
          <SegmentedPanel
            key={option.value}
            id={`${mapTabsId}-panel-${option.value}`}
            labelledBy={`${mapTabsId}-tab-${option.value}`}
            hidden={!isActive}
          >
            {isActive && showViewSkeleton && <MapViewSkeleton />}
            {isActive && activeData.config?.mode === 'unavailable' && (
              <section className="map-rendering-unavailable">
                <h2>Map data unavailable</h2>
                <p>
                  {activeView === 'tax'
                    ? 'Estimated tax-change values are not available in the current data bundle.'
                    : 'Map locations are not in the current data bundle yet. Rebuild the database with WPRDC parcel centroids, then optionally build vector tiles. See WPRDC parcel centroids for coordinates.'}
                </p>
              </section>
            )}
            {isActive && activeData.config && activeData.config.mode !== 'unavailable' && (
              <MapViewSection
                viewId={activeView}
                title={MAP_VIEW_OPTIONS.find((o) => o.value === activeView)?.label ?? 'Map'}
                description={viewDescription(activeView, medianRatio)}
                config={activeData.config}
                hexbins={activeData.hexbins}
                highlightParcelId={selectedParcelId}
                onParcelFocus={onParcelFocus}
                onDataError={setMapDataError}
                caption={viewCaption(activeView, hexCount)}
              />
            )}
          </SegmentedPanel>
        )
      })}
    </div>
  )
}
