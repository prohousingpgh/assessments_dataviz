# Countywide assessment growth — methodology

**Pro-Housing Pittsburgh · Allegheny Home Assessment Explorer**  
**Site:** [explorer.prohousingpgh.org](https://explorer.prohousingpgh.org)  
**In-app methodology:** [explorer.prohousingpgh.org/assumptions](https://explorer.prohousingpgh.org/assumptions)

> **Audience:** Researchers and collaborators who need formulas, data steps, and code references.  
> For a shorter “why we report it this way” summary, see [countywide-metrics-stakeholder-summary.md](./countywide-metrics-stakeholder-summary.md).

---

## Summary blurb (for email or memo)

We estimate that if Allegheny County reassessed owner-occupied residential properties using a mass-appraisal model (OpenAvmKit), **total residential assessed value would increase by about +118% (2.18×)** across roughly **447,000 homeowner parcels** in our dataset.

That is our **primary countywide figure**. It is dollar-weighted: sum of modeled future assessments divided by sum of current assessments.

Separately, the **mean percent change per parcel is about +188%**. That unweighted average treats every home equally, so neighborhoods with many low-value parcels and very large percentage increases pull it higher than the dollar-weighted figure.

For each home, we compare today’s WPRDC total assessment to a modeled “future” total from our OpenAvmKit pipeline ([prohousingpgh/agc_assessments](https://github.com/prohousingpgh/agc_assessments)). This is an **illustrative modeling exercise**, not an official county reassessment or forecast.

---

## Primary metric: county base growth (~+118%)

**What it is:** Dollar-weighted growth in total residential assessed value.

**Formula:**

```
county_value_ratio = (sum of NEW_ASSESSMENT_TOTAL) ÷ (sum of CURRENT_ASSESSMENT_TOTAL)
county_base_growth_pct = (county_value_ratio − 1) × 100
```

**Example production values** (from `/api/manifest` on the current data release; exact figures update with each bundle):

| Metric | Approx. value | Meaning |
|--------|---------------|---------|
| County base growth | **+118%** | Primary countywide benchmark |
| Total value ratio | **2.18×** | Modeled future ÷ current |
| Parcels included | **~447,000** | Homeowner parcels with valid current and future values |
| Current total | **~$64.4B** | Sum of current assessments |
| Modeled future total | **~$140.3B** | Sum of modeled future assessments |

**Used for:** parcel comparisons, map color centers, commercial growth slider midpoint (~118%), revenue-neutral tax math, and homestead exclusion scaling after reassessment.

---

## Secondary metric: mean parcel change (~+188%)

**What it is:** Unweighted arithmetic mean of each parcel’s percent change.

**Formula (per parcel):**

```
value_change_pct = (NEW_ASSESSMENT_TOTAL − CURRENT_ASSESSMENT_TOTAL) ÷ CURRENT_ASSESSMENT_TOTAL × 100
```

**Countywide:**

```
avg_value_change_pct = average of all parcel value_change_pct values
```

**Example production value:** **+188%** (`avg_value_change_pct ≈ 188.2`)

**Why it differs from +118%:** A $50,000 parcel with +300% counts the same as a $500,000 parcel with +50%. The dollar-weighted figure reflects that high-value parcels represent more of the total tax base.

The site shows this statistic in a footnote on the methodology and parcel pages — not as the headline countywide number.

---

## Tax estimates (related assumptions)

Property tax estimates on the site use **2026 nominal millage** from `data/millage_2026.json` (Allegheny County Treasurer).

The **commercial assessment growth slider** on parcel pages spans **+20% to +220%**, with the **midpoint at county base growth (~+118%)** — the same dollar-weighted residential growth rate above. That midpoint is the default when you open a parcel page.

---

## Calculation pipeline (step by step)

### 1. Modeled predictions

Each parcel comes from `residential_predictions.csv` (OpenAvmKit via [agc_assessments](https://github.com/prohousingpgh/agc_assessments)):

| Field | Meaning |
|-------|---------|
| `CURRENT_ASSESSMENT_TOTAL` | Today’s total assessed value (WPRDC) |
| `NEW_ASSESSMENT_TOTAL` | Modeled post-reassessment total |

### 2. Homeowner residential filter

Owner-occupied residential uses only (single-family, townhouse, condo, 2–4 family, mobile home, etc.). See `scripts/homeowner_uses.py`.

### 3. Per-parcel percent change

Computed in `scripts/build_db.py` when building `parcels.db`:

```python
df["value_change_dollars"] = df["new_assessment_total"] - df["current_assessment_total"]
df["value_change_pct"] = (
    (df["value_change_dollars"] / df["current_assessment_total"].replace(0, pd.NA)) * 100
)
```

### 4. Countywide aggregates

Computed at runtime in `api/db.py` → `get_summary_stats()`:

- `county_value_ratio` and `county_base_growth_pct` (primary)
- `avg_value_change_pct` (secondary)

---

## Where this appears in the codebase

| Location | Role |
|----------|------|
| `scripts/build_db.py` | Per-parcel `value_change_pct` |
| `api/db.py` → `get_summary_stats()` | County base growth and mean parcel change |
| `api/tax.py` | Tax slider midpoint from dollar-weighted ratio |
| `api/map_data.py` | Map color center from dollar-weighted growth |
| `web/src/countyGrowth.ts` | Shared helpers for county base growth |
| `web/src/commercialGrowth.ts` | Commercial slider range (+20%–+220%) and center |
| `web/src/pages/AssumptionsPage.tsx` | Methodology display |
| `web/src/pages/ParcelPage.tsx` | “Your home vs the county” |

---

## Important caveats

1. **Illustrative, not official.** Mass-appraisal modeling exercise; not county reassessment or tax bills.
2. **Model limitations.** Automated models can mis-estimate unusual locations (see Duck Hollow example on the assumptions page).
3. **Commercial is separate.** These growth figures cover residential homeowner parcels only; commercial growth is a separate slider assumption for revenue-neutral millage.
4. **Data vintage.** Figures reflect the current predictions CSV and WPRDC assessments bundle (`data_as_of` on `/api/manifest`).

---

## Questions?

Contact Pro-Housing Pittsburgh. Modeling pipeline: [prohousingpgh/agc_assessments](https://github.com/prohousingpgh/agc_assessments).
