import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { SegmentedControl } from '../components/SegmentedControl'
import { getHomesteadExemptions, type HomesteadExemptionsTable } from '../api'
import { usePageTitle } from '../hooks/usePageTitle'
import { formatMoney } from '../format'
import { HomesteadPageSkeleton } from '../components/skeletons/HomesteadPageSkeleton'

type HomesteadTab = 'municipality' | 'school'

const TAB_OPTIONS = [
  { value: 'municipality' as const, label: 'Municipalities' },
  { value: 'school' as const, label: 'School districts' },
]

export function HomesteadExemptionsPage() {
  usePageTitle('Homestead exclusions')
  const [data, setData] = useState<HomesteadExemptionsTable | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<HomesteadTab>('municipality')
  const panelId = useId()

  useEffect(() => {
    getHomesteadExemptions()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    const list = tab === 'municipality' ? data.municipalities : data.school_districts
    const q = filter.trim().toLowerCase()
    if (!q) return list
    return list.filter((r) => r.name.toLowerCase().includes(q))
  }, [data, filter, tab])

  if (error) {
    return (
      <p className="search-error" role="alert">
        {error}
      </p>
    )
  }
  if (!data) return <HomesteadPageSkeleton />

  const verifiedMuni = data.metadata?.verified_municipality_count ?? 0
  const verifiedSchool = data.metadata?.verified_school_district_count ?? 0
  const proposedSchool = data.metadata?.proposed_school_district_count ?? 0
  const confidenceClass = (confidence: string) => {
    const normalized = confidence.toLowerCase()
    if (normalized === 'verified') return 'verified'
    if (normalized.startsWith('proposed')) return 'proposed'
    return 'default'
  }

  const tabOptions = TAB_OPTIONS.map((option) => ({
    ...option,
    label:
      option.value === 'municipality'
        ? `Municipalities (${data.municipalities.length})`
        : `School districts (${data.school_districts.length})`,
  }))

  return (
    <div className="page">
      <PageHeader title="Homestead exclusions">
        <p className="lead">
          Act 50 homestead exclusions reduce <strong>taxable assessed value</strong> before millage is
          applied. Dollar amounts used in tax estimates for tax year {data.tax_year ?? 2026}. See also{' '}
          <Link to="/assumptions">Methodology & assumptions</Link>.
        </p>
      </PageHeader>

      <section className="card">
        <h2>County (all parcels)</h2>
        <p>
          <strong>{formatMoney(data.county?.amount ?? data.default_exclusion)}</strong> —{' '}
          {data.county?.source ?? 'Allegheny County Act 50'}
          {data.county?.source_url && (
            <>
              {' '}
              (<a href={data.county.source_url} target="_blank" rel="noreferrer">
                source
              </a>
              )
            </>
          )}
        </p>
        <p className="detail-foot">
          Default for municipalities and school districts without a verified local amount:{' '}
          <strong>{formatMoney(data.default_exclusion)}</strong>.
        </p>
      </section>

      <section className="card">
        <SegmentedControl
          options={tabOptions}
          value={tab}
          onChange={setTab}
          ariaLabel="Jurisdiction type"
        />
        <div id={`${panelId}-${tab}`} role="tabpanel" className="segmented-control-panel">
          <label className="homestead-filter">
            <span className="visually-hidden">Filter by name</span>
            <input
              type="search"
              className="field"
              placeholder="Filter by name…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <p className="page-meta">
            Verified locally: {verifiedMuni} municipalities, {verifiedSchool} school districts. Rows
            marked <em>proposed</em> are computed from state property tax relief allocations and
            homestead counts ({proposedSchool} school districts). Rows marked <em>default</em> use{' '}
            {formatMoney(data.default_exclusion)} until confirmed.
          </p>
          <div className="table-scroll">
            <table className="tax-table homestead-table">
              <thead>
                <tr>
                  <th scope="col">Jurisdiction</th>
                  <th scope="col" className="num">
                    Exclusion
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td className="num">{formatMoney(row.amount)}</td>
                    <td>
                      <span className={`confidence-pill ${confidenceClass(row.confidence)}`}>
                        {row.confidence}
                      </span>
                    </td>
                    <td>
                      {row.source_url ? (
                        <a href={row.source_url} target="_blank" rel="noreferrer">
                          {row.source}
                        </a>
                      ) : (
                        row.source
                      )}
                      {row.notes && <p className="table-note">{row.notes}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="page-meta">No jurisdictions match your filter.</p>}
        </div>
      </section>

      {data.metadata?.disclaimer && (
        <aside className="callout callout-info">{data.metadata.disclaimer}</aside>
      )}
    </div>
  )
}
