import { Skeleton, SkeletonPage, SkeletonPageHeader } from '../Skeleton'

function MapSectionSkeleton({ titleWidth }: { titleWidth: string }) {
  return (
    <section className="map-section skeleton-map-section">
      <Skeleton className="skeleton-heading" block height={26} width={titleWidth} />
      <Skeleton block height={14} width="92%" style={{ marginTop: '0.5rem' }} />
      <Skeleton block height={14} width="78%" style={{ marginTop: '0.4rem' }} />
      <div className="map-shell skeleton-map-shell" style={{ marginTop: '1rem' }} />
      <div className="skeleton-legend" style={{ marginTop: '1rem' }}>
        <Skeleton block height={12} width={72} />
        <Skeleton block height={16} width="100%" style={{ marginTop: '0.45rem' }} />
        <div className="skeleton-legend-labels">
          <Skeleton block height={12} width={96} />
          <Skeleton block height={12} width={88} />
        </div>
      </div>
      <Skeleton block height={14} width="95%" style={{ marginTop: '0.85rem' }} />
    </section>
  )
}

export function MapPageSkeleton() {
  return (
    <SkeletonPage label="Loading maps…" className="page--map">
      <SkeletonPageHeader />
      <MapSectionSkeleton titleWidth="42%" />
      <MapSectionSkeleton titleWidth="38%" />
    </SkeletonPage>
  )
}
