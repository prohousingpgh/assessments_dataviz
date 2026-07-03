"""Add tax_delta_dollars column to an existing parcels.db (for tax-change map)."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from build_db import attach_tax_delta_dollars  # noqa: E402

DEFAULT_DB = ROOT / "data" / "parcels.db"


def main() -> None:
    db_path = DEFAULT_DB
    if len(sys.argv) > 1:
        db_path = Path(sys.argv[1])
    if not db_path.is_file():
        raise SystemExit(f"Database not found: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    attach_tax_delta_dollars(conn)
    conn.close()
    print(f"Updated {db_path}")


if __name__ == "__main__":
    main()
