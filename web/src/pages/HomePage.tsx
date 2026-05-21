import { SearchBox } from '../components/SearchBox'

export function HomePage() {
  return (
    <div className="page">
      <section className="hero-block">
        <h1>What could reassessment mean for your home?</h1>
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

      <aside className="callout callout-info">
        These are illustrative estimates from OpenAvmKit modeling — not official county figures.
      </aside>
    </div>
  )
}
