import { Skeleton, SkeletonPage } from '../Skeleton'

export function ParcelPageSkeleton() {
  return (
    <SkeletonPage label="Loading your home…" className="skeleton-page--parcel">
      <header className="page-header page-header--parcel skeleton-page-header">
        <Skeleton className="skeleton-title" block height={36} width="min(480px, 90%)" />
        <Skeleton block height={16} width="min(380px, 75%)" />
        <Skeleton block height={14} width="min(220px, 50%)" />
      </header>

      <section className="card comparison-card skeleton-card">
        <div className="comparison-grid">
          <div className="comparison-column">
            <Skeleton className="skeleton-heading" block height={22} width="55%" />
            <div className="skeleton-stack">
              <Skeleton block height={12} width="70%" />
              <Skeleton block height={28} width="85%" />
              <Skeleton block height={12} width="80%" />
              <Skeleton block height={28} width="75%" />
            </div>
          </div>
          <div className="comparison-column">
            <Skeleton className="skeleton-heading" block height={22} width="60%" />
            <div className="skeleton-stack">
              <Skeleton block height={12} width="70%" />
              <Skeleton block height={28} width="85%" />
              <Skeleton block height={12} width="80%" />
              <Skeleton block height={28} width="75%" />
            </div>
          </div>
        </div>
      </section>

      <section className="section skeleton-card">
        <Skeleton className="skeleton-heading" block height={22} width="40%" />
        <div className="skeleton-stack">
          <Skeleton block height={14} width="95%" />
          <Skeleton block height={14} width="80%" />
        </div>
        <div className="map-shell skeleton-map-shell skeleton-map-shell--spaced" />
      </section>

      <section className="card skeleton-card">
        <Skeleton className="skeleton-heading" block height={22} width="55%" />
        <div className="skeleton-stack">
          <Skeleton block height={14} width="100%" />
          <Skeleton block height={14} width="88%" />
        </div>
        <div className="skeleton-table skeleton-table--spaced">
          <Skeleton block height={36} width="100%" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} block height={44} width="100%" />
          ))}
        </div>
      </section>
    </SkeletonPage>
  )
}
