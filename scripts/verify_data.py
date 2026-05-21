"""Exit non-zero if runtime data files required for deploy are missing."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

REQUIRED = (
    "parcels.db",
    "manifest.json",
    "millage_2025.json",
    "tax_aggregates.json",
)


def main() -> None:
    missing = [name for name in REQUIRED if not (DATA_DIR / name).is_file()]
    if missing:
        print("Missing data files:", ", ".join(missing), file=sys.stderr)
        print(
            "Build with: python scripts/build_db.py --predictions <csv> --assessments <csv>",
            file=sys.stderr,
        )
        print(
            "Or unzip a release bundle: Expand-Archive data/data-bundle.zip -DestinationPath data",
            file=sys.stderr,
        )
        sys.exit(1)
    print("Data files OK")


if __name__ == "__main__":
    main()
