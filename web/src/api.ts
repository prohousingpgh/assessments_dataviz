import type {
  MapConfig,
  MapHexbinCollection,
  MapParcelCollection,
  MapParcelFeature,
  ValuationMapConfig,
  ValuationMapHexbinCollection,
  ValuationMapParcelCollection,
  ValuationMapParcelFeature,
} from './map/types'
import type { CountySummary, Manifest, Parcel, PropertyTaxes, SearchResult } from './types'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || res.statusText)
  }
  return res.json() as Promise<T>
}

export function searchParcels(query: string): Promise<{ results: SearchResult[] }> {
  return fetchJson(`/api/search?q=${encodeURIComponent(query)}`)
}

export function getParcel(parcelId: string): Promise<{
  parcel: Parcel
  county_summary: CountySummary
  taxes: PropertyTaxes
}> {
  return fetchJson(`/api/parcels/${encodeURIComponent(parcelId)}`)
}

export function getManifest(): Promise<Manifest> {
  return fetchJson('/api/manifest')
}

export function getMapConfig(): Promise<MapConfig> {
  return fetchJson('/api/map/config')
}

export function getMapParcelFeature(parcelId: string): Promise<MapParcelFeature> {
  return fetchJson(`/api/map/parcels/${encodeURIComponent(parcelId)}`)
}

export async function getMapParcels(
  params: {
    west: number
    south: number
    east: number
    north: number
    zoom?: number
    limit?: number
  },
  signal?: AbortSignal
): Promise<MapParcelCollection> {
  const query = new URLSearchParams({
    west: String(params.west),
    south: String(params.south),
    east: String(params.east),
    north: String(params.north),
  })
  if (params.zoom != null) {
    query.set('zoom', String(params.zoom))
  }
  if (params.limit != null) {
    query.set('limit', String(params.limit))
  }
  const res = await fetch(`/api/map/parcels?${query}`, { signal })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || res.statusText)
  }
  return res.json() as Promise<MapParcelCollection>
}

export function getMapHexbins(params?: {
  hex_size_deg?: number
  min_count?: number
}): Promise<MapHexbinCollection> {
  const query = new URLSearchParams()
  if (params?.hex_size_deg != null) {
    query.set('hex_size_deg', String(params.hex_size_deg))
  }
  if (params?.min_count != null) {
    query.set('min_count', String(params.min_count))
  }
  const suffix = query.toString() ? `?${query}` : ''
  return fetchJson(`/api/map/hexbins${suffix}`)
}

export function getValuationMapConfig(): Promise<ValuationMapConfig> {
  return fetchJson('/api/map/valuation/config')
}

export function getValuationMapParcelFeature(
  parcelId: string
): Promise<ValuationMapParcelFeature> {
  return fetchJson(`/api/map/valuation/parcels/${encodeURIComponent(parcelId)}`)
}

export async function getMapValuationParcels(
  params: {
    west: number
    south: number
    east: number
    north: number
    zoom?: number
    limit?: number
  },
  signal?: AbortSignal
): Promise<ValuationMapParcelCollection> {
  const query = new URLSearchParams({
    west: String(params.west),
    south: String(params.south),
    east: String(params.east),
    north: String(params.north),
  })
  if (params.zoom != null) {
    query.set('zoom', String(params.zoom))
  }
  if (params.limit != null) {
    query.set('limit', String(params.limit))
  }
  const res = await fetch(`/api/map/valuation/parcels?${query}`, { signal })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || res.statusText)
  }
  return res.json() as Promise<ValuationMapParcelCollection>
}

export function getValuationMapHexbins(params?: {
  hex_size_deg?: number
  min_count?: number
}): Promise<ValuationMapHexbinCollection> {
  const query = new URLSearchParams()
  if (params?.hex_size_deg != null) {
    query.set('hex_size_deg', String(params.hex_size_deg))
  }
  if (params?.min_count != null) {
    query.set('min_count', String(params.min_count))
  }
  const suffix = query.toString() ? `?${query}` : ''
  return fetchJson(`/api/map/valuation/hexbins${suffix}`)
}

export type HomesteadExemptionEntry = {
  name: string
  taxing_body: string
  amount: number
  confidence: string
  source: string
  source_url?: string
  notes?: string
}

export type HomesteadExemptionsTable = {
  tax_year?: number
  default_exclusion?: number
  county?: HomesteadExemptionEntry & { amount: number }
  municipalities: HomesteadExemptionEntry[]
  school_districts: HomesteadExemptionEntry[]
  metadata?: {
    disclaimer?: string
    verified_municipality_count?: number
    verified_school_district_count?: number
    proposed_school_district_count?: number
  }
}

export function getHomesteadExemptions(): Promise<HomesteadExemptionsTable> {
  return fetchJson('/api/homestead-exemptions')
}
