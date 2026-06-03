"""Exit non-zero if runtime data files required for deploy are invalid or missing."""

from __future__ import annotations

import sys
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

REQUIRED = (
    "parcels.db",
    "manifest.json",
    "millage_2025.json",
    "millage_2026.json",
    "tax_aggregates.json",
)


def verify_db_integrity(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    try:
        result = conn.execute("PRAGMA integrity_check").fetchone()
    finally:
        conn.close()
    status = str(result[0]) if result else "unknown"
    if status.lower() != "ok":
        raise SystemExit(f"Database integrity check failed: {status}")


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
    verify_db_integrity(DATA_DIR / "parcels.db")
    print("Data files OK")


if __name__ == "__main__":
    main()
