# Countywide metrics — stakeholder summary

**Pro-Housing Pittsburgh · Allegheny Home Assessment Explorer**  
**Site:** [explorer.prohousingpgh.org](https://explorer.prohousingpgh.org)  
**Updated:** June 2026

> **Audience:** Research chairs, policymakers, and partners who need a concise explanation of what our countywide numbers mean.  
> For full formulas and code references, see [countywide-assessment-growth-methodology.md](./countywide-assessment-growth-methodology.md).

---

## Summary blurb (for email)

Our Assessment Explorer reports countywide reassessment figures using **one primary benchmark**:

**~+118% (2.18×)** — dollar-weighted growth in total residential assessed value (modeled future ÷ current). This matches how revenue-neutral reassessment works: taxing bodies adjust millage based on **total** assessed value, not the average percent change per parcel.

We also publish **mean percent change per parcel (~+188%)** as a **secondary** statistic with a clear label. That figure is higher because it treats every home equally; lower-value parcels with very large percentage increases pull it up.

Tax estimates use **2026 millage**. The commercial growth slider on parcel pages runs from **+20% to +220%**, defaulting to **~+118%** at the center (county base growth).

---

## Two metrics, one headline

| Metric | Approx. value | What it measures | How we use it |
|--------|---------------|------------------|---------------|
| **County base growth** | ~**+118%** (2.18×) | Dollar-weighted total assessed value growth | **Primary** — maps, parcel comparisons, slider midpoint, tax math |
| **Mean parcel change** | ~**+188%** | Unweighted average of each home’s % change | **Secondary** — footnote for researchers |

Both come from the same OpenAvmKit output across ~447,000 homeowner parcels. They answer different questions.

---

## Why we standardized on +118%

Previously, both numbers were sometimes called “county average assessment increase,” which caused confusion — including questions about how we arrived at 188%.

**Our decision:**

- Lead with **+118% / 2.18×** everywhere we describe countywide reassessment
- Keep **+188%** visible but labeled as “mean per parcel (unweighted)”
- Align the commercial growth slider midpoint and map colors with the +118% benchmark

Tax and homestead math already used the dollar-weighted ratio; this change aligned public-facing language with that math.

---

## How to interpret for homeowners

- **Countywide base growth ~+118%** → total residential assessed value in our model roughly doubles in dollar terms.
- **A home with +80% change** is **below** countywide base growth → under revenue-neutral rules, that home’s taxes may fall relative to today (depending on commercial assumptions and jurisdiction).
- **+188% mean per parcel** → “If every home counted equally, what’s the average percent change?” Useful for analysis, not our headline number.

---

## Technical note

```
county base growth = (sum of modeled future assessments ÷ sum of current assessments − 1) × 100

mean parcel change = average of (future − current) ÷ current × 100 across homeowner parcels
```

Live values: [explorer.prohousingpgh.org/api/manifest](https://explorer.prohousingpgh.org/api/manifest) → `county_summary`.

---

## Questions?

Contact Pro-Housing Pittsburgh.
