from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from api.tax_aggregates import get_revenue_neutral_factor, load_tax_aggregates

ROOT = Path(__file__).resolve().parents[1]
MILLAGE_PATH = ROOT / "data" / "millage_2025.json"

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


def _county_taxable(county_assessed: float, homestead_flag: str | None, exclusion: float) -> float:
    if county_assessed <= 0:
        return 0.0
    if (homestead_flag or "").strip().upper() == "HOM":
        return max(0.0, county_assessed - exclusion)
    return county_assessed


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


def _line(
    label: str,
    taxable: float,
    mills: float | None,
    amount: float,
    mills_label: str | None = None,
    *,
    nominal_mills: float | None = None,
    revenue_neutral_factor: float | None = None,
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
    return line


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
    exclusion = float(cfg.get("homestead_exclusion", 0))

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

    county_factor, county_meta = get_revenue_neutral_factor(aggregates, "county", "Allegheny County")
    muni_factor, muni_meta = get_revenue_neutral_factor(
        aggregates, "municipality", municipality
    )
    school_factor, school_meta = get_revenue_neutral_factor(
        aggregates, "school_district", school_district
    )

    if not muni_meta.get("found") and municipality:
        warnings.append(
            f"Revenue-neutral millage factor unavailable for municipality “{municipality}”; using nominal millage."
        )
    if not school_meta.get("found") and school_district:
        warnings.append(
            f"Revenue-neutral millage factor unavailable for school district “{school_district}”; using nominal millage."
        )

    county_mills_future = _effective_future_mills(county_mills, county_factor)
    muni_mills_future = _effective_future_mills(muni_mills, muni_factor)
    school_mills_future = _effective_future_mills(school_mills, school_factor)

    county_taxable_cur = _county_taxable(county_current, homestead_flag, exclusion)
    county_taxable_fut = _county_taxable(county_future, homestead_flag, exclusion)

    county_cur = _mill_tax(county_taxable_cur, county_mills)
    county_fut = _mill_tax(county_taxable_fut, county_mills_future)
    muni_cur = _mill_tax(local_current, muni_mills)
    muni_fut = _mill_tax(local_future, muni_mills_future)
    school_cur = _mill_tax(local_current, school_mills)
    school_fut = _mill_tax(local_future, school_mills_future)

    current_total = county_cur + muni_cur + school_cur
    future_total = county_fut + muni_fut + school_fut
    delta = future_total - current_total
    delta_pct = (delta / current_total * 100) if current_total > 0 else None

    municipality_label = municipality or "Municipality"
    school_label = school_district or "School district"

    return {
        "tax_year": cfg.get("tax_year"),
        "revenue_neutral_reassessment": True,
        "homestead_applied": (homestead_flag or "").strip().upper() == "HOM",
        "homestead_exclusion": exclusion if (homestead_flag or "").strip().upper() == "HOM" else 0,
        "current": {
            "county": _line("Allegheny County", county_taxable_cur, county_mills, county_cur, "Allegheny County"),
            "municipality": _line(
                municipality_label, local_current, muni_mills, muni_cur, muni_key
            ),
            "school": _line(school_label, local_current, school_mills, school_cur, school_key),
            "total": round(current_total, 2),
        },
        "future": {
            "county": _line(
                "Allegheny County",
                county_taxable_fut,
                county_mills_future,
                county_fut,
                "Allegheny County",
                nominal_mills=county_mills,
                revenue_neutral_factor=county_factor,
            ),
            "municipality": _line(
                municipality_label,
                local_future,
                muni_mills_future,
                muni_fut,
                muni_key,
                nominal_mills=muni_mills,
                revenue_neutral_factor=muni_factor,
            ),
            "school": _line(
                school_label,
                local_future,
                school_mills_future,
                school_fut,
                school_key,
                nominal_mills=school_mills,
                revenue_neutral_factor=school_factor,
            ),
            "total": round(future_total, 2),
        },
        "delta": {
            "total_dollars": round(delta, 2),
            "total_percent": round(delta_pct, 2) if delta_pct is not None else None,
        },
        "jurisdiction_factors": {
            "county": county_meta,
            "municipality": muni_meta,
            "school_district": school_meta,
        },
        "warnings": warnings,
        "notes": [
            "Estimated annual liability using 2025 nominal millage; not actual payments.",
            "After reassessment, millage is adjusted within each jurisdiction so total tax revenue stays the same (revenue-neutral reassessment).",
            "Your tax can still change if your home’s assessed value rises or falls more than the jurisdiction average.",
            "County tax uses county assessed value; municipality and school use local assessed value.",
        ],
    }
