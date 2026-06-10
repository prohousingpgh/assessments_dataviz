import { Skeleton, SkeletonPage, SkeletonPageHeader } from '../Skeleton'

export function HomePageSkeleton() {
  return (
    <SkeletonPage label="Loading search…">
      <SkeletonPageHeader />

      <section className="card panel skeleton-card">
        <Skeleton className="skeleton-heading" block height={22} width="38%" />
        <Skeleton block height={14} width="92%" style={{ marginTop: '0.75rem' }} />
        <Skeleton block height={14} width="78%" style={{ marginTop: '0.45rem' }} />
        <Skeleton block height={44} width="100%" style={{ marginTop: '1.25rem' }} />
      </section>

      <section className="steps-grid skeleton-steps">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i}>
            <Skeleton block height={18} width="55%" />
            <Skeleton block height={14} width="88%" style={{ marginTop: '0.5rem' }} />
          </div>
        ))}
      </section>
    </SkeletonPage>
  )
}
