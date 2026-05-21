from __future__ import annotations

from typing import Literal

from api.homestead_data import (
    county_exclusion_amount,
    default_exclusion_amount,
    municipality_exclusion_amount,
    school_exclusion_amount,
)

DEFAULT_HOMESTEAD_EXCLUSION = 18_000
PITTSBURGH_SCHOOL_HOMESTEAD_EXCLUSION = 43_750

TaxingBody = Literal["county", "municipality", "school"]


def is_pittsburgh_school_district(
    school_district: str | None,
    school_mills_key: str | None = None,
) -> bool:
    """True for Pittsburgh Public Schools (WPRDC school_district or millage key)."""
    for name in (school_district, school_mills_key):
        if name and name.strip().upper() == "PITTSBURGH":
            return True
    return False


def homestead_exclusion_amount(
    taxing_body: TaxingBody,
    *,
    school_district: str | None = None,
    school_mills_key: str | None = None,
    municipality_mills_key: str | None = None,
    after_reassessment: bool = False,
    county_residential_value_ratio: float | None = None,
    default_exclusion: float | None = None,
) -> float:
    fallback = default_exclusion if default_exclusion is not None else default_exclusion_amount()
    if taxing_body == "county":
        base = county_exclusion_amount()
    elif taxing_body == "municipality":
        base, _ = municipality_exclusion_amount(municipality_mills_key)
    elif taxing_body == "school":
        base, _ = school_exclusion_amount(school_mills_key)
    else:
        base = fallback
    if after_reassessment:
        return future_homestead_exclusion(base, county_residential_value_ratio)
    return base


def future_homestead_exclusion(
    base_exclusion: float,
    county_residential_value_ratio: float | None,
) -> float:
    """
    Scale homestead exclusion after reassessment by countywide residential value growth.

    Uses total new ÷ total current assessed value across homeowner parcels in the dataset,
    rounded to the nearest $1,000 (e.g. 2.0× average growth → $18,000 becomes $36,000).
    """
    if base_exclusion <= 0:
        return 0.0
    if county_residential_value_ratio is None or county_residential_value_ratio <= 0:
        return base_exclusion
    scaled = base_exclusion * county_residential_value_ratio
    return round(scaled / 1000.0) * 1000.0
