"""Build data/homestead_exclusions.json from millage jurisdictions and verified Act 50 amounts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MILLAGE = ROOT / "data" / "millage_2026.json"
OVERRIDES_PATH = ROOT / "data" / "homestead_exclusion_overrides.json"
OUT_PATH = ROOT / "data" / "homestead_exclusions.json"

DEFAULT_AMOUNT = 18_000


def _default_entry(kind: str) -> dict:
    return {
        "amount": DEFAULT_AMOUNT,
        "confidence": "default",
        "source": f"Assumed {kind} default (${DEFAULT_AMOUNT:,}) — Act 50 adoption not verified for this jurisdiction",
        "source_url": "https://www.alleghenycounty.us/Services/Property-Assessments-and-Real-Estate/Tax-Abatements-and-Exemptions/HomesteadFarmstead-Exclusion-Act-50",
        "notes": (
            "Many Allegheny taxing bodies use the $18,000 exclusion when they adopt Act 50. "
            "Municipal participation varies; some set other amounts (e.g. Pittsburgh $15,000, "
            "Pine Township sets an annual maximum). Confirm with the jurisdiction before relying "
            "on this figure."
        ),
    }


def _load_overrides(path: Path) -> dict:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def build_homestead_exclusions(
    *,
    millage_path: Path = DEFAULT_MILLAGE,
    overrides_path: Path = OVERRIDES_PATH,
    out_path: Path = OUT_PATH,
) -> dict:
    millage = json.loads(millage_path.read_text(encoding="utf-8"))
    overrides = _load_overrides(overrides_path)
    tax_year = overrides.get("tax_year") or millage.get("tax_year", 2026)

    muni_overrides = overrides.get("municipalities", {})
    school_overrides = overrides.get("school_districts", {})
    county_entry = overrides.get("county") or {
        "amount": DEFAULT_AMOUNT,
        "confidence": "verified",
        "source": "Allegheny County Act 50 homestead exclusion (county real estate tax)",
        "source_url": "https://www.alleghenycounty.us/Services/Property-Assessments-and-Real-Estate/Tax-Abatements-and-Exemptions/HomesteadFarmstead-Exclusion-Act-50",
        "notes": "County applies a $18,000 reduction in assessed value before county millage.",
    }

    municipalities: dict[str, dict] = {}
    for name in sorted(millage["municipality_mills"]):
        municipalities[name] = {**_default_entry("municipality"), **muni_overrides.get(name, {})}

    schools: dict[str, dict] = {}
    for name in sorted(millage["school_mills"]):
        schools[name] = {**_default_entry("school district"), **school_overrides.get(name, {})}

    verified_muni = sum(1 for v in municipalities.values() if v["confidence"] == "verified")
    verified_school = sum(1 for v in schools.values() if v["confidence"] == "verified")

    return {
        "tax_year": tax_year,
        "default_exclusion": DEFAULT_AMOUNT,
        "county": county_entry,
        "municipalities": municipalities,
        "school_districts": schools,
        "metadata": {
            "generated_by": "scripts/build_homestead_exclusions.py",
            "millage_source": str(millage_path.relative_to(ROOT)),
            "overrides_source": str(overrides_path.relative_to(ROOT)) if overrides_path.is_file() else None,
            "municipality_count": len(municipalities),
            "school_district_count": len(schools),
            "verified_municipality_count": verified_muni,
            "verified_school_district_count": verified_school,
            "disclaimer": (
                "Reference table for Act 50 homestead exclusions on assessed value. "
                "Only taxing bodies that adopted an exclusion apply it; "
                "applications are filed with Allegheny County by March 1. "
                "Amounts marked default are placeholders until confirmed from district resolutions. "
                "This is separate from Act 1 gaming-funded school tax credits on bills."
            ),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--millage", type=Path, default=DEFAULT_MILLAGE)
    parser.add_argument("--overrides", type=Path, default=OVERRIDES_PATH)
    parser.add_argument("--output", type=Path, default=OUT_PATH)
    args = parser.parse_args()

    payload = build_homestead_exclusions(
        millage_path=args.millage,
        overrides_path=args.overrides,
        out_path=args.output,
    )
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    meta = payload["metadata"]
    print(
        f"Wrote {args.output} "
        f"({meta['municipality_count']} municipalities, {meta['school_district_count']} school districts; "
        f"{meta['verified_municipality_count']} verified muni, {meta['verified_school_district_count']} verified school)"
    )


if __name__ == "__main__":
    main()
