import { Skeleton, SkeletonPage, SkeletonPageHeader } from '../Skeleton'

export function HomesteadPageSkeleton() {
  return (
    <SkeletonPage label="Loading homestead exclusions…">
      <SkeletonPageHeader />

      <section className="card skeleton-card">
        <Skeleton className="skeleton-heading" block height={22} width="35%" />
        <div className="skeleton-stack">
          <Skeleton block height={16} width="55%" />
          <Skeleton block height={14} width="75%" />
        </div>
      </section>

      <section className="card skeleton-card">
        <div className="skeleton-tabs">
          <Skeleton block height={36} width={160} />
          <Skeleton block height={36} width={170} />
        </div>
        <Skeleton block height={40} width="min(240px, 100%)" />
        <div className="skeleton-stack">
          <Skeleton block height={14} width="85%" />
        </div>
        <div className="skeleton-table skeleton-table--spaced">
          <Skeleton block height={40} width="100%" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} block height={36} width="100%" />
          ))}
        </div>
      </section>
    </SkeletonPage>
  )
}
