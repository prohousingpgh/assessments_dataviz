from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "parcels.db"
MANIFEST_PATH = ROOT / "data" / "manifest.json"


def get_connection() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise FileNotFoundError(
            f"Database not found at {DB_PATH}. Run: python scripts/build_db.py --predictions <csv> --assessments <csv>"
        )
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Read-heavy production tuning for faster cold queries on Fly.io.
    conn.execute("PRAGMA query_only = ON")
    conn.execute("PRAGMA mmap_size = 268435456")
    conn.execute("PRAGMA cache_size = -131072")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA synchronous = OFF")
    return conn


def fts_query_terms(q: str, *, operator: str = "AND") -> str:
    tokens = re.findall(r"[a-z0-9]+", q.lower())
    if not tokens:
        return ""
    parts = [f'"{t}"*' for t in tokens[:8]]
    joiner = f" {operator} "
    return joiner.join(parts)


def _run_fts_search(
    conn: sqlite3.Connection, fts_q: str, limit: int
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT p.parcel_id, p.address_display, p.municipality, p.school_district,
               p.use_description, p.current_assessment_total, p.new_assessment_total,
               p.value_change_pct,
               CASE
                 WHEN p.building_area_sqft > 0
                  AND p.new_assessment_total > 0
                  AND ABS(p.new_assessment_total - COALESCE(p.new_assessment_land, 0)) < 1
                 THEN 1
                 ELSE 0
               END AS has_assessment_quality_warning
        FROM parcels_fts fts
        JOIN parcels p ON p.parcel_id = fts.parcel_id
        WHERE parcels_fts MATCH ?
        ORDER BY rank
        LIMIT ?
        """,
        (fts_q, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def search_parcels(conn: sqlite3.Connection, q: str, limit: int = 12) -> list[dict[str, Any]]:
    fts_q = fts_query_terms(q, operator="AND")
    if not fts_q:
        return []
    results = _run_fts_search(conn, fts_q, limit)
    tokens = re.findall(r"[a-z0-9]+", q.lower())
    if not results and len(tokens) > 1:
        # e.g. "shawnee millvale" — street in address, city in municipality
        results = _run_fts_search(conn, fts_query_terms(q, operator="OR"), limit)
    return results


def get_parcel(conn: sqlite3.Connection, parcel_id: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM parcels WHERE parcel_id = ?", (parcel_id,)).fetchone()
    return dict(row) if row else None


def get_summary_stats(conn: sqlite3.Connection) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT
          COUNT(*) AS parcel_count,
          AVG(value_change_pct) AS avg_value_change_pct,
          SUM(current_assessment_total) AS current_total,
          SUM(new_assessment_total) AS new_total
        FROM parcels
        WHERE current_assessment_total > 0 AND new_assessment_total > 0
        """
    ).fetchone()
    if row is None:
        return {
            "parcel_count": 0,
            "avg_value_change_pct": None,
            "current_total": None,
            "new_total": None,
        }
    d = dict(row)
    if d.get("current_total"):
        ratio = d["new_total"] / d["current_total"]
        d["county_value_ratio"] = ratio
        # Dollar-weighted countywide growth — primary benchmark for UI, maps, and tax slider.
        d["county_base_growth_pct"] = (ratio - 1) * 100
    return d


def load_manifest() -> dict[str, Any]:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {
        "disclaimer": "Illustrative estimates only. Not official county reassessment or tax bills.",
        "methodology_url": "https://github.com/prohousingpgh/agc_assessments",
    }
