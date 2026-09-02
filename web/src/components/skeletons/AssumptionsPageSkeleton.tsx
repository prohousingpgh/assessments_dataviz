import { Skeleton, SkeletonCard, SkeletonPage, SkeletonPageHeader } from '../Skeleton'

export function AssumptionsPageSkeleton() {
  return (
    <SkeletonPage label="Loading methodology…">
      <SkeletonPageHeader />

      <nav className="doc-contents skeleton-card">
        <Skeleton className="skeleton-heading" block height={20} width="30%" />
        <div className="skeleton-stack">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} block height={14} width={`${70 - i * 5}%`} />
          ))}
        </div>
      </nav>

      <div className="compare-grid">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </div>

      <section className="section doc-section skeleton-card">
        <Skeleton className="skeleton-heading" block height={22} width="50%" />
        <div className="skeleton-stack">
          <Skeleton block height={14} width="100%" />
          <Skeleton block height={14} width="94%" />
          <Skeleton block height={14} width="88%" />
        </div>
        <div className="skeleton-figure skeleton-figure--spaced">
          <Skeleton block height={220} width="100%" />
          <Skeleton block height={12} width="60%" />
        </div>
        <div className="skeleton-stack">
          <Skeleton block height={14} width="100%" />
          <Skeleton block height={14} width="96%" />
          <Skeleton block height={14} width="78%" />
        </div>
      </section>

      <SkeletonCard lines={5} />
      <SkeletonCard lines={4} />
    </SkeletonPage>
  )
}
