import { Skeleton, SkeletonPage } from '../Skeleton'

export function ParcelPageSkeleton() {
  return (
    <SkeletonPage label="Loading your home…" className="skeleton-page--parcel">
      <header className="page-header page-header--parcel skeleton-page-header">
        <Skeleton className="skeleton-title" block height={36} width="min(480px, 90%)" />
        <Skeleton block height={16} width="min(380px, 75%)" />
        <Skeleton block height={14} width="min(220px, 50%)" />
      </header>

      <div className="compare-grid">
        <section className="card skeleton-card">
          <Skeleton className="skeleton-heading" block height={22} width="55%" />
          <div className="headline-metrics skeleton-headline-metrics">
            <div className="headline-metric">
              <Skeleton block height={12} width="70%" />
              <Skeleton block height={28} width="85%" style={{ marginTop: '0.35rem' }} />
            </div>
            <div className="headline-metric">
              <Skeleton block height={12} width="80%" />
              <Skeleton block height={28} width="75%" style={{ marginTop: '0.35rem' }} />
            </div>
          </div>
          <div className="skeleton-detail-list">
            <Skeleton block height={14} width="100%" />
            <Skeleton block height={14} width="92%" />
          </div>
        </section>

        <section className="card card-accent skeleton-card">
          <Skeleton className="skeleton-heading" block height={22} width="60%" />
          <div className="headline-metrics skeleton-headline-metrics">
            <div className="headline-metric">
              <Skeleton block height={12} width="70%" />
              <Skeleton block height={28} width="85%" style={{ marginTop: '0.35rem' }} />
            </div>
            <div className="headline-metric">
              <Skeleton block height={12} width="80%" />
              <Skeleton block height={28} width="75%" style={{ marginTop: '0.35rem' }} />
            </div>
          </div>
          <div className="skeleton-detail-list">
            <Skeleton block height={14} width="100%" />
            <Skeleton block height={14} width="88%" />
            <Skeleton block height={14} width="65%" />
          </div>
        </section>
      </div>

      <section className="card skeleton-card">
        <Skeleton className="skeleton-heading" block height={22} width="40%" />
        <Skeleton block height={14} width="95%" style={{ marginTop: '0.75rem' }} />
        <Skeleton block height={14} width="80%" style={{ marginTop: '0.45rem' }} />
        <div className="map-shell skeleton-map-shell" style={{ marginTop: '1rem' }} />
      </section>

      <section className="card skeleton-card">
        <Skeleton className="skeleton-heading" block height={22} width="55%" />
        <Skeleton block height={14} width="100%" style={{ marginTop: '0.75rem' }} />
        <Skeleton block height={14} width="88%" style={{ marginTop: '0.45rem' }} />
        <div className="skeleton-table" style={{ marginTop: '1.25rem' }}>
          <Skeleton block height={36} width="100%" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} block height={44} width="100%" style={{ marginTop: '0.35rem' }} />
          ))}
        </div>
      </section>
    </SkeletonPage>
  )
}
