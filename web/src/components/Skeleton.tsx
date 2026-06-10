import type { CSSProperties, ReactNode } from 'react'

type SkeletonProps = {
  className?: string
  width?: string | number
  height?: string | number
  block?: boolean
  style?: CSSProperties
}

export function Skeleton({ className = '', width, height, block, style }: SkeletonProps) {
  const merged: CSSProperties = {
    width,
    height,
    display: block ? 'block' : undefined,
    ...style,
  }
  return <span className={`skeleton ${className}`.trim()} style={merged} aria-hidden="true" />
}

type SkeletonPageProps = {
  label: string
  children: ReactNode
  className?: string
}

export function SkeletonPage({ label, children, className }: SkeletonPageProps) {
  const classes = className ? `page ${className}` : 'page'
  return (
    <div className={classes} aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  )
}

export function SkeletonPageHeader() {
  return (
    <header className="page-header skeleton-page-header">
      <Skeleton className="skeleton-title" block height={36} width="min(420px, 85%)" />
      <Skeleton block height={16} width="min(560px, 95%)" />
      <Skeleton block height={16} width="min(480px, 80%)" />
    </header>
  )
}

export function SkeletonCard({ lines = 3, accent }: { lines?: number; accent?: boolean }) {
  return (
    <section className={`card skeleton-card${accent ? ' card-accent' : ''}`}>
      <Skeleton className="skeleton-heading" block height={22} width="45%" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          block
          height={14}
          width={i === lines - 1 ? '70%' : '100%'}
          style={{ marginTop: i === 0 ? '1rem' : '0.55rem' }}
        />
      ))}
    </section>
  )
}
