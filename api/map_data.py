from __future__ import annotations

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

# Choropleth breaks for value_change_pct (percent).
VALUE_CHANGE_COLOR_STOPS: list[dict[str, Any]] = [
    {"pct": -50, "color": "#2166ac"},
    {"pct": 0, "color": "#67a9cf"},
    {"pct": 50, "color": "#d1e5f0"},
    {"pct": 100, "color": "#fddbc7"},
    {"pct": 150, "color": "#ef8a62"},
    {"pct": 200, "color": "#b2182b"},
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
    return {
        "mode": mode,
        "bounds": bounds,
        "center": [
            (bounds["west"] + bounds["east"]) / 2,
            (bounds["south"] + bounds["north"]) / 2,
        ],
        "value_change_color_stops": VALUE_CHANGE_COLOR_STOPS,
        "pmtiles_url": "/api/map/tiles/parcels.pmtiles" if has_pmtiles else None,
        "source_layer": "parcels",
        "parcel_count": _parcel_count(conn),
    }


def _parcel_count(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COUNT(*) AS n FROM parcels").fetchone()
    return int(row["n"]) if row else 0


def map_parcels_geojson(
    conn: sqlite3.Connection,
    *,
    west: float,
    south: float,
    east: float,
    north: float,
    limit: int = 6000,
) -> dict[str, Any]:
    if not has_parcel_centroids(conn):
        return {"type": "FeatureCollection", "features": []}

    if west >  east or south > north:
        return {"type": "FeatureCollection", "features": []}

    limit = max(1, min(limit, 12_000))
    rows = conn.execute(
        """
        SELECT parcel_id, lon, lat, value_change_pct, address_display, municipality
        FROM parcels
        WHERE lon IS NOT NULL
          AND lat IS NOT NULL
          AND lon BETWEEN ? AND ?
          AND lat BETWEEN ? AND ?
        LIMIT ?
        """,
        (west, east, south, north, limit),
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
    return {"type": "FeatureCollection", "features": features}


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
