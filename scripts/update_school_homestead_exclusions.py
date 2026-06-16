"""Update proposed school homestead exclusions from Act 1 allocation data.

The state property tax reduction allocation is a tax-bill credit. This converts
that credit into the equivalent assessed-value reduction used by the app:

    allocation / homestead_count / school_millage * 1,000
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DEFAULT_HOMESTEAD_PATH = DATA_DIR / "homestead_exclusions.json"
DEFAULT_MILLAGE_PATH = DATA_DIR / "millage_2026.json"
DEFAULT_WORKBOOK_PATH = DATA_DIR / "sources" / "2026-27sptra.xlsx"

SPTRA_URL = (
    "https://www.pa.gov/content/dam/copapwp-pagov/en/education/documents/schools/"
    "property-tax-relief/allocations/2026-27sptra.xlsx"
)
SPTRA_ALLOCATION_COLUMN = "2026-27\nState Property Tax Reduction Allocation"
SOURCE_TEXT = "2026-2027 Pennsylvania property tax relief allocation amounts"
NOTES = "School District Allocation divided by homestead count, divided by 2026-2027 millage, multiplied by 1,000"


def _clean_header(value: object) -> str:
    return re.sub(r"\s+", " ", str(value).strip()).lower()


def _normalize_school_name(value: object) -> str:
    text = str(value or "").strip()
    text = re.sub(r"[\u2010-\u2015]", "-", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+(school district|sd)$", "", text, flags=re.IGNORECASE)
    text = text.replace("&", " and ")
    text = text.replace(".", "")
    text = text.replace("-", " ")
    text = re.sub(r"\bborough\b", "boro", text, flags=re.IGNORECASE)
    text = re.sub(r"\btownship\b", "twp", text, flags=re.IGNORECASE)
    text = re.sub(r"\bmount\b", "mt", text, flags=re.IGNORECASE)
    text = re.sub(r"\bsaint\b", "st", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text)
    return text.strip().lower()


def _school_lookup(millage: dict) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for name in millage["school_mills"]:
        lookup[_normalize_school_name(name)] = name
    for alias, canonical in millage.get("school_aliases", {}).items():
        lookup[_normalize_school_name(alias)] = canonical
    return lookup


def _find_column(columns: list[object], candidates: list[str]) -> object:
    normalized = {_clean_header(column): column for column in columns}
    for candidate in candidates:
        match = normalized.get(_clean_header(candidate))
        if match is not None:
            return match
    raise SystemExit(f"Could not find any of these columns: {', '.join(candidates)}")


def _download_workbook(path: Path, url: str = SPTRA_URL) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url} to {path}")
    urllib.request.urlretrieve(url, path)


def _load_allocations(path: Path, lookup: dict[str, str]) -> dict[str, float]:
    if not path.is_file():
        _download_workbook(path)

    df = pd.read_excel(path, header=1)
    school_col = _find_column(list(df.columns), ["School District", "School District Name"])
    allocation_col = _find_column(list(df.columns), [SPTRA_ALLOCATION_COLUMN])

    rows = df[[school_col, allocation_col]].copy()
    rows["school_key"] = rows[school_col].map(lambda value: lookup.get(_normalize_school_name(value)))
    rows["allocation"] = pd.to_numeric(rows[allocation_col], errors="coerce")
    rows = rows.dropna(subset=["school_key", "allocation"])
    return rows.groupby("school_key")["allocation"].sum().to_dict()


def _load_homestead_counts(path: Path, lookup: dict[str, str]) -> dict[str, int]:
    headers = list(pd.read_csv(path, nrows=0).columns)
    school_col = _find_column(headers, ["SCHOOLDESC", "SCHOOL_DISTRICT", "school_district"])
    homestead_col = _find_column(headers, ["HOMESTEADFLAG", "homestead_flag"])

    counts: dict[str, int] = {}
    for chunk in pd.read_csv(path, usecols=[school_col, homestead_col], chunksize=100_000):
        homestead_rows = chunk[chunk[homestead_col].astype(str).str.strip().str.upper() == "HOM"]
        if homestead_rows.empty:
            continue
        mapped = homestead_rows[school_col].map(lambda value: lookup.get(_normalize_school_name(value)))
        for school, count in mapped.dropna().value_counts().items():
            counts[str(school)] = counts.get(str(school), 0) + int(count)
    return counts


def update_school_homestead_exclusions(
    *,
    homestead_path: Path = DEFAULT_HOMESTEAD_PATH,
    millage_path: Path = DEFAULT_MILLAGE_PATH,
    workbook_path: Path = DEFAULT_WORKBOOK_PATH,
    assessments_path: Path,
    output_path: Path | None = None,
) -> dict:
    homestead = json.loads(homestead_path.read_text(encoding="utf-8"))
    millage = json.loads(millage_path.read_text(encoding="utf-8"))
    lookup = _school_lookup(millage)

    allocations = _load_allocations(workbook_path, lookup)
    homestead_counts = _load_homestead_counts(assessments_path, lookup)
    school_mills = millage["school_mills"]

    updated = 0
    missing: list[str] = []
    for school, entry in homestead["school_districts"].items():
        if entry.get("confidence") != "default":
            continue
        allocation = allocations.get(school)
        homestead_count = homestead_counts.get(school)
        mills = school_mills.get(school)
        if not allocation or not homestead_count or not mills:
            missing.append(school)
            continue

        entry["amount"] = round(allocation / homestead_count / mills * 1_000)
        entry["confidence"] = "proposed"
        entry["source"] = SOURCE_TEXT
        entry["source_url"] = SPTRA_URL
        entry["notes"] = NOTES
        updated += 1

    if missing:
        raise SystemExit(
            "Missing allocation, homestead count, or millage for default school districts: "
            + ", ".join(sorted(missing))
        )

    metadata = homestead.setdefault("metadata", {})
    metadata["school_allocation_source"] = SPTRA_URL
    metadata["school_homestead_count_source"] = str(assessments_path)
    metadata["proposed_school_district_count"] = sum(
        1 for entry in homestead["school_districts"].values() if entry.get("confidence") == "proposed"
    )
    metadata["school_homestead_method"] = NOTES

    target = output_path or homestead_path
    target.write_text(json.dumps(homestead, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {target} ({updated} school district defaults updated to proposed)")
    return homestead


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--homestead", type=Path, default=DEFAULT_HOMESTEAD_PATH)
    parser.add_argument("--millage", type=Path, default=DEFAULT_MILLAGE_PATH)
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK_PATH)
    parser.add_argument("--assessments", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    update_school_homestead_exclusions(
        homestead_path=args.homestead,
        millage_path=args.millage,
        workbook_path=args.workbook,
        assessments_path=args.assessments,
        output_path=args.output,
    )


if __name__ == "__main__":
    main()
