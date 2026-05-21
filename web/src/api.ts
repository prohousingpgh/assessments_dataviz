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
