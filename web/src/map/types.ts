export type MapColorStop = {
  pct: number
  color: string
}

export type MapBounds = {
  west: number
  south: number
  east: number
  north: number
}

export type MapConfig = {
  mode: 'pmtiles' | 'points' | 'unavailable'
  bounds: MapBounds
  center: [number, number]
  value_change_color_stops: MapColorStop[]
  county_avg_value_change_pct: number
  pmtiles_url: string | null
  source_layer: string
  parcel_count: number
}

export type MapParcelFeature = {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    parcel_id: string
    value_change_pct: number | null
    address_display?: string
    municipality?: string
  }
}

export type MapParcelCollection = {
  type: 'FeatureCollection'
  features: MapParcelFeature[]
  meta?: {
    returned: number
    limit: number
    zoom: number
    sample_stride: number
  }
}

export type MapHexbinFeature = {
  type: 'Feature'
  geometry: {
    type: 'Polygon'
    coordinates: [Array<[number, number]>]
  }
  properties: {
    count: number
    rel_change_pp: number
  }
}

export type MapHexbinCollection = {
  type: 'FeatureCollection'
  features: MapHexbinFeature[]
  meta?: {
    returned: number
    hex_size_deg: number
    min_count: number
    county_avg_value_change_pct: number
  }
}
