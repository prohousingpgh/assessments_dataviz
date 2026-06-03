"""
Create data-bundle.zip for GitHub Releases (CI deploy) or offline transfer.

Includes only runtime files (not source CSVs/HTML).

Usage:
  python scripts/package_data.py
  python scripts/package_data.py --output dist/data-bundle.zip
"""

from __future__ import annotations

import argparse
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DEFAULT_OUTPUT = DATA_DIR / "data-bundle.zip"

RUNTIME_FILES = (
    "parcels.db",
    "manifest.json",
    "millage_2025.json",
    "millage_2026.json",
    "tax_aggregates.json",
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Package runtime data for deployment")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Zip output path (default: data/data-bundle.zip)",
    )
    args = parser.parse_args()

    missing = [name for name in RUNTIME_FILES if not (DATA_DIR / name).is_file()]
    if missing:
        raise SystemExit(
            "Missing required data files: "
            + ", ".join(missing)
            + "\nRun: python scripts/build_db.py --predictions <csv> --assessments <csv>"
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in RUNTIME_FILES:
            path = DATA_DIR / name
            zf.write(path, arcname=name)
            print(f"  + {name} ({path.stat().st_size / 1_048_576:.1f} MB)")
        pmtiles = DATA_DIR / "parcels.pmtiles"
        if pmtiles.is_file():
            zf.write(pmtiles, arcname="parcels.pmtiles")
            print(f"  + parcels.pmtiles ({pmtiles.stat().st_size / 1_048_576:.1f} MB)")

    size_mb = args.output.stat().st_size / 1_048_576
    print(f"Wrote {args.output} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
