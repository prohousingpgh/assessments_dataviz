import { Skeleton, SkeletonCard, SkeletonPage, SkeletonPageHeader } from '../Skeleton'

export function AssumptionsPageSkeleton() {
  return (
    <SkeletonPage label="Loading methodology…">
      <SkeletonPageHeader />

      <div className="compare-grid">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </div>

      <section className="card skeleton-card">
        <Skeleton className="skeleton-heading" block height={22} width="50%" />
        <Skeleton block height={14} width="100%" style={{ marginTop: '1rem' }} />
        <Skeleton block height={14} width="94%" style={{ marginTop: '0.55rem' }} />
        <Skeleton block height={14} width="88%" style={{ marginTop: '0.55rem' }} />
        <div className="skeleton-figure" style={{ marginTop: '1.25rem' }}>
          <Skeleton block height={220} width="100%" />
          <Skeleton block height={12} width="60%" style={{ marginTop: '0.65rem' }} />
        </div>
        <Skeleton block height={14} width="100%" style={{ marginTop: '1rem' }} />
        <Skeleton block height={14} width="96%" style={{ marginTop: '0.55rem' }} />
        <Skeleton block height={14} width="78%" style={{ marginTop: '0.55rem' }} />
      </section>

      <SkeletonCard lines={5} />
      <SkeletonCard lines={4} />
    </SkeletonPage>
  )
}
