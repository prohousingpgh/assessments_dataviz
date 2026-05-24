import type { MapConfig, MapParcelCollection } from './map/types'
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

export type HomesteadExemptionEntry = {
  name: string
  taxing_body: string
  amount: number
  confidence: 'verified' | 'default'
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
  }
}

export function getHomesteadExemptions(): Promise<HomesteadExemptionsTable> {
  return fetchJson('/api/homestead-exemptions')
}
