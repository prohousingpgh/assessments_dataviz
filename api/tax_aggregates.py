from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from api.commercial_scenarios import COUNTY_JURISDICTION_NAME, ESTIMATED_COMMERCIAL_GROWTH

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


def _jurisdiction_sums_from_db(
    db: sqlite3.Connection,
    scenario: str,
    jurisdiction_type: str,
    jurisdiction_name: str,
) -> tuple[float, float] | None:
    try:
        row = db.execute(
            """
            SELECT current_taxable_sum, future_taxable_sum
            FROM tax_jurisdiction_aggregates
            WHERE scenario = ? AND jurisdiction_type = ? AND jurisdiction_name = ?
            """,
            (scenario, jurisdiction_type, jurisdiction_name),
        ).fetchone()
    except sqlite3.OperationalError:
        return None
    if not row:
        return None
    return float(row[0] or 0), float(row[1] or 0)


def _bases_from_aggregate_sums(
    current_sum: float,
    future_at_zero_growth: float,
    future_at_reference_growth: float,
    *,
    reference_growth: float = ESTIMATED_COMMERCIAL_GROWTH,
) -> dict[str, float]:
    """Split jurisdiction future taxable into residential + commercial for any growth rate."""
    if reference_growth > 0:
        commercial_current = (future_at_reference_growth - future_at_zero_growth) / reference_growth
        residential_future = future_at_zero_growth - commercial_current
    else:
        commercial_current = 0.0
        residential_future = future_at_zero_growth
    return {
        "current_taxable_sum": current_sum,
        "residential_future_taxable": residential_future,
        "commercial_current_taxable": max(0.0, commercial_current),
    }


def _interpolation_factors(
    aggregates: dict[str, Any],
    jurisdiction_type: str,
    jurisdiction_name: str,
) -> dict[str, float] | None:
    factors: dict[str, float] = {}
    for scenario, growth in (
        ("commercial_low", 0.0),
        ("baseline", ESTIMATED_COMMERCIAL_GROWTH),
        ("commercial_high", ESTIMATED_COMMERCIAL_GROWTH + 0.20),
    ):
        factor, meta = get_revenue_neutral_factor(
            aggregates,
            jurisdiction_type,
            jurisdiction_name,
            scenario=scenario,
        )
        if meta.get("found"):
            factors[str(growth)] = factor
    if len(factors) < 2:
        return None
    return factors


def build_revenue_neutral_bases(
    aggregates: dict[str, Any],
    *,
    municipality: str | None,
    school_district: str | None,
    db: sqlite3.Connection | None = None,
) -> dict[str, Any]:
    """
    Per-taxing-body inputs for revenue-neutral millage at any commercial growth rate.

    Prefer exact taxable sums from tax_jurisdiction_aggregates; otherwise expose
    reference factors at 0% / +20% / +40% for client interpolation.
    """
    bodies: list[tuple[str, str, str]] = [
        ("county", "county", COUNTY_JURISDICTION_NAME),
        ("municipality", "municipality", (municipality or "").strip()),
        ("school", "school_district", (school_district or "").strip()),
    ]
    out: dict[str, Any] = {
        "reference_commercial_growth": ESTIMATED_COMMERCIAL_GROWTH,
    }
    for key, jtype, jname in bodies:
        if not jname:
            continue
        entry: dict[str, Any] = {"jurisdiction_type": jtype, "jurisdiction_name": jname}
        if db is not None:
            low = _jurisdiction_sums_from_db(db, "commercial_low", jtype, jname)
            base = _jurisdiction_sums_from_db(db, "baseline", jtype, jname)
            if low and base:
                cur = low[0] if low[0] > 0 else base[0]
                entry.update(
                    _bases_from_aggregate_sums(cur, low[1], base[1]),
                )
                entry["method"] = "sums"
                out[key] = entry
                continue
        interp = _interpolation_factors(aggregates, jtype, jname)
        if interp:
            entry["method"] = "interpolation"
            entry["factors_by_growth"] = interp
            out[key] = entry
    return out
