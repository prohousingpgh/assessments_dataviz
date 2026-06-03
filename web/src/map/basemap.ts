import type { RasterLayerSpecification, RasterSourceSpecification } from 'maplibre-gl'

export const BASEMAP_SOURCE: RasterSourceSpecification = {
  type: 'raster',
  tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  tileSize: 256,
  attribution: '© OpenStreetMap contributors',
}

/**
 * Desaturate only the raster basemap (not parcel layers).
 * Avoid raster-brightness-min near 1 — it remaps tile values and can wash out the map entirely.
 */
export const BASEMAP_RASTER_PAINT: RasterLayerSpecification['paint'] = {
  'raster-saturation': -1,
  'raster-contrast': 0.15,
  'raster-opacity': 1,
}

export function basemapRasterLayer(layerId = 'basemap'): RasterLayerSpecification {
  return {
    id: layerId,
    type: 'raster',
    source: 'basemap',
    paint: BASEMAP_RASTER_PAINT,
  }
}

export const BASEMAP_STYLE_SOURCES = {
  basemap: BASEMAP_SOURCE,
}
