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
cd "c:\Users\david\Documents\Dev Projects\assessments_dataviz"
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Download millage rates (once per tax year)

```bash
python scripts/fetch_millage.py --year 2026
python scripts/fetch_millage.py --year 2025
```

Writes `data/millage_2026.json` (active rates) and `data/millage_2025.json` (reference) from the [Allegheny County Treasurer millage page](https://alleghenycountytreasurer.us/real-estate-tax/local-and-school-district-tax-millage/).

Jack Billings note: those millage reates are out of date.
For example, City of Pittsburgh millage was 8.06 in 2025, and is 9.67 in 2026.
2026 Millage rates can be found here https://alleghenycountytreasurer.us/real-estate-tax/local-and-school-district-tax-millage/

### 3. Build the search database

```bash
python scripts/build_db.py ^
  --predictions "C:\path\to\residential_predictions_20260503.csv" ^
  --assessments "data\assessments_wprdc.csv" ^
  --commercial "data\commercial_existing_valuations.csv"
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

Uses 2025 millage from the county treasurer, WPRDC `COUNTYTOTAL` / `LOCALTOTAL`, and homestead (`HOM`) exclusion ($18,000) on county, municipality, and school taxable value.

**Revenue-neutral reassessment:** after modeled reassessment, each jurisdiction (county, municipality, school district) adjusts millage so total tax revenue stays the same, including existing commercial assessed values. Commercial reassessment is not modeled; the site uses +20% commercial growth as the estimate, with a range from 0% (low) to +40% (high). An individual home’s tax can still change if its value shifts more or less than the jurisdiction average.

## Roadmap

- [x] Property tax estimates (millage tables)
- [x] Single-server production deploy (Docker + Fly.io + GitHub Actions)
- [ ] Neighborhood map (vector tiles from `predictions.parquet`; centroid map + PMTiles build scripts in repo)
- [ ] Automated data bundle from agc_assessments CI
