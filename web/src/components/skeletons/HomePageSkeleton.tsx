import { Skeleton, SkeletonPage, SkeletonPageHeader } from '../Skeleton'

export function HomePageSkeleton() {
  return (
    <SkeletonPage label="Loading search…">
      <SkeletonPageHeader />
      <div className="home-search skeleton-stack">
        <Skeleton className="skeleton-heading" block height={22} width="38%" />
        <Skeleton block height={52} width="100%" />
      </div>
      <ol className="steps-row skeleton-steps">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i}>
            <Skeleton block height={28} width={28} />
            <div className="skeleton-stack skeleton-stack--sm">
              <Skeleton block height={18} width="55%" />
              <Skeleton block height={14} width="88%" />
            </div>
          </li>
        ))}
      </ol>
    </SkeletonPage>
  )
}
