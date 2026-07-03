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


def _split_rate_entry(
    cfg: dict[str, Any], *, body: str, key: str | None
) -> dict[str, float] | None:
    if not key:
        return None
    table = cfg.get("split_rate_local_taxes", {}).get(body, {})
    entry = table.get(key)
    if not isinstance(entry, dict):
        return None
    land = entry.get("land_mills")
    building = entry.get("building_mills")
    if land is None or building is None:
        return None
    return {"land_mills": float(land), "building_mills": float(building)}


def _assessment_land_building(
    parcel: dict[str, Any], *, future: bool
) -> tuple[float, float, float]:
    """Return (assessment_total, land, building) from modeled/county totals."""
    if future:
        total = _to_float(parcel.get("new_assessment_total"))
        land = _to_float(parcel.get("new_assessment_land"))
    else:
        total = _to_float(parcel.get("current_assessment_total"))
        land = _to_float(parcel.get("current_assessment_land"))
    if total <= 0:
        return 0.0, 0.0, 0.0
    if land <= 0:
        return total, 0.0, total
    land = min(land, total)
    return total, land, max(0.0, total - land)


def _apportion_local_land_building(
    local_total: float,
    assessment_total: float,
    land_assessed: float,
    building_assessed: float,
) -> tuple[float, float]:
    if local_total <= 0 or assessment_total <= 0:
        return 0.0, 0.0
    if land_assessed <= 0:
        return 0.0, local_total
    land_local = local_total * (land_assessed / assessment_total)
    return land_local, max(0.0, local_total - land_local)


def _homestead_land_first_taxable(
    land: float, building: float, homestead_flag: str | None, exclusion: float
) -> tuple[float, float]:
    if (homestead_flag or "").strip().upper() != "HOM" or exclusion <= 0:
        return land, building
    applied_to_land = min(exclusion, land)
    land_taxable = max(0.0, land - applied_to_land)
    remaining = max(0.0, exclusion - applied_to_land)
    building_taxable = max(0.0, building - remaining)
    return land_taxable, building_taxable


def _split_rate_tax_amount(
    land_taxable: float,
    building_taxable: float,
    split: dict[str, float],
    *,
    factor: float = 1.0,
) -> float:
    land_mills = split["land_mills"] * factor
    building_mills = split["building_mills"] * factor
    return _mill_tax(land_taxable, land_mills) + _mill_tax(building_taxable, building_mills)


def _blended_mills(amount: float, taxable: float) -> float | None:
    if taxable <= 0:
        return None
    return amount * 1000.0 / taxable


def _split_mills_label(split: dict[str, float]) -> str:
    return f"Land {split['land_mills']:g} / Building {split['building_mills']:g} mills"


def _split_mills_for_api(split: dict[str, float]) -> dict[str, float]:
    """Normalize config keys (land_mills) to API/frontend keys (land, building)."""
    land = split.get("land_mills", split.get("land"))
    building = split.get("building_mills", split.get("building"))
    if land is None or building is None:
        raise ValueError(f"Invalid split millage entry: {split!r}")
    return {"land": float(land), "building": float(building)}


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


# Parcel page commercial-growth slider range (must match web/src/commercialGrowth.ts).
COMMERCIAL_GROWTH_MIN = 0.2
COMMERCIAL_GROWTH_MAX = 2.2


def _nominal_mills(line: dict[str, Any]) -> float | None:
    nominal = line.get("mills_nominal")
    if nominal is not None:
        return float(nominal)
    mills = line.get("mills")
    return float(mills) if mills is not None else None


def _interpolate_revenue_neutral_factor(
    factors_by_growth: dict[str, float], growth: float
) -> float:
    cleaned: list[tuple[float, float]] = []
    for k, v in factors_by_growth.items():
        try:
            cleaned.append((float(k), float(v)))
        except (TypeError, ValueError):
            continue
    cleaned.sort(key=lambda p: p[0])
    if not cleaned:
        return 1.0
    if growth <= cleaned[0][0]:
        return cleaned[0][1]
    if growth >= cleaned[-1][0]:
        return cleaned[-1][1]
    for a, b in zip(cleaned, cleaned[1:]):
        if a[0] <= growth <= b[0]:
            span = b[0] - a[0]
            if span <= 0:
                return b[1]
            t = (growth - a[0]) / span
            return a[1] + (b[1] - a[1]) * t
    return cleaned[-1][1]


def _revenue_neutral_factor_at_growth(base: dict[str, Any], growth: float) -> float:
    if base.get("method") == "interpolation" and base.get("factors_by_growth"):
        return _interpolate_revenue_neutral_factor(base["factors_by_growth"], growth)
    current_sum = float(base.get("current_taxable_sum") or 0)
    residential_future = float(base.get("residential_future_taxable") or 0)
    commercial_current = float(base.get("commercial_current_taxable") or 0)
    future_sum = residential_future + commercial_current * (1.0 + growth)
    if future_sum <= 0:
        return 1.0
    return current_sum / future_sum


def _future_total_at_commercial_growth(taxes: dict[str, Any], growth: float) -> float:
    """Recalculate post-reassessment total tax at a commercial growth rate."""
    bases = taxes.get("revenue_neutral_bases") or {}
    current = taxes["current"]
    future = taxes["future"]

    county_factor = (
        _revenue_neutral_factor_at_growth(bases["county"], growth) if bases.get("county") else 1.0
    )
    muni_factor = (
        _revenue_neutral_factor_at_growth(bases["municipality"], growth)
        if bases.get("municipality")
        else 1.0
    )
    school_factor = (
        _revenue_neutral_factor_at_growth(bases["school"], growth) if bases.get("school") else 1.0
    )

    county_nominal = _nominal_mills(current["county"])
    muni_nominal = _nominal_mills(current["municipality"])
    school_nominal = _nominal_mills(current["school"])

    total = 0.0
    total += _mill_tax(
        float(future["county"]["taxable_value"]),
        _effective_future_mills(county_nominal, county_factor),
    )
    total += _mill_tax(
        float(future["municipality"]["taxable_value"]),
        _effective_future_mills(muni_nominal, muni_factor),
    )
    total += _mill_tax(
        float(future["school"]["taxable_value"]),
        _effective_future_mills(school_nominal, school_factor),
    )
    local_taxable_future = float(future["municipality"]["taxable_value"])
    for add in current.get("additional") or []:
        add_nominal = _nominal_mills(add)
        total += _mill_tax(
            local_taxable_future,
            _effective_future_mills(add_nominal, muni_factor),
        )
    return round(total, 2)


def map_tax_delta_dollars(taxes: dict[str, Any]) -> float | None:
    """
    Annual tax change ($/yr) for map coloring — matches parcel page defaults:
    commercial growth at countywide average residential growth, homestead from data.
    """
    current_total = taxes.get("current", {}).get("total")
    if current_total is None:
        return None
    growth = taxes.get("county_avg_residential_growth_rate")
    if growth is None:
        ratio = taxes.get("county_residential_value_ratio")
        if ratio is not None and ratio > 0:
            growth = float(ratio) - 1.0
        else:
            from api.commercial_scenarios import ESTIMATED_COMMERCIAL_GROWTH

            growth = ESTIMATED_COMMERCIAL_GROWTH
    growth = max(COMMERCIAL_GROWTH_MIN, min(COMMERCIAL_GROWTH_MAX, float(growth)))
    bases = taxes.get("revenue_neutral_bases") or {}
    if not bases.get("county") and not bases.get("municipality") and not bases.get("school"):
        delta = taxes.get("delta", {}).get("total_dollars")
        return float(delta) if delta is not None else None
    future_total = _future_total_at_commercial_growth(taxes, growth)
    return round(future_total - float(current_total), 2)


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
    split_mills: dict[str, float] | None = None,
) -> dict[str, Any]:
    line: dict[str, Any] = {
        "label": label,
        "taxable_value": round(taxable, 2),
        "mills": round(mills, 4) if mills is not None else None,
        "mills_label": mills_label,
        "annual_tax": round(amount, 2),
    }
    if split_mills is not None:
        normalized = _split_mills_for_api(split_mills)
        line["split_mills"] = {
            "land": round(normalized["land"], 4),
            "building": round(normalized["building"], 4),
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
    muni_split: dict[str, float] | None = None,
    school_split: dict[str, float] | None = None,
    muni_land_taxable_fut: float | None = None,
    muni_building_taxable_fut: float | None = None,
    school_land_taxable_fut: float | None = None,
    school_building_taxable_fut: float | None = None,
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

    if (
        muni_split
        and muni_land_taxable_fut is not None
        and muni_building_taxable_fut is not None
    ):
        muni_fut = _split_rate_tax_amount(
            muni_land_taxable_fut,
            muni_building_taxable_fut,
            muni_split,
            factor=muni_factor,
        )
        muni_taxable_total = muni_land_taxable_fut + muni_building_taxable_fut
        muni_mills_future = _blended_mills(muni_fut, muni_taxable_total)
    else:
        muni_fut = _mill_tax(local_taxable_fut_muni, muni_mills_future)

    if (
        school_split
        and school_land_taxable_fut is not None
        and school_building_taxable_fut is not None
    ):
        school_fut = _split_rate_tax_amount(
            school_land_taxable_fut,
            school_building_taxable_fut,
            school_split,
            factor=school_factor,
        )
        school_taxable_total = school_land_taxable_fut + school_building_taxable_fut
        school_mills_future = _blended_mills(school_fut, school_taxable_total)
    else:
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
            (muni_land_taxable_fut + muni_building_taxable_fut)
            if muni_split and muni_land_taxable_fut is not None and muni_building_taxable_fut is not None
            else local_taxable_fut_muni,
            muni_mills_future,
            muni_fut,
            muni_key if not muni_split else _split_mills_label(muni_split),
            nominal_mills=muni_mills if not muni_split else None,
            revenue_neutral_factor=muni_factor,
            scenario=scenario,
            split_mills=muni_split,
        ),
        "school": _line(
            school_label,
            (school_land_taxable_fut + school_building_taxable_fut)
            if school_split
            and school_land_taxable_fut is not None
            and school_building_taxable_fut is not None
            else local_taxable_fut_school,
            school_mills_future,
            school_fut,
            school_key if not school_split else _split_mills_label(school_split),
            nominal_mills=school_mills if not school_split else None,
            revenue_neutral_factor=school_factor,
            scenario=scenario,
            split_mills=school_split,
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
        if county_value_ratio is not None:
            county_avg_residential_growth = county_value_ratio - 1.0
        else:
            avg_pct = summary.get("avg_value_change_pct")
            if avg_pct is not None:
                county_avg_residential_growth = float(avg_pct) / 100.0
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

    muni_split = _split_rate_entry(cfg, body="municipalities", key=muni_key)
    school_split = _split_rate_entry(cfg, body="school_districts", key=school_key)

    if muni_mills is None and not muni_split:
        warnings.append(f"Municipality millage not found for “{municipality}”.")
    if school_mills is None and not school_split:
        warnings.append(f"School district millage not found for “{school_district}”.")

    assessment_total_cur, land_cur, building_cur = _assessment_land_building(parcel, future=False)
    assessment_total_fut, land_fut, building_fut = _assessment_land_building(parcel, future=True)

    if (muni_split or school_split) and assessment_total_cur > 0 and land_cur <= 0:
        warnings.append(
            "Land/building assessed values are missing; split-rate local taxes may be inaccurate."
        )

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

    if muni_split:
        muni_land_cur, muni_building_cur = _apportion_local_land_building(
            local_current, assessment_total_cur, land_cur, building_cur
        )
        muni_land_fut, muni_building_fut = _apportion_local_land_building(
            local_future, assessment_total_fut, land_fut, building_fut
        )
        muni_land_cur, muni_building_cur = _homestead_land_first_taxable(
            muni_land_cur, muni_building_cur, homestead_flag, muni_excl_cur
        )
        muni_land_fut, muni_building_fut = _homestead_land_first_taxable(
            muni_land_fut, muni_building_fut, homestead_flag, muni_excl_fut
        )
    else:
        muni_land_cur = muni_building_cur = muni_land_fut = muni_building_fut = 0.0

    if school_split:
        school_land_cur, school_building_cur = _apportion_local_land_building(
            local_current, assessment_total_cur, land_cur, building_cur
        )
        school_land_fut, school_building_fut = _apportion_local_land_building(
            local_future, assessment_total_fut, land_fut, building_fut
        )
        school_land_cur, school_building_cur = _homestead_land_first_taxable(
            school_land_cur, school_building_cur, homestead_flag, school_excl_cur
        )
        school_land_fut, school_building_fut = _homestead_land_first_taxable(
            school_land_fut, school_building_fut, homestead_flag, school_excl_fut
        )
    else:
        school_land_cur = school_building_cur = school_land_fut = school_building_fut = 0.0

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
    if muni_split:
        muni_cur = _split_rate_tax_amount(muni_land_cur, muni_building_cur, muni_split)
        muni_taxable_cur = muni_land_cur + muni_building_cur
        muni_mills_display = _blended_mills(muni_cur, muni_taxable_cur)
    else:
        muni_cur = _mill_tax(local_taxable_cur_muni, muni_mills)
        muni_taxable_cur = local_taxable_cur_muni
        muni_mills_display = muni_mills
    if school_split:
        school_cur = _split_rate_tax_amount(school_land_cur, school_building_cur, school_split)
        school_taxable_cur = school_land_cur + school_building_cur
        school_mills_display = _blended_mills(school_cur, school_taxable_cur)
    else:
        school_cur = _mill_tax(local_taxable_cur_school, school_mills)
        school_taxable_cur = local_taxable_cur_school
        school_mills_display = school_mills
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
            muni_split=muni_split,
            school_split=school_split,
            muni_land_taxable_fut=muni_land_fut if muni_split else None,
            muni_building_taxable_fut=muni_building_fut if muni_split else None,
            school_land_taxable_fut=school_land_fut if school_split else None,
            school_building_taxable_fut=school_building_fut if school_split else None,
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
    if muni_split or school_split:
        notes.append(
            "City of Clairton, City of McKeesport, and Clairton School District use split land/building "
            "millage on local taxable value. Homestead exclusions apply to total local taxable value, "
            "allocated to land first, then building."
        )

    current_breakdown: dict[str, Any] = {
        "county": _line("Allegheny County", county_taxable_cur, county_mills, county_cur, "Allegheny County"),
        "municipality": _line(
            municipality_label,
            muni_taxable_cur,
            muni_mills_display,
            muni_cur,
            muni_key if not muni_split else _split_mills_label(muni_split),
            split_mills=muni_split,
        ),
        "school": _line(
            school_label,
            school_taxable_cur,
            school_mills_display,
            school_cur,
            school_key if not school_split else _split_mills_label(school_split),
            split_mills=school_split,
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
