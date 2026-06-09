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
  /** Map color center: dollar-weighted county base growth (percent points). */
  county_avg_value_change_pct: number
  county_base_growth_pct?: number
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

export type ValuationRatioBin = {
  color: string
  label: string
  ratio?: number
}

export type ValuationMapConfig = {
  mode: 'pmtiles' | 'points' | 'unavailable'
  bounds: MapBounds
  center: [number, number]
  valuation_ratio_bins: ValuationRatioBin[]
  county_median_assessment_ratio: number
  pmtiles_url: string | null
  source_layer: string
  parcel_count: number
}

export type ValuationMapParcelFeature = {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    parcel_id: string
    valuation_ratio: number | null
    address_display?: string
    municipality?: string
    current_assessment_total?: number
    new_assessment_total?: number
  }
}

export type ValuationMapParcelCollection = {
  type: 'FeatureCollection'
  features: ValuationMapParcelFeature[]
  meta?: {
    returned: number
    limit: number
    zoom: number
    county_median_assessment_ratio: number
  }
}

export type ValuationMapHexbinFeature = {
  type: 'Feature'
  geometry: {
    type: 'Polygon'
    coordinates: [Array<[number, number]>]
  }
  properties: {
    count: number
    avg_valuation_ratio: number
  }
}

export type ValuationMapHexbinCollection = {
  type: 'FeatureCollection'
  features: ValuationMapHexbinFeature[]
  meta?: {
    returned: number
    hex_size_deg: number
    min_count: number
    county_median_assessment_ratio: number
  }
}

export type MapDisplayMode = 'value_change' | 'valuation_ratio'
