# Allegheny Home Assessment Explorer

Homeowner-facing site to look up a residential address in Allegheny County, compare current assessed values with modeled reassessment estimates from [prohousingpgh/agc_assessments](https://github.com/prohousingpgh/agc_assessments).

## Prerequisites

- Node.js 20+
- Python 3.11+
- Data files:
  - `residential_predictions.csv` (from agc_assessments / OpenAvmKit pipeline)
  - WPRDC property assessments CSV (for street-address search)

## Setup

### 1. Python API

```bash
cd path/to/assessments_dataviz
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Download millage rates (once per tax year)

```bash
python scripts/fetch_millage.py --year 2026
python scripts/fetch_millage.py --year 2025
```

Writes `data/millage_2026.json` (active rates) and `data/millage_2025.json` (reference) from the [Allegheny County Treasurer millage page](https://alleghenycountytreasurer.us/real-estate-tax/local-and-school-district-tax-millage/).

### 3. Build the search database

```bash
python scripts/build_db.py \
  --predictions path/to/residential_predictions.csv \
  --assessments path/to/wprdc_property_assessments.csv \
  --commercial path/to/commercial_existing_valuations.csv
```

This writes `data/parcels.db` and `data/manifest.json` (includes county/local assessed values and homestead flags for tax estimates).

### 4. Run the API

```bash
uvicorn api.main:app --reload --port 8000
```

### 5. Run the web app

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173

### Production-like local test (Docker)

```bash
python scripts/verify_data.py
docker compose up --build
```

Open http://localhost:8080 (API + built UI in one process).

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for onboarding, architecture, local dev shortcuts, and Cursor agent context.

## Documentation

| Doc | Purpose |
|-----|---------|
| [countywide-metrics-stakeholder-summary.md](docs/countywide-metrics-stakeholder-summary.md) | Short explanation of +118% vs +188% for stakeholders |
| [countywide-assessment-growth-methodology.md](docs/countywide-assessment-growth-methodology.md) | Full formulas, pipeline, and code references |

## Security

See **[SECURITY.md](SECURITY.md)** for secrets handling, what belongs in git, GitHub Release data bundles, and the public production API.

## Deploy to the web

See **[DEPLOY.md](DEPLOY.md)** for Fly.io + GitHub Actions setup targeting [prohousingpgh/assessments_dataviz](https://github.com/prohousingpgh/assessments_dataviz).

Summary: publish a `data-*` GitHub Release with `data-bundle.zip`, add `FLY_API_TOKEN`, push to `main`.

## Project layout

| Path | Purpose |
|------|---------|
| `scripts/build_db.py` | Filter homeowner uses, join addresses, SQLite + FTS |
| `api/` | FastAPI search and parcel detail |
| `web/` | Vite + React frontend |
| `data/` | Generated `parcels.db` (gitignored) |

## Property taxes

The parcel page shows estimated **annual** property tax for:

- Allegheny County
- Municipality (city or borough)
- School district

Uses 2026 millage from the county treasurer, WPRDC `COUNTYTOTAL` / `LOCALTOTAL`, and homestead (`HOM`) exclusion ($18,000) on county, municipality, and school taxable value.

**Revenue-neutral reassessment:** after modeled reassessment, each jurisdiction adjusts millage so total tax revenue stays the same, including existing commercial assessed values. Commercial reassessment is not modeled per parcel; the parcel page slider sets commercial growth from **+20% to +220%**, defaulting to **county base growth (~+118%)** at the center. An individual home’s tax can still change if its value shifts more or less than the countywide base.

## Roadmap

- [x] Property tax estimates (millage tables)
- [x] Single-server production deploy (Docker + Fly.io + GitHub Actions)
- [ ] Jack Billings - Verify Homestead Exclusions for every school district and municipality (add verified amounts to `data/homestead_exclusion_overrides.json`)
- [x] Homestead exclusions reference uses 2026 tax year (`data/homestead_exclusions.json`; rebuild with `python scripts/build_homestead_exclusions.py`)
- [ ] Neighborhood map (vector tiles from `predictions.parquet`; centroid map + PMTiles build scripts in repo)
- [x] Automated data bundle from agc_assessments CI (see [DEPLOY.md](DEPLOY.md#automated-rebuilds-recommended))
