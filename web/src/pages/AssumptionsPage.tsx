import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import duckHollowMap from '../assets/duck-hollow-map-example.png'
import { PageHeader } from '../components/PageHeader'
import { getManifest } from '../api'
import { usePageTitle } from '../hooks/usePageTitle'
import type { Manifest } from '../types'
import { formatMoney, formatPct } from '../format'
import {
  futureHomesteadExclusion,
  HOMESTEAD_EXCLUSION,
  PITTSBURGH_SCHOOL_HOMESTEAD_EXCLUSION,
} from '../homesteadExemption'

export function AssumptionsPage() {
  usePageTitle('Methodology & assumptions')
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getManifest()
      .then(setManifest)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  if (error) return <p className="search-error">{error}</p>
  if (!manifest) return <p className="page-meta">Loading…</p>

  const ratio = manifest.county_residential_value_ratio ?? manifest.county_summary?.county_value_ratio
  const avgPct = manifest.county_summary?.avg_value_change_pct
  const parcelCount = manifest.county_summary?.parcel_count ?? manifest.parcel_count

  const homesteadFutureCounty =
    ratio != null ? futureHomesteadExclusion(HOMESTEAD_EXCLUSION, ratio) : null
  const homesteadFuturePittsburghSchool =
    ratio != null
      ? futureHomesteadExclusion(PITTSBURGH_SCHOOL_HOMESTEAD_EXCLUSION, ratio)
      : null

  return (
    <div className="page">
      <PageHeader title="Methodology & assumptions">
        <p className="lead">
          Assumptions behind assessed values and property tax estimates on this site. For the full
          modeling pipeline, see{' '}
          <a href={manifest.methodology_url} target="_blank" rel="noreferrer">
            prohousingpgh/agc_assessments
          </a>
          .
        </p>
      </PageHeader>

      <div className="compare-grid">
        <section className="card">
          <h2>What we model</h2>
          <p>
            Market-value-style assessments for <strong>owner-occupied residential parcels</strong>{' '}
            using OpenAvmKit (regression, spatial comparables, and gradient-boosted models). We then
            apply 2025 nominal millage and illustrative post-reassessment rules to estimate annual
            property taxes.
          </p>
          <p className="detail-foot">Valuation date: {manifest.valuation_date ?? '2025-01-01'}</p>
        </section>
        <section className="card">
          <h2>What we do not claim</h2>
          <p>
            This is not the county&apos;s official reassessment, tax bill, or legal advice. Actual
            results can differ after appeals, abatements, special programs, legislative changes, and
            elected officials&apos; millage decisions.
          </p>
        </section>
      </div>

      <section className="card">
        <h2>Data sources</h2>
        <ul className="bullet-list">
          <li>
            <strong>Current assessments</strong> — WPRDC property assessments (parcel IDs, addresses,
            county/local assessed values, homestead flags).
          </li>
          <li>
            <strong>Modeled residential future values</strong> — OpenAvmKit output from the
            agc_assessments project.
          </li>
          <li>
            <strong>Commercial property (current only)</strong> — existing commercial assessed values
            by municipality and school district, used only for jurisdiction-wide revenue-neutral
            millage math (not shown as individual parcel lookups).
          </li>
          <li>
            <strong>2025 millage</strong> —{' '}
            <a
              href="https://apps.alleghenycounty.us/website/MillMuni.asp?Year=2025"
              target="_blank"
              rel="noreferrer"
            >
              Allegheny County Treasurer
            </a>{' '}
            (county, municipality, and school district rates).
          </li>
        </ul>
        {manifest.data_as_of && <p className="detail-foot">Data as of {manifest.data_as_of}</p>}
        {parcelCount != null && (
          <p className="detail-foot">
            About {parcelCount.toLocaleString()} homeowner parcels in this database.
          </p>
        )}
      </section>

      <section className="card">
        <h2>How we estimate your home&apos;s assessed value</h2>
        <p>
          For each residential parcel, we compare WPRDC&apos;s current total assessment to a modeled
          &quot;future&quot; total from OpenAvmKit. Dollar and percent changes on the parcel page
          come directly from those two totals.
        </p>
        <ul className="bullet-list">
          <li>
            We do not blend in commercial properties when showing a single home&apos;s value change.
          </li>
          <li>
            Countywide averages on this page and on parcel pages are summaries across all homeowner
            parcels in the dataset, not a forecast from any one municipality.
          </li>
        </ul>
      </section>

      <section className="card methodology-limitations">
        <h2>Limitations of this analysis</h2>
        <p>
          Any county-wide reassessment relies heavily on a <strong>mass appraisal</strong> system:
          statistical models that infer value from patterns across thousands of parcels. That approach
          works well for most homes with plenty of nearby sales and similar housing stock, but it will
          always miss some local circumstances where a pocket of a neighborhood is not closely related
          to the comps the model leans on.
        </p>
        <p>
          A full county reassessment would still use computer-aided mass appraisal for the bulk of
          parcels, but would supplement it with <strong>human review</strong> to correct outliers —
          places where geography, access, flood risk, housing type, or thin sales history mean
          automated comps are misleading.
        </p>

        <div className="methodology-example">
          <h3 className="assumptions-subhead">Example: Duck Hollow (Squirrel Hill)</h3>
          <figure className="methodology-figure">
            <img
              src={duckHollowMap}
              alt="Map of Summerset at Frick Park and Duck Hollow showing modeled valuation changes: mostly moderate increases in Summerset and very large increases in circled Duck Hollow parcels."
            />
            <figcaption>
              Duck Hollow (circled) vs. Summerset — modeled change, not official county values.
            </figcaption>
          </figure>
          <p>
            <strong>Duck Hollow</strong> sits in a river valley below Summerset at Frick Park and the
            main Squirrel Hill grid. It is physically and economically distinct from the newer,
            higher-value townhomes and single-family homes on the ridge at{' '}
            <strong>Summerset at Frick Park</strong>, yet the mass appraisal models on this site have
            little or no sales evidence from Duck Hollow itself. The system therefore tends to pull
            valuations toward nearby higher-end areas — and on our maps those Duck Hollow parcels show
            large increases relative to today&apos;s county assessments.
          </p>
          <p>
            One illustrative parcel is{' '}
            <Link to="/home/0129J00032000000">0129J00032000000</Link> in Duck Hollow — likely
            overstated by the computerized mass assessment relative to what a human appraiser would
            assign after visiting the site and weighing Duck Hollow on its own terms.
          </p>
          <p>
            <strong>What this tool does:</strong> Our estimates follow the OpenAvmKit mass appraisal
            output only, because we do not have the resources to replicate a full reassessment office
            with field review and appeals workflow. A real Allegheny County reassessment would be
            expected to catch many of these outliers; this site is useful for understanding broad
            patterns and your home&apos;s place in the model, not as a final determination for unusual
            locations like Duck Hollow.
          </p>
        </div>
      </section>

      <section className="card assumptions-card">
        <h2>How we estimate property taxes</h2>
        <p>
          Taxes are computed separately for <strong>Allegheny County</strong>, your{' '}
          <strong>municipality</strong>, and your <strong>school district</strong>, then summed.
        </p>

        <h3 className="assumptions-subhead">Basic formula</h3>
        <ul className="bullet-list">
          <li>
            <strong>Annual tax</strong> = taxable assessed value × millage ÷ 1,000 (for each taxing
            body).
          </li>
          <li>
            <strong>County tax</strong> uses county assessed value (WPRDC <code>COUNTYTOTAL</code>).
          </li>
          <li>
            <strong>Municipality and school taxes</strong> use local assessed value (WPRDC{' '}
            <code>LOCALTOTAL</code>).
          </li>
          <li>
            <strong>Today</strong> uses 2025 nominal millage from the Treasurer.{' '}
            <strong>After reassessment</strong> uses adjusted (effective) millage from the
            revenue-neutral rules below.
          </li>
        </ul>

        <h3 className="assumptions-subhead">Revenue-neutral millage (per taxing body)</h3>
        <p>
          Pennsylvania often discusses &quot;revenue-neutral&quot; reassessment: each taxing body
          adjusts its millage so <strong>total tax receipts for that body stay the same</strong>{' '}
          countywide, even though individual bills change.
        </p>
        <ul className="bullet-list">
          <li>
            We compute this <strong>separately</strong> for the county, each municipality, and each
            school district — not one blended rate for all three.
          </li>
          <li>
            For each body and scenario, we sum <strong>current</strong> taxable value (residential in
            our database + existing commercial assessments) and <strong>future</strong> taxable value
            (modeled residential + commercial under the commercial growth assumption).
          </li>
          <li>
            Adjustment factor = (current taxable sum) ÷ (future taxable sum). Post-reassessment
            effective millage = 2025 nominal millage × that factor.
          </li>
          <li>
            Your home&apos;s tax can still rise or fall if its assessed value changes more or less
            than the average in that jurisdiction.
          </li>
        </ul>

        <h3 className="assumptions-subhead">Commercial property (not modeled per parcel)</h3>
        <p>
          We do not have parcel-level commercial reassessment estimates. Commercial property still
          affects your bill because it is part of each jurisdiction&apos;s tax base when we calculate
          revenue-neutral millage after reassessment.
        </p>
        <ul className="bullet-list">
          <li>
            <strong>Today:</strong> commercial stays at current assessed values from county data.
          </li>
          <li>
            <strong>After reassessment:</strong> residential future values come from OpenAvmKit;
            existing commercial assessments grow by a rate you choose on the parcel page.
          </li>
          <li>
            <strong>Slider range:</strong> from +20% to +360% commercial growth, with the countywide
            average residential assessment change at the center for every address. Drag left for
            slower commercial growth or right for faster.
          </li>
          <li>
            Moving the slider recalculates revenue-neutral millage and your estimated post-reassessment
            taxes immediately.
          </li>
        </ul>

        <h3 className="assumptions-subhead">Homestead exemption</h3>
        <p>
          Homestead reduces <strong>taxable</strong> assessed value (not the assessment on your deed).
          Amounts differ by taxing body and by whether we are estimating taxes today or after
          reassessment. See the full{' '}
          <Link to="/homestead-exemptions">homestead exclusions reference</Link> for every
          municipality and school district.
        </p>
        <ul className="bullet-list">
          <li>
            <strong>County (today):</strong> {formatMoney(HOMESTEAD_EXCLUSION)} subtracted from
            taxable value when homestead applies.
          </li>
          <li>
            <strong>Municipality and school (today):</strong> per-jurisdiction amounts (default{' '}
            {formatMoney(HOMESTEAD_EXCLUSION)}; Pittsburgh city {formatMoney(15_000)}; Pittsburgh
            school {formatMoney(PITTSBURGH_SCHOOL_HOMESTEAD_EXCLUSION)}).
          </li>
          <li>
            <strong>After reassessment:</strong> we assume each exclusion grows with{' '}
            <strong>countywide residential assessed-value growth</strong> in this dataset:
            <br />
            (total modeled residential assessed value) ÷ (total current residential assessed value).
            The result is rounded to the <strong>nearest $1,000</strong>.
          </li>
          <li>
            Formula: future exclusion = round<sub>$1,000</sub>(today&apos;s exclusion × county ratio).
          </li>
          <li>
            Parcels with a homestead flag (<code>HOM</code>) in county data start with homestead
            applied on the parcel page. Anyone can also turn homestead on or off with the checkbox to
            see the effect.
          </li>
        </ul>
        {ratio != null && homesteadFutureCounty != null && homesteadFuturePittsburghSchool != null && (
          <p className="assumptions-example">
            <strong>Example with this dataset&apos;s county ratio ({ratio.toFixed(2)}×):</strong>{' '}
            county and municipality exclusions go from {formatMoney(HOMESTEAD_EXCLUSION)} to{' '}
            {formatMoney(homesteadFutureCounty)}; Pittsburgh school goes from{' '}
            {formatMoney(PITTSBURGH_SCHOOL_HOMESTEAD_EXCLUSION)} to{' '}
            {formatMoney(homesteadFuturePittsburghSchool)}.
          </p>
        )}

        <h3 className="assumptions-subhead">Split-rate municipalities</h3>
        <p>
          <strong>City of Clairton</strong>, <strong>City of McKeesport</strong>, and the{' '}
          <strong>Clairton School District</strong> levy different millage on land versus buildings.
          We apply land and building millage to the corresponding portions of local taxable value.
          Homestead exclusions apply to total local taxable value, allocated to land first, then
          building. Revenue-neutral millage after reassessment uses one adjustment factor per taxing
          body on total real estate tax.
        </p>

        <h3 className="assumptions-subhead">Optional adjustments on the parcel page</h3>
        <p>
          These are applied in your browser on top of API results — they do not change county records.
        </p>
        <ul className="bullet-list">
          <li>
            <strong>Homestead checkbox</strong> — Recalculates county, municipality, and school taxes
            using the rules above (including Pittsburgh school&apos;s higher exclusion when applicable).
          </li>
          <li>
            <strong>Income below 125% AMI (illustrative)</strong> — Models a proposed protection
            where <strong>county tax only</strong> after reassessment would not exceed 150% of
            today&apos;s county tax (a 50% increase cap). Municipality and school taxes are not
            capped. This is for exploration only, not current law on your bill.
          </li>
        </ul>

        <h3 className="assumptions-subhead">What is not in these tax estimates</h3>
        <ul className="bullet-list">
          <li>Payment plans, discounts, penalties, or delinquency</li>
          <li>Act 77 or other special tax relief programs beyond the illustrative income toggle</li>
          <li>Property tax abatements (e.g. LERTA, TIF) or appeal outcomes</li>
          <li>Changes to statutory millage after 2025</li>
        </ul>
      </section>

      {(ratio != null || avgPct != null) && (
        <section className="card">
          <h2>Countywide context (this dataset)</h2>
          <p>
            These countywide figures drive the post-reassessment homestead scaling described above and
            provide context for any single home.
          </p>
          {ratio != null && (
            <p>
              Total residential assessed value (modeled future ÷ current):{' '}
              <strong>{ratio.toFixed(2)}×</strong>
            </p>
          )}
          {avgPct != null && (
            <p>
              Average percent change across homeowner parcels: <strong>{formatPct(avgPct)}</strong>
            </p>
          )}
          <p className="detail-foot">
            Averages can differ from the total-value ratio because individual homes move by different
            percentages.
          </p>
        </section>
      )}

      <aside className="callout callout-info">{manifest.disclaimer}</aside>
    </div>
  )
}
