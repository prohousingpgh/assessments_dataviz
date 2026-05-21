"""Build data/homestead_exclusions.json from millage jurisdictions and known Act 50 amounts."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MILLAGE_PATH = ROOT / "data" / "millage_2025.json"
OUT_PATH = ROOT / "data" / "homestead_exclusions.json"

DEFAULT_AMOUNT = 18_000
TAX_YEAR = 2025

COUNTY_ENTRY = {
    "amount": DEFAULT_AMOUNT,
    "confidence": "verified",
    "source": "Allegheny County Act 50 homestead exclusion (county real estate tax)",
    "source_url": "https://www.alleghenycounty.us/Services/Property-Assessments-and-Real-Estate/Tax-Abatements-and-Exemptions/HomesteadFarmstead-Exclusion-Act-50",
    "notes": "County applies a $18,000 reduction in assessed value before county millage.",
}

# Verified amounts that differ from the county-wide default.
MUNICIPALITY_OVERRIDES: dict[str, dict] = {
    "City of Pittsburgh": {
        "amount": 15_000,
        "confidence": "verified",
        "source": "City of Pittsburgh Act 50 homestead (owner-occupied primary residence)",
        "source_url": "https://www.wesa.fm/politics-government/2025-12-23/pittsburgh-property-taxes-calculator",
        "notes": (
            "Pittsburgh city homestead is lower than the county default. "
            "Parks and library taxes use the same homestead base in city law; "
            "this app models city millage only."
        ),
    },
}

SCHOOL_OVERRIDES: dict[str, dict] = {
    "Pittsburgh": {
        "amount": 43_750,
        "confidence": "verified",
        "source": "Pittsburgh Public Schools Act 50 homestead exclusion",
        "source_url": "https://www.wesa.fm/politics-government/2025-12-23/pittsburgh-property-taxes-calculator",
        "notes": "Higher than the $18,000 default used by most Allegheny school districts.",
    },
}


def _default_entry(kind: str) -> dict:
    return {
        "amount": DEFAULT_AMOUNT,
        "confidence": "default",
        "source": f"Assumed {kind} default (${DEFAULT_AMOUNT:,}) — Act 50 adoption not verified for this jurisdiction",
        "source_url": "https://www.alleghenycounty.us/Services/Property-Assessments-and-Real-Estate/Tax-Abatements-and-Exemptions/HomesteadFarmstead-Exclusion-Act-50",
        "notes": (
            "Many Allegheny taxing bodies use the $18,000 exclusion. "
            "Confirm with the municipality or school district before relying on this figure."
        ),
    }


def main() -> None:
    millage = json.loads(MILLAGE_PATH.read_text(encoding="utf-8"))
    municipalities: dict[str, dict] = {}
    for name in sorted(millage["municipality_mills"]):
        municipalities[name] = {**MUNICIPALITY_OVERRIDES.get(name, _default_entry("municipality"))}

    schools: dict[str, dict] = {}
    for name in sorted(millage["school_mills"]):
        schools[name] = {**SCHOOL_OVERRIDES.get(name, _default_entry("school district"))}

    verified_muni = sum(1 for v in municipalities.values() if v["confidence"] == "verified")
    verified_school = sum(1 for v in schools.values() if v["confidence"] == "verified")

    payload = {
        "tax_year": TAX_YEAR,
        "default_exclusion": DEFAULT_AMOUNT,
        "county": COUNTY_ENTRY,
        "municipalities": municipalities,
        "school_districts": schools,
        "metadata": {
            "generated_by": "scripts/build_homestead_exclusions.py",
            "millage_source": "data/millage_2025.json",
            "municipality_count": len(municipalities),
            "school_district_count": len(schools),
            "verified_municipality_count": verified_muni,
            "verified_school_district_count": verified_school,
            "disclaimer": (
                "Reference table for Act 50 homestead exclusions on assessed value. "
                "Only taxing bodies that adopted an exclusion apply it; "
                "applications are filed with Allegheny County by March 1. "
                "Amounts marked default are placeholders until confirmed from district resolutions."
            ),
        },
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(municipalities)} municipalities, {len(schools)} school districts)")


if __name__ == "__main__":
    main()
