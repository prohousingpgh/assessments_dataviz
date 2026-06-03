import type { ReactNode } from 'react'
import { formatJurisdictionName } from '../format'

export type TaxingBodyKind = 'county' | 'municipality' | 'school' | 'local'

const KIND_LABELS: Record<TaxingBodyKind, string> = {
  county: 'County',
  municipality: 'Municipality',
  school: 'School district',
  local: 'Misc levy',
}

export function TaxingBodyLabel({
  kind,
  name,
  children,
}: {
  kind: TaxingBodyKind
  name: string
  children?: ReactNode
}) {
  return (
    <>
      <span className="tax-body-heading">
        <span className="tax-body-chip">{KIND_LABELS[kind]}</span>
        <span className="tax-body-name">{formatJurisdictionName(name)}</span>
      </span>
      {children}
    </>
  )
}
