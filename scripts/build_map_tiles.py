"""
Build PMTiles for the neighborhood map from parcel centroids or polygon boundaries.

Centroid mode (default when --db has lon/lat):
  python scripts/build_map_tiles.py --db data/parcels.db

Polygon mode (requires GeoJSON/GeoPackage/Shapefile boundaries):
  python scripts/build_map_tiles.py --db data/parcels.db --boundaries path/to/parcels.geojson

Requires tippecanoe on PATH: https://github.com/felt/tippecanoe
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "parcels.db"
DEFAULT_OUTPUT = ROOT / "data" / "parcels.pmtiles"


def _export_centroid_geojson(conn: sqlite3.Connection, out_path: Path) -> int:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(parcels)").fetchall()}
    if not {"lon", "lat"}.issubset(cols):
        raise SystemExit("Database has no lon/lat columns. Rebuild with: --centroids <csv>")

    rows = conn.execute(
        """
        SELECT parcel_id, lon, lat, value_change_pct, address_display, municipality
        FROM parcels
        WHERE lon IS NOT NULL AND lat IS NOT NULL
        """
    ).fetchall()
    features = []
    for row in rows:
        pct = row["value_change_pct"]
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(row["lon"]), float(row["lat"])],
                },
                "properties": {
                    "parcel_id": row["parcel_id"],
                    "value_change_pct": float(pct) if pct is not None else -9999,
                    "address_display": row["address_display"] or "",
                    "municipality": row["municipality"] or "",
                },
            }
        )

    collection = {"type": "FeatureCollection", "features": features}
    out_path.write_text(json.dumps(collection), encoding="utf-8")
    return len(features)


def _run_tippecanoe(geojson_path: Path, output_path: Path, *, layer: str = "parcels") -> None:
    if shutil.which("tippecanoe") is None:
        raise SystemExit(
            "tippecanoe not found on PATH. Install from https://github.com/felt/tippecanoe "
            "or use the map in point mode without PMTiles."
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "tippecanoe",
        "-o",
        str(output_path),
        "-l",
        layer,
        "-n",
        "parcels",
        "--drop-densest-as-needed",
        "--extend-zoom-if-still-dropping",
        "-Z9",
        "-z16",
        "--force",
        str(geojson_path),
    ]
    print("Running:", " ".join(cmd))
    subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build parcel map PMTiles")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument(
        "--boundaries",
        type=Path,
        default=None,
        help="Optional parcel polygon GeoJSON (not yet implemented — use centroids from --db)",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if not args.db.is_file():
        raise SystemExit(f"Database not found: {args.db}")

    if args.boundaries:
        raise SystemExit(
            "Polygon tile build is not implemented yet. Use centroid mode or join geometry "
            "in agc_assessments predictions.parquet first."
        )

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    with tempfile.TemporaryDirectory() as tmp:
        geojson_path = Path(tmp) / "parcels.geojson"
        count = _export_centroid_geojson(conn, geojson_path)
        conn.close()
        print(f"Exported {count:,} parcel points")
        _run_tippecanoe(geojson_path, args.output)
    size_mb = args.output.stat().st_size / 1_048_576
    print(f"Wrote {args.output} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
