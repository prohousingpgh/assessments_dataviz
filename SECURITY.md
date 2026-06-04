# Security

## Reporting issues

If you find a security problem (leaked credentials, unintended data exposure, etc.), please report it privately to [Pro-Housing Pittsburgh](https://www.prohousingpgh.org/) rather than opening a public issue with sensitive details.

## Secrets and credentials

- **Do not commit** `.env` files, Fly deploy tokens, GitHub personal access tokens, or API keys. `.env` and large data files are listed in `.gitignore`.
- **Production deploy** uses the GitHub Actions secret `FLY_API_TOKEN` only; it must not appear in source code, issues, or commit messages.
- Workflows use the built-in `${{ github.token }}` for release downloads within the repository scope.

## What is in git

The repository is intended to contain **application source** and small **public reference data** (millage JSON, homestead exclusion tables).

These are **not** committed and must stay out of git:

| Path | Contents |
|------|----------|
| `data/*.csv` | Source WPRDC assessments, predictions, commercial valuations |
| `data/parcels.db` | Full homeowner parcel database with addresses |
| `data/manifest.json`, `data/tax_aggregates.json` | Generated runtime metadata |
| `data/data-bundle.zip`, `data/*.pmtiles` | Deployment bundles and map tiles |

## GitHub Releases (`data-*`)

Runtime data ships as `data-bundle.zip` on GitHub Releases (includes `parcels.db`). Treat release assets as **sensitive at scale**: full county homeowner addresses and modeled assessments. Restrict repository and release access to trusted collaborators.

## Public deployment

The production app ([assessments-dataviz.fly.dev](https://assessments-dataviz.fly.dev)) intentionally exposes **public property records** via search and parcel APIs (addresses, parcel IDs, assessments, tax estimates). That is product behavior, not a leaked secret—but it is a wide **public data surface**.

The SQLite schema does **not** include owner names, SSNs, phone numbers, or email addresses.

## Local development

- Use a local `.env` only if you add custom configuration; never commit it.
- After cloning, build `data/parcels.db` locally or unzip a trusted `data-bundle.zip`; do not commit the result.

## Checklist before making the repo public

1. Confirm no secrets in git history (`git log -S "ghp_"`, search for `FLY_API`).
2. Confirm `data/*.db` and `data/*.csv` remain gitignored.
3. Decide whether GitHub Release bundles should remain private to the org.
4. Review [DEPLOY.md](DEPLOY.md) and rotate `FLY_API_TOKEN` if it was ever exposed.
