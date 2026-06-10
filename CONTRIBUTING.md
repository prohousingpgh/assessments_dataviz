# Contributing

Guide for humans and Cursor agents working on the Allegheny Home Assessment Explorer.

## Access

- GitHub access to [prohousingpgh/assessments_dataviz](https://github.com/prohousingpgh/assessments_dataviz) (private).
- Permission to download **`data-*` GitHub Releases** (runtime `data-bundle.zip` with `parcels.db`).
- No deploy secrets needed for normal UI/API work. `FLY_API_TOKEN` is only for maintainers.

## Quick start (recommended)

```bash
git clone https://github.com/prohousingpgh/assessments_dataviz.git
cd assessments_dataviz

python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# Fastest path to working search/maps — download latest data release
gh release list --limit 5
gh release download <data-tag> --pattern data-bundle.zip --dir /tmp
# Windows PowerShell: unzip to data/
unzip -o /tmp/data-bundle.zip -d data/

# Terminal 1 — API
uvicorn api.main:app --reload --port 8000

# Terminal 2 — web
cd web && npm install && npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to port 8000 (override with `API_PORT`, e.g. `API_PORT=8010 npm run dev` if 8000 is stuck on Windows).

**Alternative:** rebuild `data/parcels.db` with `scripts/build_db.py` if you have source CSVs (see README).

## Architecture

```text
Browser (Vite dev :5173 or Fly :8080)
  ├── /api/*  → FastAPI (api/) → SQLite data/parcels.db
  └── /*      → React SPA (web/src/)
```

| Area | Key paths |
|------|-----------|
| Search & parcel API | `api/main.py`, `api/db.py` |
| Property tax math | `api/tax.py`, `data/millage_2026.json`, `data/homestead_exclusions.json` |
| Map / valuation surfaces | `api/map_data.py`, `api/map_routes.py`, `web/src/map/` |
| Parcel UI | `web/src/pages/ParcelPage.tsx` |
| Maps page | `web/src/pages/MapPage.tsx` |
| Methodology copy | `web/src/pages/AssumptionsPage.tsx` |
| Homepage | `web/src/pages/HomePage.tsx` |
| DB build | `scripts/build_db.py`, `scripts/package_data.py` |
| Deploy | `.github/workflows/deploy.yml`, `Dockerfile`, `DEPLOY.md` |

**Upstream modeling:** reassessment predictions come from [prohousingpgh/agc_assessments](https://github.com/prohousingpgh/agc_assessments) (`residential_predictions.csv`).

## Tax logic notes

- Millage is **2026** in `data/millage_2026.json`; **2025** is reference only.
- Homestead exclusion ($18,000) applies to county, municipality, and school taxable value when `HOM` is set.
- **Revenue-neutral reassessment:** each jurisdiction scales millage so total revenue stays flat; commercial growth uses a +20% baseline (0–40% range).
- **Split-rate municipalities** (land vs building millage): City of Clairton, City of McKeesport, Clairton school district. Config in `millage_2026.json` (`split_rate_local_taxes`); math in `api/tax.py`; homestead applied to total local taxable, land first.

## What not to commit

See [SECURITY.md](SECURITY.md). Never commit:

- `data/parcels.db`, `data/*.csv`, `data/data-bundle.zip`, `data/*.pmtiles`
- `.env`, tokens, or credentials

Millage JSON **does** belong in git (tax rules ship with app code).

## Deploy behavior

Push to `main` triggers GitHub Actions deploy to Fly.io ([explorer.prohousingpgh.org](https://explorer.prohousingpgh.org)).

CI downloads the newest `data-*` release, then **restores `data/millage_2025.json` and `data/millage_2026.json` from the commit** so data bundles cannot overwrite split-rate or other tax config. See `.github/workflows/deploy.yml`.

**Automated data updates:** when [agc_assessments](https://github.com/prohousingpgh/agc_assessments) changes `output/`, the update-data workflow fetches predictions, runs `scripts/rebuild_data_bundle.py`, publishes a `data-*` release, and deploys. County slider midpoint and map center update automatically from the rebuilt DB. See [DEPLOY.md](DEPLOY.md#automated-rebuilds-recommended).

Manual fallback: `python scripts/rebuild_data_bundle.py` → new `data-*` release.

## Workflow

1. Branch from `main` for non-trivial changes.
2. Run API + Vite locally; verify parcel search and any affected pages.
3. Open a PR; maintainer reviews and merges.
4. Merging to `main` deploys automatically.

## Useful test parcels

| Parcel ID | Why |
|-----------|-----|
| `0381J00137000000` | McKeesport split-rate land/building taxes |
| `0129J00032000000` | Duck Hollow — methodology limitations example |

## Cursor agent

Open the repo root in Cursor. Agent context lives in `.cursor/rules/project.mdc` (always applied). Point the agent at this file and specific paths when starting a task.

Do **not** rely on exported chat transcripts from other sessions — use repo docs, issues, and PRs instead.

## More docs

- [README.md](README.md) — setup, tax overview, roadmap
- [DEPLOY.md](DEPLOY.md) — Fly.io, data releases, troubleshooting
- [SECURITY.md](SECURITY.md) — secrets and sensitive data
