from __future__ import annotations

from typing import Any

# Matches agc_assessments combineOutputFiles land-floor output (NEW_LAND == NEW_TOTAL).
_ZERO_BUILDING_TOLERANCE = 1.0

_ZERO_MODELED_BUILDING_MESSAGE = (
    "The modeled reassessment assigns no building value despite recorded living area. "
    "County property data (building size, room counts, etc.) may not match the real "
    "structure, which can skew automated valuations. Treat this estimate with extra caution."
)


def zero_modeled_building_warning(parcel: dict[str, Any]) -> str | None:
    """Return a user-facing warning when modeled building value is effectively zero."""
    building_area = parcel.get("building_area_sqft")
    if building_area is None or float(building_area) <= 0:
        return None

    new_total = parcel.get("new_assessment_total")
    new_land = parcel.get("new_assessment_land")
    if new_total is None or new_land is None:
        return None

    total = float(new_total)
    land = float(new_land)
    if total <= 0:
        return None
    if abs(total - land) >= _ZERO_BUILDING_TOLERANCE:
        return None

    return _ZERO_MODELED_BUILDING_MESSAGE


def enrich_parcel_assessment_flags(parcel: dict[str, Any]) -> dict[str, Any]:
    """Attach assessment_quality_warning when modeled land absorbs the full total."""
    warning = zero_modeled_building_warning(parcel)
    if warning:
        parcel["assessment_quality_warning"] = warning
    return parcel
