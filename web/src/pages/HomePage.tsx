import { SearchBox } from '../components/SearchBox'

const POLICY_ARTICLE_URL =
  'https://www.prohousingpgh.org/blog/policy-property-tax-assessments'

export function HomePage() {
  return (
    <div className="page">
      <section className="home-hero" aria-labelledby="home-hero-title">
        <h1 id="home-hero-title">What could reassessment mean for your home?</h1>
        <p className="lead">
          Enter your Allegheny County address to compare today&apos;s assessed value with modeled
          values if the county reassesses residential properties.
        </p>
      </section>

      <section className="card panel">
        <SearchBox autoFocus />
      </section>

      <section className="steps-grid">
        <div>
          <h3>1. Look up</h3>
          <p>Search by street address. No parcel ID needed.</p>
        </div>
        <div>
          <h3>2. Compare</h3>
          <p>See assessed value today and under the Pro-Housing modeled reassessment.</p>
        </div>
        <div>
          <h3>3. Understand</h3>
          <p>Read how estimates are built and how your home compares to county trends.</p>
        </div>
      </section>

      <section className="card panel explainer" aria-labelledby="explainer-title">
        <h2 id="explainer-title">Why reassessment matters</h2>
        <p>
          Property taxes are based on <strong>assessed value</strong> — how much the county says your
          home and land are worth — multiplied by millage rates set by the county, city, school
          district, and other bodies. When assessments drift far from real market values, the tax
          system stops working fairly.
        </p>

        <h3>Assessments in Allegheny County are out of date</h3>
        <p>
          Pittsburgh and Allegheny County used to reassess properties on a regular cycle. Court
          rulings ended that practice decades ago. The last county-wide reassessment was in{' '}
          <strong>2012</strong>, and newer values are still tied to that base year through state
          adjustment formulas. As a result, many homes are assessed far below what they would sell for
          today — sometimes by a large margin.
        </p>

        <h3>Stale assessments shift the burden unfairly</h3>
        <ul className="bullet-list">
          <li>
            <strong>Newer homes and renovations</strong> often face higher effective tax rates than
            long-owned properties assessed years ago at much lower values.
          </li>
          <li>
            That discourages new housing supply and tends to push costs onto{' '}
            <strong>renters and new residents</strong>, while owners who successfully appeal
            assessments are disproportionately wealthier.
          </li>
          <li>
            <strong>Regular, accurate reassessment</strong> spreads the tax base more fairly across
            properties at their current values.
          </li>
        </ul>

        <h3>Reassessment does not automatically mean higher taxes for everyone</h3>
        <p>
          Pennsylvania requires millage rates to be adjusted after a county-wide reassessment so total
          tax revenue stays about the same — an anti-windfall rule. For a typical home near the
          median, total tax can stay similar even as assessed values rise toward market levels; some
          under-assessed homes would pay more, and others would pay less.
        </p>
        <p>
          Pro-Housing Pittsburgh supports legislation to make Allegheny County assessments{' '}
          <strong>regular, frequent, and fair</strong>, triggered when values drift too far from the
          market. This tool helps you see how a reassessment modeled on current market values might
          affect your home — not official county figures.
        </p>
        <p className="explainer-more">
          <a href={POLICY_ARTICLE_URL} target="_blank" rel="noreferrer">
            Read the full policy brief on property tax assessments
          </a>{' '}
          (Pro-Housing Pittsburgh, May 2024)
        </p>
      </section>

      <aside className="callout callout-info">
        These are illustrative estimates from OpenAvmKit modeling — not official county figures.
      </aside>
    </div>
  )
}
