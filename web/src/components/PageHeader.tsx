import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  children?: ReactNode
  className?: string
}

/** Page title and intro copy — always outside cards, separate from actionable UI. */
export function PageHeader({ title, children, className }: PageHeaderProps) {
  const classes = className ? `page-header ${className}` : 'page-header'
  return (
    <header className={classes}>
      <h1>{title}</h1>
      {children}
    </header>
  )
}
