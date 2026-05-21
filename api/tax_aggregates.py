from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
AGGREGATES_PATH = ROOT / "data" / "tax_aggregates.json"

_aggregates: dict[str, Any] | None = None


def _empty_factors() -> dict[str, dict[str, float]]:
    return {"county": {}, "municipality": {}, "school_district": {}}


def _load_from_json() -> dict[str, Any]:
    if not AGGREGATES_PATH.exists():
        return {"default_scenario": "baseline", "scenarios": {"baseline": _empty_factors()}}
    raw = json.loads(AGGREGATES_PATH.read_text(encoding="utf-8"))
    if "scenarios" in raw:
        return raw
    # Legacy flat format
    legacy = {
        "county": raw.get("county", {}),
        "municipality": raw.get("municipality", {}),
        "school_district": raw.get("school_district", {}),
    }
    return {"default_scenario": "baseline", "scenarios": {"baseline": legacy}, **legacy}


def load_tax_aggregates(db: sqlite3.Connection | None = None) -> dict[str, Any]:
    """Return revenue-neutral factors by scenario and jurisdiction."""
    global _aggregates
    if _aggregates is not None:
        return _aggregates

    if db is not None:
        try:
            rows = db.execute(
                """
                SELECT scenario, jurisdiction_type, jurisdiction_name, revenue_neutral_factor
                FROM tax_jurisdiction_aggregates
                """
            ).fetchall()
            if rows:
                scenarios: dict[str, dict[str, dict[str, float]]] = {}
                for scenario, jtype, jname, factor in rows:
                    scen = scenario or "baseline"
                    scenarios.setdefault(scen, _empty_factors())
                    scenarios[scen][jtype][jname] = float(factor)
                default = "baseline" if "baseline" in scenarios else next(iter(scenarios))
                _aggregates = {
                    "default_scenario": default,
                    "scenarios": scenarios,
                    **scenarios.get(default, _empty_factors()),
                }
                return _aggregates
        except sqlite3.OperationalError:
            pass

    _aggregates = _load_from_json()
    return _aggregates


def get_scenario_factors(
    aggregates: dict[str, Any], scenario: str = "baseline"
) -> dict[str, dict[str, float]]:
    scenarios = aggregates.get("scenarios", {})
    if scenario in scenarios:
        return scenarios[scenario]
    return {
        "county": aggregates.get("county", {}),
        "municipality": aggregates.get("municipality", {}),
        "school_district": aggregates.get("school_district", {}),
    }


def get_revenue_neutral_factor(
    aggregates: dict[str, Any],
    jurisdiction_type: str,
    jurisdiction_name: str | None,
    *,
    scenario: str = "baseline",
) -> tuple[float, dict[str, Any]]:
    """
    Factor for one taxing body (county, municipality, or school district).

    Built from aggregate pre- and post-reassessment taxable value in that body only:
      factor = sum(current_taxable) / sum(future_taxable)
    Parcel taxes use effective_mills = nominal_mills * factor for that body's rate,
    so total receipts for the body stay equal before and after reassessment.
    """
    if not jurisdiction_name:
        return 1.0, {"found": False, "scenario": scenario}
    factors = get_scenario_factors(aggregates, scenario).get(jurisdiction_type, {})
    factor = factors.get(jurisdiction_name)
    if factor is None or factor <= 0:
        return 1.0, {"found": False, "jurisdiction": jurisdiction_name, "scenario": scenario}
    return factor, {
        "found": True,
        "jurisdiction": jurisdiction_name,
        "factor": round(factor, 6),
        "scenario": scenario,
    }


def clear_aggregate_cache() -> None:
    global _aggregates
    _aggregates = None
