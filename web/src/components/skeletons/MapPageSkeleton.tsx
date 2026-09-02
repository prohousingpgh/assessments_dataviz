import { Skeleton, SkeletonPage, SkeletonPageHeader } from '../Skeleton'

export function MapPageSkeleton() {
  return (
    <SkeletonPage label="Loading maps…" className="page--map">
      <SkeletonPageHeader />
      <div className="skeleton-tabs">
        <Skeleton block height={36} width={140} />
        <Skeleton block height={36} width={130} />
        <Skeleton block height={36} width={110} />
      </div>
      <section className="map-section skeleton-map-section">
        <Skeleton className="skeleton-heading" block height={26} width="42%" />
        <div className="skeleton-stack">
          <Skeleton block height={14} width="92%" />
          <Skeleton block height={14} width="78%" />
        </div>
        <div className="map-shell skeleton-map-shell skeleton-map-shell--spaced" />
        <div className="skeleton-legend skeleton-legend--spaced">
          <Skeleton block height={12} width={72} />
          <Skeleton block height={16} width="100%" />
          <div className="skeleton-legend-labels">
            <Skeleton block height={12} width={96} />
            <Skeleton block height={12} width={88} />
          </div>
        </div>
        <Skeleton block height={14} width="95%" />
      </section>
    </SkeletonPage>
  )
}
