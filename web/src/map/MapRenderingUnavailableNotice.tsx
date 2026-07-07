import { MAP_RENDERING_UNAVAILABLE_MESSAGE } from './renderingSupport'

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
