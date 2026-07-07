import maplibregl from 'maplibre-gl'

export const MAP_RENDERING_UNAVAILABLE_MESSAGE =
  'Interactive maps require browser graphics acceleration with WebGL support. Turn on graphics acceleration or WebGL in your browser settings, then reload this page.'

export function isMapRenderingSupported() {
  if (typeof window === 'undefined') return true

  try {
    return maplibregl.supported()
  } catch (err) {
    console.error('Failed to check browser map rendering support', err)
    return false
  }
}

type MapRenderingUnavailableNoticeProps = {
  title?: string
  message?: string
  compact?: boolean
}

export function MapRenderingUnavailableNotice({
  title = 'Interactive maps are unavailable',
  message = MAP_RENDERING_UNAVAILABLE_MESSAGE,
  compact = false,
}: MapRenderingUnavailableNoticeProps) {
  const Heading = compact ? 'h3' : 'h2'

  return (
    <div
      className={`map-rendering-unavailable${compact ? ' map-rendering-unavailable--compact' : ''}`}
      role="status"
    >
      <Heading>{title}</Heading>
      <p>{message}</p>
    </div>
  )
}
