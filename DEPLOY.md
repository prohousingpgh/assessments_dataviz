# Deployment (single server)

Production runs **one container**: FastAPI serves `/api/*` and the Vite-built React app on the same host (Fly.io by default).

Large files (`parcels.db`, ~150MB) are **not** in git. They ship as a [GitHub Release](https://github.com/prohousingpgh/assessments_dataviz/releases) asset; CI downloads that bundle before each deploy.

## Prerequisites

- [Fly.io](https://fly.io) account (free tier works for low traffic)
- [GitHub CLI](https://cli.github.com/) (`gh`) for releases and repo setup
- Built data locally (`python scripts/build_db.py` …) or an existing `data-bundle.zip`

## 1. Push the repo to GitHub

From the project root (first time only):

```powershell
git init
git add .
git commit -m "Add turnkey Fly.io deployment"
gh repo create prohousingpgh/assessments_dataviz --public --source=. --remote=origin --push
```

If the repo already exists on GitHub:

```powershell
git remote add origin https://github.com/prohousingpgh/assessments_dataviz.git
git branch -M main
git push -u origin main
```

## 2. Publish a data release

Whenever predictions or millage change, rebuild the DB and upload a release:

```powershell
python scripts/build_db.py `
  --predictions "C:\path\to\residential_predictions.csv" `
  --assessments "data\assessments_wprdc.csv"

python scripts/package_data.py
# Creates data\data-bundle.zip

$tag = "data-" + (Get-Date -Format "yyyy-MM-dd")
gh release create $tag data/data-bundle.zip --title "Runtime data $tag"
```

Release tags **must** start with `data-` (e.g. `data-2026-05-20`). Deploy uses the newest matching tag.

### Automated rebuilds (recommended)

When [agc_assessments](https://github.com/prohousingpgh/agc_assessments) updates `output/`, the [Update data bundle](.github/workflows/update-data.yml) workflow can rebuild and publish a new `data-*` release automatically:

| Trigger | When |
|---------|------|
| `repository_dispatch` | agc_assessments pushes to `output/` (see [docs/agc-dispatch-workflow.yml](docs/agc-dispatch-workflow.yml)) |
| Daily schedule | Checks whether `residential_predictions.csv` changed (SHA in `.github/data-sync-state.json`) |
| Manual | Actions → Update data bundle → Run workflow |

**One-time setup**

1. Create a GitHub Release tagged **`sources`** with `assessments_wprdc.csv` and `parcel_centroids.csv` (WPRDC files not in agc_assessments).
2. If `agc_assessments` is private, add secret **`AGC_ASSESSMENTS_TOKEN`** (PAT with `repo` read) to this repo.
3. In agc_assessments, add the dispatch workflow from [docs/agc-dispatch-workflow.yml](docs/agc-dispatch-workflow.yml) and secret **`NOTIFY_DATAVIZ_TOKEN`** (PAT with `repo` on assessments_dataviz).

**Local rebuild from upstream:**

```powershell
$env:GH_TOKEN = "ghp_..."   # or gh auth login
python scripts/rebuild_data_bundle.py
gh release create "data-$(Get-Date -Format yyyy-MM-dd)" data/data-bundle.zip
```

County-wide slider midpoint and map color center are **recomputed from the new database** (dollar-weighted county base growth); no manual reset needed.

## 3. Create the Fly app

```powershell
fly auth login
fly apps create assessments-dataviz
# Or: fly launch --no-deploy  (accept Dockerfile, region iad, don't deploy yet)
```

Copy a deploy token for GitHub:

```powershell
fly tokens create deploy -x 999999h
```

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|------|--------|
| `FLY_API_TOKEN` | token from above |

## 4. Deploy

**Automatic:** push to `main` → [Deploy workflow](.github/workflows/deploy.yml) downloads the latest `data-*` release and runs `flyctl deploy`.

**Manual:**

```powershell
# Ensure data/ is populated (build or unzip a bundle)
python scripts/verify_data.py
fly deploy
```

**Local production smoke test:**

```powershell
docker compose up --build
# Open http://localhost:8080
```

## 5. Custom domain (optional)

```powershell
fly certs add yourdomain.org
```

Add the DNS records `fly certs show` prints. HTTPS is automatic.

## Updating the site

| Change | Action |
|--------|--------|
| App code (UI/API) | Push to `main` (CI deploys) or `fly deploy` |
| Predictions / assessments | Automatic via update-data workflow, or manual rebuild → `data-*` release |
| Millage only | `python scripts/fetch_millage.py --year 2026`, rebuild DB, new data release |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Deploy workflow: no `data-*` release | Run step 2 |
| Docker build: `parcels.db missing` | `python scripts/verify_data.py` locally |
| Fly OOM | `fly.toml` already requests 1GB RAM; scale up if needed |
| 404 on `/home/123` | Rebuild image (SPA needs `StaticFiles(..., html=True)`) |

## Architecture

```text
Browser → Fly (HTTPS) → uvicorn:8080
                          ├── /api/*  → SQLite (data/parcels.db)
                          └── /*      → web/dist (React SPA)
```
