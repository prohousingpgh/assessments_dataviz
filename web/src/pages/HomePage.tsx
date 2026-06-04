import { PageHeader } from '../components/PageHeader'
import { SearchBox } from '../components/SearchBox'
import { usePageTitle } from '../hooks/usePageTitle'

const POLICY_ARTICLE_URL =
  'https://www.prohousingpgh.org/blog/policy-property-tax-assessments'

export function HomePage() {
  usePageTitle('Look up your home')

  return (
    <div className="page">
      <PageHeader title="Look up your home">
        <p className="lead">
          Enter your Allegheny County address to compare today&apos;s assessed value with modeled
          values if the county reassesses residential properties.
        </p>
      </PageHeader>

      <section className="card panel">
        <SearchBox autoFocus />
      </section>

      <section className="steps-grid">
        <div>
          <h3>1. Look up</h3>
          <p>Search by street address.</p>
        </div>
        <div>
          <h3>2. Compare</h3>
          <p>See assessed value today and under the modeled reassessment.</p>
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
        <p>
          When the county does not reassess, the tax system stops treating similar properties alike.
          People who buy, build, renovate, or move end up carrying more than their share — not because
          they use more services, but because their assessments reflect today&apos;s market while
          many long-held properties do not.
        </p>
        <ul className="bullet-list">
          <li>
            <strong>Young families</strong> buying a first home often pay taxes on a full market-value
            assessment while neighbors in comparable houses pay on values frozen near 2012 levels.
          </li>
          <li>
            <strong>Retirees downsizing</strong> sell at today&apos;s prices and buy smaller homes
            assessed at current values, potentially spiking their costs while on fixed incomes.
          </li>
          <li>
            <strong>Anyone who moves</strong> within the county — for work, family, accessibility, or
            a fresh start — typically steps onto a higher effective tax rate than households that have
            stayed put since the last reassessment.
          </li>
          <li>
            <strong>New construction and renovations</strong> are discouraged because they pay higher
            effective taxes than older homes of similar size and quality.
          </li>
          <li>
            <strong>Renters and new residents</strong> feel this too: mobility and new investment are
            punished, while staying under-assessed is rewarded. Wealthy homeowners are more likely to
            appeal successfully and stay under-assessed for years or decades.
          </li>
        </ul>
        <p>
          That is not a fair way to fund schools, cities, and county services.{' '}
          <strong>Regular, accurate reassessment</strong> does not invent new burdens out of thin air —
          it aligns everyone&apos;s share with what property is actually worth today.
        </p>

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
