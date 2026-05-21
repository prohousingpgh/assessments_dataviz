from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
AGGREGATES_PATH = ROOT / "data" / "tax_aggregates.json"

_aggregates: dict[str, dict[str, float]] | None = None


def _load_from_json() -> dict[str, dict[str, float]]:
    if not AGGREGATES_PATH.exists():
        return {"county": {}, "municipality": {}, "school_district": {}}
    raw = json.loads(AGGREGATES_PATH.read_text(encoding="utf-8"))
    return {
        "county": raw.get("county", {}),
        "municipality": raw.get("municipality", {}),
        "school_district": raw.get("school_district", {}),
    }


def load_tax_aggregates(db: sqlite3.Connection | None = None) -> dict[str, dict[str, float]]:
    """Return revenue-neutral factors (current_sum / future_sum) by jurisdiction."""
    global _aggregates
    if _aggregates is not None:
        return _aggregates

    if db is not None:
        try:
            rows = db.execute(
                """
                SELECT jurisdiction_type, jurisdiction_name, revenue_neutral_factor
                FROM tax_jurisdiction_aggregates
                """
            ).fetchall()
            if rows:
                result: dict[str, dict[str, float]] = {
                    "county": {},
                    "municipality": {},
                    "school_district": {},
                }
                for jtype, jname, factor in rows:
                    result[jtype][jname] = float(factor)
                _aggregates = result
                return _aggregates
        except sqlite3.OperationalError:
            pass

    _aggregates = _load_from_json()
    return _aggregates


def get_revenue_neutral_factor(
    aggregates: dict[str, dict[str, float]],
    jurisdiction_type: str,
    jurisdiction_name: str | None,
) -> tuple[float, dict[str, Any]]:
    """
    Factor applied to nominal millage after reassessment so jurisdiction-wide tax revenue is unchanged.
    effective_mills = nominal_mills * factor
    """
    if not jurisdiction_name:
        return 1.0, {"found": False}
    factors = aggregates.get(jurisdiction_type, {})
    factor = factors.get(jurisdiction_name)
    if factor is None or factor <= 0:
        return 1.0, {"found": False, "jurisdiction": jurisdiction_name}
    return factor, {
        "found": True,
        "jurisdiction": jurisdiction_name,
        "factor": round(factor, 6),
    }


def clear_aggregate_cache() -> None:
    global _aggregates
    _aggregates = None
