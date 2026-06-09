from __future__ import annotations

import math
import sqlite3
from pathlib import Path
from typing import Any

from api.db import get_summary_stats

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

# Binned valuation ratio scale (1.0 = county median new/old assessment ratio).
VALUATION_RATIO_BINS: list[dict[str, Any]] = [
    {"color": "#4575b4", "label": "< 0.7"},
    {"color": "#91bfdb", "label": "0.7 – 0.8", "ratio": 0.7},
    {"color": "#abd9e9", "label": "0.8 – 0.9", "ratio": 0.8},
    {"color": "#d9ef8b", "label": "0.9 – 1.0", "ratio": 0.9},
    {"color": "#ffffbf", "label": "1.0 – 1.1", "ratio": 1.0},
    {"color": "#fee090", "label": "1.1 – 1.2", "ratio": 1.1},
    {"color": "#fdae61", "label": "1.2 – 1.3", "ratio": 1.2},
    {"color": "#f46d43", "label": "1.3 – 1.5", "ratio": 1.3},
    {"color": "#d73027", "label": "> 1.5", "ratio": 1.5},
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
    county_map_center_pct = _county_map_center_value_change_pct(conn)
    return {
        "mode": mode,
        "bounds": bounds,
        "center": [
            (bounds["west"] + bounds["east"]) / 2,
            (bounds["south"] + bounds["north"]) / 2,
        ],
        "value_change_color_stops": RELATIVE_CHANGE_COLOR_STOPS,
        "county_avg_value_change_pct": county_map_center_pct,
        "county_base_growth_pct": county_map_center_pct,
        "pmtiles_url": "/api/map/tiles/parcels.pmtiles" if has_pmtiles else None,
        "source_layer": "parcels",
        "parcel_count": _parcel_count(conn),
    }


def _parcel_count(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COUNT(*) AS n FROM parcels").fetchone()
    return int(row["n"]) if row else 0


def _has_column(conn: sqlite3.Connection, column: str) -> bool:
    return column in _table_columns(conn, "parcels")


def _county_median_assessment_ratio(conn: sqlite3.Connection) -> float:
    rows = conn.execute(
        """
        SELECT new_assessment_total * 1.0 / current_assessment_total AS assessment_ratio
        FROM parcels
        WHERE current_assessment_total > 0 AND new_assessment_total > 0
        """
    ).fetchall()
    ratios = sorted(float(r["assessment_ratio"]) for r in rows)
    n = len(ratios)
    if n == 0:
        return 1.0
    mid = n // 2
    if n % 2 == 1:
        return ratios[mid]
    return (ratios[mid - 1] + ratios[mid]) / 2.0


def _parcel_valuation_ratio_value(conn: sqlite3.Connection, median_ratio: float) -> str:
    if _has_column(conn, "valuation_ratio"):
        return "valuation_ratio"
    median = max(median_ratio, 1e-9)
    return f"(new_assessment_total * 1.0 / current_assessment_total) / {median}"


def map_valuation_config(conn: sqlite3.Connection) -> dict[str, Any]:
    bounds = parcel_bounds(conn)
    has_centroids = has_parcel_centroids(conn)
    has_pmtiles = PMTILES_PATH.is_file()
    mode = "pmtiles" if has_pmtiles else ("points" if has_centroids else "unavailable")
    median_ratio = _county_median_assessment_ratio(conn)
    return {
        "mode": mode,
        "bounds": bounds,
        "center": [
            (bounds["west"] + bounds["east"]) / 2,
            (bounds["south"] + bounds["north"]) / 2,
        ],
        "valuation_ratio_bins": VALUATION_RATIO_BINS,
        "county_median_assessment_ratio": median_ratio,
        "pmtiles_url": "/api/map/tiles/parcels.pmtiles" if has_pmtiles else None,
        "source_layer": "parcels",
        "parcel_count": _parcel_count(conn),
    }


def _county_map_center_value_change_pct(conn: sqlite3.Connection) -> float:
    """Map color center: dollar-weighted county base growth (ratio − 1), not mean parcel %."""
    summary = get_summary_stats(conn)
    base = summary.get("county_base_growth_pct")
    if base is not None:
        return float(base)
    avg = summary.get("avg_value_change_pct")
    return float(avg) if avg is not None else 0.0


def _limit_for_zoom(zoom: float) -> int:
    if zoom >= 15:
        return 25_000
    if zoom >= 14:
        return 20_000
    if zoom >= 13:
        return 16_000
    if zoom >= 12:
        return 12_000
    if zoom >= 11:
        return 10_000
    if zoom >= 10:
        return 10_000
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
    cap = _limit_for_zoom(z) if limit is None else max(1, min(limit, 25_000))
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
    county_avg = _county_map_center_value_change_pct(conn)
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


def map_valuation_parcels_geojson(
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

    median_ratio = _county_median_assessment_ratio(conn)
    vr_expr = _parcel_valuation_ratio_value(conn, median_ratio)
    z = 12.0 if zoom is None else float(zoom)
    cap = _limit_for_zoom(z) if limit is None else max(1, min(limit, 25_000))
    rows = conn.execute(
        f"""
        SELECT parcel_id, lon, lat, {vr_expr} AS valuation_ratio,
               address_display, municipality,
               current_assessment_total, new_assessment_total
        FROM parcels
        WHERE lon IS NOT NULL
          AND lat IS NOT NULL
          AND lon BETWEEN ? AND ?
          AND lat BETWEEN ? AND ?
          AND current_assessment_total > 0
          AND new_assessment_total > 0
        ORDER BY random()
        LIMIT ?
        """,
        (west, east, south, north, cap),
    ).fetchall()

    features: list[dict[str, Any]] = []
    for row in rows:
        vr = row["valuation_ratio"]
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(row["lon"]), float(row["lat"])],
                },
                "properties": {
                    "parcel_id": row["parcel_id"],
                    "valuation_ratio": float(vr) if vr is not None else None,
                    "address_display": row["address_display"],
                    "municipality": row["municipality"],
                    "current_assessment_total": float(row["current_assessment_total"]),
                    "new_assessment_total": float(row["new_assessment_total"]),
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
            "county_median_assessment_ratio": median_ratio,
        },
    }


def map_valuation_hexbins_geojson(
    conn: sqlite3.Connection,
    *,
    hex_size_deg: float = 0.006,
    min_count: int = 10,
) -> dict[str, Any]:
    if not has_parcel_centroids(conn):
        return {"type": "FeatureCollection", "features": [], "meta": {"returned": 0}}

    bounds = parcel_bounds(conn)
    median_ratio = _county_median_assessment_ratio(conn)
    vr_expr = _parcel_valuation_ratio_value(conn, median_ratio)
    size = max(0.0025, min(0.03, float(hex_size_deg)))
    min_samples = max(1, min(500, int(min_count)))

    rows = conn.execute(
        f"""
        SELECT lon, lat, {vr_expr} AS valuation_ratio
        FROM parcels
        WHERE lon IS NOT NULL
          AND lat IS NOT NULL
          AND current_assessment_total > 0
          AND new_assessment_total > 0
        """
    ).fetchall()

    sqrt3 = math.sqrt(3.0)
    horiz = sqrt3 * size
    vert = 1.5 * size

    bins: dict[tuple[int, int], dict[str, float]] = {}
    for row in rows:
        lon = float(row["lon"])
        lat = float(row["lat"])
        vr = float(row["valuation_ratio"])

        r = int(math.floor((lat - bounds["south"]) / vert))
        x_offset = 0.0 if (r % 2 == 0) else (horiz / 2.0)
        q = int(math.floor((lon - bounds["west"] - x_offset) / horiz))
        key = (q, r)

        bucket = bins.setdefault(key, {"sum_vr": 0.0, "count": 0.0})
        bucket["sum_vr"] += vr
        bucket["count"] += 1.0

    features: list[dict[str, Any]] = []
    for (q, r), bucket in bins.items():
        count = int(bucket["count"])
        if count < min_samples:
            continue

        x_offset = 0.0 if (r % 2 == 0) else (horiz / 2.0)
        center_lon = bounds["west"] + x_offset + (q + 0.5) * horiz
        center_lat = bounds["south"] + r * vert + size
        avg_vr = bucket["sum_vr"] / bucket["count"]

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
                    "avg_valuation_ratio": round(avg_vr, 4),
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
            "county_median_assessment_ratio": median_ratio,
        },
    }


def map_valuation_parcel_feature(conn: sqlite3.Connection, parcel_id: str) -> dict[str, Any] | None:
    if not has_parcel_centroids(conn):
        return None
    median_ratio = _county_median_assessment_ratio(conn)
    vr_expr = _parcel_valuation_ratio_value(conn, median_ratio)
    row = conn.execute(
        f"""
        SELECT parcel_id, lon, lat, {vr_expr} AS valuation_ratio,
               address_display, municipality,
               current_assessment_total, new_assessment_total
        FROM parcels
        WHERE parcel_id = ?
        """,
        (parcel_id,),
    ).fetchone()
    if not row or row["lon"] is None or row["lat"] is None:
        return None
    vr = row["valuation_ratio"]
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [float(row["lon"]), float(row["lat"])],
        },
        "properties": {
            "parcel_id": row["parcel_id"],
            "valuation_ratio": float(vr) if vr is not None else None,
            "address_display": row["address_display"],
            "municipality": row["municipality"],
            "current_assessment_total": float(row["current_assessment_total"]),
            "new_assessment_total": float(row["new_assessment_total"]),
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
