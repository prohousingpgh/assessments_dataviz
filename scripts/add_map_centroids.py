"""
Add WPRDC parcel centroid coordinates to an existing parcels.db for the map view.

Usage:
  python scripts/add_map_centroids.py --centroids data/parcel_centroids_2025_march.csv
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build_db import load_centroids  # noqa: E402

DEFAULT_DB = ROOT / "data" / "parcels.db"


def add_centroids(db_path: Path, centroids_path: Path) -> None:
    if not db_path.is_file():
        raise SystemExit(f"Database not found: {db_path}")
    if not centroids_path.is_file():
        raise SystemExit(f"Centroids file not found: {centroids_path}")

    centroids = load_centroids(centroids_path)
    print(f"Loaded {len(centroids):,} centroid rows from {centroids_path.name}")

    conn = sqlite3.connect(db_path)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(parcels)").fetchall()}
    if "lon" not in cols:
        conn.execute("ALTER TABLE parcels ADD COLUMN lon REAL")
    if "lat" not in cols:
        conn.execute("ALTER TABLE parcels ADD COLUMN lat REAL")

    conn.execute("DROP TABLE IF EXISTS _map_centroids")
    centroids.to_sql("_map_centroids", conn, index=False, if_exists="replace")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_map_centroids_id ON _map_centroids(parcel_id)")
    conn.execute(
        """
        UPDATE parcels
        SET lon = c.lon,
            lat = c.lat
        FROM _map_centroids AS c
        WHERE parcels.parcel_id = c.parcel_id
        """
    )
    matched = conn.execute(
        "SELECT COUNT(*) FROM parcels WHERE lon IS NOT NULL AND lat IS NOT NULL"
    ).fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM parcels").fetchone()[0]
    conn.execute("DROP TABLE IF EXISTS _map_centroids")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_parcels_geo ON parcels(lon, lat)")
    conn.commit()
    conn.close()
    print(f"Matched {matched:,} / {total:,} homeowner parcels with map coordinates")


def main() -> None:
    parser = argparse.ArgumentParser(description="Add map centroids to parcels.db")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--centroids", type=Path, required=True)
    args = parser.parse_args()
    add_centroids(args.db, args.centroids)


if __name__ == "__main__":
    main()
