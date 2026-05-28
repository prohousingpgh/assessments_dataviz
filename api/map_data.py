from __future__ import annotations

import math
import sqlite3
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PMTILES_PATH = ROOT / "data" / "parcels.pmtiles"

# Allegheny County approximate bounds (WGS84).
DEFAULT_BOUNDS: dict[str, float] = {
    "west": -80.52,
    "south": 40.24,
    "east": -79.62,
    "north": 40.72,
}

# Choropleth breaks in percentage points relative to county average growth.
RELATIVE_CHANGE_COLOR_STOPS: list[dict[str, Any]] = [
    {"pct": -80, "color": "#2166ac"},
    {"pct": -40, "color": "#67a9cf"},
    {"pct": -10, "color": "#d1e5f0"},
    {"pct": 10, "color": "#fddbc7"},
    {"pct": 40, "color": "#ef8a62"},
    {"pct": 80, "color": "#b2182b"},
]


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {str(r[1]) for r in rows}


def has_parcel_centroids(conn: sqlite3.Connection) -> bool:
    cols = _table_columns(conn, "parcels")
    return "lon" in cols and "lat" in cols


def parcel_bounds(conn: sqlite3.Connection) -> dict[str, float]:
    if not has_parcel_centroids(conn):
        return dict(DEFAULT_BOUNDS)
    row = conn.execute(
        """
        SELECT MIN(lon) AS west, MIN(lat) AS south, MAX(lon) AS east, MAX(lat) AS north
        FROM parcels
        WHERE lon IS NOT NULL AND lat IS NOT NULL
        """
    ).fetchone()
    if not row or row["west"] is None:
        return dict(DEFAULT_BOUNDS)
    return {
        "west": float(row["west"]),
        "south": float(row["south"]),
        "east": float(row["east"]),
        "north": float(row["north"]),
    }


def map_config(conn: sqlite3.Connection) -> dict[str, Any]:
    bounds = parcel_bounds(conn)
    has_centroids = has_parcel_centroids(conn)
    has_pmtiles = PMTILES_PATH.is_file()
    mode = "pmtiles" if has_pmtiles else ("points" if has_centroids else "unavailable")
    county_avg_value_change_pct = _county_avg_value_change_pct(conn)
    return {
        "mode": mode,
        "bounds": bounds,
        "center": [
            (bounds["west"] + bounds["east"]) / 2,
            (bounds["south"] + bounds["north"]) / 2,
        ],
        "value_change_color_stops": RELATIVE_CHANGE_COLOR_STOPS,
        "county_avg_value_change_pct": county_avg_value_change_pct,
        "pmtiles_url": "/api/map/tiles/parcels.pmtiles" if has_pmtiles else None,
        "source_layer": "parcels",
        "parcel_count": _parcel_count(conn),
    }


def _parcel_count(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COUNT(*) AS n FROM parcels").fetchone()
    return int(row["n"]) if row else 0


def _county_avg_value_change_pct(conn: sqlite3.Connection) -> float:
    row = conn.execute(
        """
        SELECT AVG(value_change_pct) AS avg_value_change_pct
        FROM parcels
        WHERE current_assessment_total > 0 AND new_assessment_total > 0
        """
    ).fetchone()
    value = row["avg_value_change_pct"] if row else None
    return float(value) if value is not None else 0.0


def _limit_for_zoom(zoom: float) -> int:
    if zoom >= 14:
        return 12_000
    if zoom >= 13:
        return 10_000
    if zoom >= 12:
        return 8_000
    if zoom >= 11:
        return 7_500
    if zoom >= 10:
        return 9_000
    return 10_000


def map_parcels_geojson(
    conn: sqlite3.Connection,
    *,
    west: float,
    south: float,
    east: float,
    north: float,
    limit: int | None = None,
    zoom: float | None = None,
) -> dict[str, Any]:
    if not has_parcel_centroids(conn):
        return {"type": "FeatureCollection", "features": []}

    if west > east or south > north:
        return {"type": "FeatureCollection", "features": []}

    z = 12.0 if zoom is None else float(zoom)
    cap = _limit_for_zoom(z) if limit is None else max(1, min(limit, 12_000))
    rows = conn.execute(
        """
        SELECT parcel_id, lon, lat, value_change_pct, address_display, municipality
        FROM parcels
        WHERE lon IS NOT NULL
          AND lat IS NOT NULL
          AND lon BETWEEN ? AND ?
          AND lat BETWEEN ? AND ?
        ORDER BY random()
        LIMIT ?
        """,
        (west, east, south, north, cap),
    ).fetchall()

    features: list[dict[str, Any]] = []
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
                    "value_change_pct": float(pct) if pct is not None else None,
                    "address_display": row["address_display"],
                    "municipality": row["municipality"],
                },
            }
        )
    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "returned": len(features),
            "limit": cap,
            "zoom": z,
            "sample_stride": 1,
        },
    }


def map_hexbins_geojson(
    conn: sqlite3.Connection,
    *,
    hex_size_deg: float = 0.006,
    min_count: int = 10,
) -> dict[str, Any]:
    """Return countywide hex-like bins aggregated by relative assessment change."""
    if not has_parcel_centroids(conn):
        return {"type": "FeatureCollection", "features": [], "meta": {"returned": 0}}

    bounds = parcel_bounds(conn)
    county_avg = _county_avg_value_change_pct(conn)
    size = max(0.0025, min(0.03, float(hex_size_deg)))
    min_samples = max(1, min(500, int(min_count)))

    rows = conn.execute(
        """
        SELECT lon, lat, value_change_pct
        FROM parcels
        WHERE lon IS NOT NULL
          AND lat IS NOT NULL
          AND value_change_pct IS NOT NULL
        """
    ).fetchall()

    sqrt3 = math.sqrt(3.0)
    horiz = sqrt3 * size
    vert = 1.5 * size

    bins: dict[tuple[int, int], dict[str, float]] = {}
    for row in rows:
        lon = float(row["lon"])
        lat = float(row["lat"])
        pct = float(row["value_change_pct"])

        r = int(math.floor((lat - bounds["south"]) / vert))
        x_offset = 0.0 if (r % 2 == 0) else (horiz / 2.0)
        q = int(math.floor((lon - bounds["west"] - x_offset) / horiz))
        key = (q, r)

        bucket = bins.setdefault(key, {"sum_rel": 0.0, "count": 0.0})
        bucket["sum_rel"] += pct - county_avg
        bucket["count"] += 1.0

    features: list[dict[str, Any]] = []
    for (q, r), bucket in bins.items():
        count = int(bucket["count"])
        if count < min_samples:
            continue

        x_offset = 0.0 if (r % 2 == 0) else (horiz / 2.0)
        center_lon = bounds["west"] + x_offset + (q + 0.5) * horiz
        center_lat = bounds["south"] + r * vert + size
        rel_change = bucket["sum_rel"] / bucket["count"]

        ring: list[list[float]] = []
        for i in range(6):
            angle = math.pi / 3.0 * i
            ring.append([
                center_lon + size * math.cos(angle),
                center_lat + size * math.sin(angle),
            ])
        ring.append(ring[0])

        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [ring]},
                "properties": {
                    "count": count,
                    "rel_change_pp": round(rel_change, 3),
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "returned": len(features),
            "hex_size_deg": size,
            "min_count": min_samples,
            "county_avg_value_change_pct": county_avg,
        },
    }


def map_parcel_feature(conn: sqlite3.Connection, parcel_id: str) -> dict[str, Any] | None:
    if not has_parcel_centroids(conn):
        return None
    row = conn.execute(
        """
        SELECT parcel_id, lon, lat, value_change_pct, address_display, municipality
        FROM parcels
        WHERE parcel_id = ?
        """,
        (parcel_id,),
    ).fetchone()
    if not row or row["lon"] is None or row["lat"] is None:
        return None
    pct = row["value_change_pct"]
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [float(row["lon"]), float(row["lat"])],
        },
        "properties": {
            "parcel_id": row["parcel_id"],
            "value_change_pct": float(pct) if pct is not None else None,
            "address_display": row["address_display"],
            "municipality": row["municipality"],
        },
    }
