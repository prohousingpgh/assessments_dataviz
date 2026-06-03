from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from api.commercial_scenarios import (
    ESTIMATED_COMMERCIAL_GROWTH,
    SCENARIO_GROWTH_RATES,
    SCENARIO_LABELS,
    SCENARIO_SHORT_LABELS,
)
from api.db import get_summary_stats
from api.homestead import (
    DEFAULT_HOMESTEAD_EXCLUSION,
    TaxingBody,
    homestead_exclusion_amount,
)
from api.tax_aggregates import (
    build_revenue_neutral_bases,
    get_revenue_neutral_factor,
    load_tax_aggregates,
)

ROOT = Path(__file__).resolve().parents[1]
MILLAGE_PATH = ROOT / "data" / "millage_2026.json"
PITTSBURGH_MUNICIPALITY_KEY = "City of Pittsburgh"
DEFAULT_PITTSBURGH_ADDITIONAL_MILLS = (
    {"id": "parks", "label": "Pittsburgh Parks Tax", "mills": 0.5},
    {"id": "library", "label": "Pittsburgh Library Tax", "mills": 0.25},
)

_config: dict[str, Any] | None = None
_db_connection: Any = None


def set_tax_db_connection(conn: Any) -> None:
    """Called from FastAPI lifespan so aggregates can load from SQLite."""
    global _db_connection
    _db_connection = conn


def load_millage_config() -> dict[str, Any]:
    global _config
    if _config is None:
        _config = json.loads(MILLAGE_PATH.read_text(encoding="utf-8"))
    return _config


def _lookup_mills(name: str | None, mills: dict[str, float], aliases: dict[str, str]) -> tuple[float | None, str | None]:
    if not name:
        return None, None
    key = aliases.get(name.strip(), name.strip())
    if key in mills:
        return mills[key], key
    norm = name.strip().lower()
    for k, v in mills.items():
        if k.lower() == norm:
            return v, k
    return None, None


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _mill_tax(taxable: float, mills: float | None) -> float:
    if taxable <= 0 or mills is None:
        return 0.0
    return taxable * mills / 1000.0


def _homestead_taxable(assessed: float, homestead_flag: str | None, exclusion: float) -> float:
    if assessed <= 0:
        return 0.0
    if (homestead_flag or "").strip().upper() == "HOM":
        return max(0.0, assessed - exclusion)
    return assessed


def _scale_assessed(base: float, new_fmv: float, current_fmv: float) -> float:
    if base <= 0:
        return new_fmv if new_fmv > 0 else 0.0
    if current_fmv <= 0:
        return base
    return base * (new_fmv / current_fmv)


def _effective_future_mills(
    nominal_mills: float | None,
    factor: float,
) -> float | None:
    if nominal_mills is None:
        return None
    return nominal_mills * factor


def _is_city_of_pittsburgh(municipality: str | None, muni_key: str | None) -> bool:
    if muni_key == PITTSBURGH_MUNICIPALITY_KEY:
        return True
    if not municipality:
        return False
    norm = municipality.strip().lower()
    return norm in {"city of pittsburgh", "pittsburgh"}


def _pittsburgh_additional_entries(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    configured = cfg.get("municipality_additional_mills", {}).get(PITTSBURGH_MUNICIPALITY_KEY)
    if isinstance(configured, list) and configured:
        return configured
    return list(DEFAULT_PITTSBURGH_ADDITIONAL_MILLS)


def _additional_tax_lines(
    entries: list[dict[str, Any]],
    taxable_current: float,
    taxable_future: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], float, float]:
    current_lines: list[dict[str, Any]] = []
    future_lines: list[dict[str, Any]] = []
    current_total = 0.0
    future_total = 0.0
    for entry in entries:
        label = str(entry.get("label", "Additional tax"))
        mills = float(entry["mills"])
        mills_label = entry.get("id") or label
        cur_amount = _mill_tax(taxable_current, mills)
        fut_amount = _mill_tax(taxable_future, mills)
        current_lines.append(_line(label, taxable_current, mills, cur_amount, mills_label))
        future_lines.append(_line(label, taxable_future, mills, fut_amount, mills_label))
        current_total += cur_amount
        future_total += fut_amount
    return current_lines, future_lines, current_total, future_total


def _line(
    label: str,
    taxable: float,
    mills: float | None,
    amount: float,
    mills_label: str | None = None,
    *,
    nominal_mills: float | None = None,
    revenue_neutral_factor: float | None = None,
    scenario: str | None = None,
) -> dict[str, Any]:
    line: dict[str, Any] = {
        "label": label,
        "taxable_value": round(taxable, 2),
        "mills": round(mills, 4) if mills is not None else None,
        "mills_label": mills_label,
        "annual_tax": round(amount, 2),
    }
    if nominal_mills is not None and revenue_neutral_factor is not None and revenue_neutral_factor != 1.0:
        line["mills_nominal"] = round(nominal_mills, 4)
        line["revenue_neutral_factor"] = round(revenue_neutral_factor, 6)
    if scenario:
        line["scenario"] = scenario
    return line


def _compute_future_breakdown(
    *,
    scenario: str,
    aggregates: dict[str, Any],
    county_taxable_fut: float,
    local_taxable_fut_muni: float,
    local_taxable_fut_school: float,
    county_mills: float,
    muni_mills: float | None,
    school_mills: float | None,
    municipality_label: str,
    school_label: str,
    muni_key: str | None,
    school_key: str | None,
    municipality: str | None,
    school_district: str | None,
    additional_future_entries: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    county_factor, _ = get_revenue_neutral_factor(
        aggregates, "county", "Allegheny County", scenario=scenario
    )
    muni_factor, _ = get_revenue_neutral_factor(
        aggregates, "municipality", municipality, scenario=scenario
    )
    school_factor, _ = get_revenue_neutral_factor(
        aggregates, "school_district", school_district, scenario=scenario
    )

    county_mills_future = _effective_future_mills(county_mills, county_factor)
    muni_mills_future = _effective_future_mills(muni_mills, muni_factor)
    school_mills_future = _effective_future_mills(school_mills, school_factor)

    county_fut = _mill_tax(county_taxable_fut, county_mills_future)
    muni_fut = _mill_tax(local_taxable_fut_muni, muni_mills_future)
    school_fut = _mill_tax(local_taxable_fut_school, school_mills_future)
    additional_future: list[dict[str, Any]] = []
    additional_future_total = 0.0
    for entry in additional_future_entries or []:
        nominal_mills = float(entry["mills"])
        mills_future = _effective_future_mills(nominal_mills, muni_factor)
        label = str(entry.get("label", "Additional tax"))
        mills_label = entry.get("id") or label
        amount = _mill_tax(local_taxable_fut_muni, mills_future)
        additional_future.append(
            _line(
                label,
                local_taxable_fut_muni,
                mills_future,
                amount,
                mills_label,
                nominal_mills=nominal_mills,
                revenue_neutral_factor=muni_factor,
                scenario=scenario,
            )
        )
        additional_future_total += amount
    total = county_fut + muni_fut + school_fut + additional_future_total

    result = {
        "county": _line(
            "Allegheny County",
            county_taxable_fut,
            county_mills_future,
            county_fut,
            "Allegheny County",
            nominal_mills=county_mills,
            revenue_neutral_factor=county_factor,
            scenario=scenario,
        ),
        "municipality": _line(
            municipality_label,
            local_taxable_fut_muni,
            muni_mills_future,
            muni_fut,
            muni_key,
            nominal_mills=muni_mills,
            revenue_neutral_factor=muni_factor,
            scenario=scenario,
        ),
        "school": _line(
            school_label,
            local_taxable_fut_school,
            school_mills_future,
            school_fut,
            school_key,
            nominal_mills=school_mills,
            revenue_neutral_factor=school_factor,
            scenario=scenario,
        ),
        "total": round(total, 2),
        "factors": {
            "county": county_factor,
            "municipality": muni_factor,
            "school_district": school_factor,
        },
    }
    if additional_future:
        result["additional"] = additional_future
    return result


def compute_property_taxes(parcel: dict[str, Any]) -> dict[str, Any]:
    cfg = load_millage_config()
    aggregates = load_tax_aggregates(_db_connection)
    warnings: list[str] = []

    fmv_current = _to_float(parcel.get("current_assessment_total"))
    fmv_future = _to_float(parcel.get("new_assessment_total"))
    county_current = _to_float(parcel.get("county_total")) or fmv_current
    local_current = _to_float(parcel.get("local_total")) or fmv_current

    county_future = _scale_assessed(county_current, fmv_future, fmv_current)
    local_future = _scale_assessed(local_current, fmv_future, fmv_current)

    homestead_flag = parcel.get("homestead_flag")
    exclusion_current = float(cfg.get("homestead_exclusion", DEFAULT_HOMESTEAD_EXCLUSION))
    county_value_ratio: float | None = None
    county_avg_residential_growth: float | None = None
    if _db_connection is not None:
        summary = get_summary_stats(_db_connection)
        if summary.get("county_value_ratio") is not None:
            county_value_ratio = float(summary["county_value_ratio"])
        avg_pct = summary.get("avg_value_change_pct")
        if avg_pct is not None:
            county_avg_residential_growth = float(avg_pct) / 100.0
        elif county_value_ratio is not None:
            county_avg_residential_growth = county_value_ratio - 1.0
    has_homestead = (homestead_flag or "").strip().upper() == "HOM"

    municipality = parcel.get("municipality")
    school_district = parcel.get("school_district")

    muni_mills, muni_key = _lookup_mills(
        municipality,
        cfg["municipality_mills"],
        cfg.get("municipality_aliases", {}),
    )
    school_mills, school_key = _lookup_mills(
        school_district,
        cfg["school_mills"],
        cfg.get("school_aliases", {}),
    )
    county_mills = float(cfg["county_mills"])

    if muni_mills is None:
        warnings.append(f"Municipality millage not found for “{municipality}”.")
    if school_mills is None:
        warnings.append(f"School district millage not found for “{school_district}”.")

    def _exclusion(body: TaxingBody, *, after: bool) -> float:
        return homestead_exclusion_amount(
            body,
            school_district=school_district,
            school_mills_key=school_key,
            municipality_mills_key=muni_key,
            after_reassessment=after,
            county_residential_value_ratio=county_value_ratio,
            default_exclusion=exclusion_current,
        )

    county_excl_cur = _exclusion("county", after=False)
    county_excl_fut = _exclusion("county", after=True) if has_homestead else county_excl_cur
    muni_excl_cur = _exclusion("municipality", after=False)
    muni_excl_fut = _exclusion("municipality", after=True) if has_homestead else muni_excl_cur
    school_excl_cur = _exclusion("school", after=False)
    school_excl_fut = _exclusion("school", after=True) if has_homestead else school_excl_cur

    county_taxable_cur = _homestead_taxable(county_current, homestead_flag, county_excl_cur)
    county_taxable_fut = _homestead_taxable(county_future, homestead_flag, county_excl_fut)
    local_taxable_cur_muni = _homestead_taxable(local_current, homestead_flag, muni_excl_cur)
    local_taxable_fut_muni = _homestead_taxable(local_future, homestead_flag, muni_excl_fut)
    local_taxable_cur_school = _homestead_taxable(local_current, homestead_flag, school_excl_cur)
    local_taxable_fut_school = _homestead_taxable(local_future, homestead_flag, school_excl_fut)

    pittsburgh_additional = (
        _pittsburgh_additional_entries(cfg)
        if _is_city_of_pittsburgh(municipality, muni_key)
        else []
    )
    additional_current, _, additional_cur_total, _ = (
        _additional_tax_lines(
            pittsburgh_additional,
            local_taxable_cur_muni,
            local_taxable_fut_muni,
        )
        if pittsburgh_additional
        else ([], [], 0.0, 0.0)
    )

    county_cur = _mill_tax(county_taxable_cur, county_mills)
    muni_cur = _mill_tax(local_taxable_cur_muni, muni_mills)
    school_cur = _mill_tax(local_taxable_cur_school, school_mills)
    current_total = county_cur + muni_cur + school_cur + additional_cur_total

    if fmv_current > 0 and fmv_future > 0:
        parcel_residential_growth = (fmv_future - fmv_current) / fmv_current
    else:
        parcel_residential_growth = None

    revenue_neutral_bases = build_revenue_neutral_bases(
        aggregates,
        municipality=municipality,
        school_district=school_district,
        db=_db_connection,
    )

    municipality_label = municipality or "Municipality"
    school_label = school_district or "School district"

    scenarios_available = list(aggregates.get("scenarios", {"baseline": {}}).keys())
    if not scenarios_available:
        scenarios_available = ["baseline"]

    future_scenarios: dict[str, Any] = {}
    for scenario in scenarios_available:
        if scenario not in SCENARIO_GROWTH_RATES:
            continue
        future_breakdown = _compute_future_breakdown(
            scenario=scenario,
            aggregates=aggregates,
            county_taxable_fut=county_taxable_fut,
            local_taxable_fut_muni=local_taxable_fut_muni,
            local_taxable_fut_school=local_taxable_fut_school,
            county_mills=county_mills,
            muni_mills=muni_mills,
            school_mills=school_mills,
            municipality_label=municipality_label,
            school_label=school_label,
            muni_key=muni_key,
            school_key=school_key,
            municipality=municipality,
            school_district=school_district,
            additional_future_entries=pittsburgh_additional,
        )
        fut_total = future_breakdown["total"]
        delta = fut_total - current_total
        delta_pct = (delta / current_total * 100) if current_total > 0 else None
        scenario_payload: dict[str, Any] = {
            "id": scenario,
            "label": SCENARIO_LABELS.get(scenario, scenario),
            "short_label": SCENARIO_SHORT_LABELS.get(scenario, scenario),
            "commercial_growth_rate": SCENARIO_GROWTH_RATES.get(scenario),
            "county": future_breakdown["county"],
            "municipality": future_breakdown["municipality"],
            "school": future_breakdown["school"],
            "total": fut_total,
            "delta": {
                "total_dollars": round(delta, 2),
                "total_percent": round(delta_pct, 2) if delta_pct is not None else None,
            },
            "jurisdiction_factors": future_breakdown["factors"],
        }
        if future_breakdown.get("additional"):
            scenario_payload["additional"] = future_breakdown["additional"]
        future_scenarios[scenario] = scenario_payload

    default_scenario = aggregates.get("default_scenario", "baseline")
    if default_scenario not in future_scenarios:
        default_scenario = next(iter(future_scenarios), "baseline")
    baseline = future_scenarios[default_scenario]

    notes = [
        f"Estimated annual liability using {cfg.get('tax_year', 2026)} nominal millage; not actual payments.",
        "After reassessment, millage is adjusted within each jurisdiction so total tax revenue stays the same (revenue-neutral reassessment), including existing commercial assessed values.",
        "Commercial reassessment is not modeled; use the slider on the parcel page to set "
        "aggregate commercial assessment growth (defaults to countywide average residential growth).",
        "Your tax can still change if your home’s assessed value rises or falls more than the jurisdiction average.",
        "County tax uses county assessed value; municipality and school use local assessed value.",
        "Homestead (HOM): per-jurisdiction Act 50 exclusions (see /homestead-exemptions); "
        "after reassessment exclusions scale by countywide residential assessed-value growth (nearest $1,000).",
    ]
    if pittsburgh_additional:
        notes.append(
            "City of Pittsburgh properties include separate Parks (0.5 mills) and Library (0.25 mills) "
            "levies on local taxable value; after reassessment these millages are scaled with the "
            "municipality revenue-neutral factor like city general millage."
        )

    current_breakdown: dict[str, Any] = {
        "county": _line("Allegheny County", county_taxable_cur, county_mills, county_cur, "Allegheny County"),
        "municipality": _line(
            municipality_label, local_taxable_cur_muni, muni_mills, muni_cur, muni_key
        ),
        "school": _line(
            school_label, local_taxable_cur_school, school_mills, school_cur, school_key
        ),
        "total": round(current_total, 2),
    }
    if additional_current:
        current_breakdown["additional"] = additional_current

    future_breakdown_default: dict[str, Any] = {
        "county": baseline["county"],
        "municipality": baseline["municipality"],
        "school": baseline["school"],
        "total": baseline["total"],
    }
    if baseline.get("additional"):
        future_breakdown_default["additional"] = baseline["additional"]

    return {
        "tax_year": cfg.get("tax_year"),
        "revenue_neutral_reassessment": True,
        "homestead_applied": has_homestead,
        "homestead_exclusion": exclusion_current if has_homestead else 0,
        "homestead_exclusion_future": _exclusion("county", after=True) if has_homestead else 0,
        "homestead_exclusion_school": school_excl_cur if has_homestead else 0,
        "homestead_exclusion_school_future": school_excl_fut if has_homestead else 0,
        "homestead_exclusion_municipality": muni_excl_cur if has_homestead else 0,
        "homestead_exclusion_municipality_future": muni_excl_fut if has_homestead else 0,
        "homestead_exclusions": {
            "county": {"current": county_excl_cur, "future": county_excl_fut},
            "municipality": {"current": muni_excl_cur, "future": muni_excl_fut},
            "school": {"current": school_excl_cur, "future": school_excl_fut},
        },
        "county_residential_value_ratio": county_value_ratio,
        "parcel_residential_growth_rate": parcel_residential_growth,
        "county_avg_residential_growth_rate": county_avg_residential_growth,
        "revenue_neutral_bases": revenue_neutral_bases,
        "default_scenario": default_scenario,
        "current": current_breakdown,
        "future": future_breakdown_default,
        "delta": baseline["delta"],
        "future_scenarios": future_scenarios,
        "jurisdiction_factors": baseline.get("jurisdiction_factors", {}),
        "warnings": warnings,
        "notes": notes,
    }
