"""Fetch Allegheny County millage tables and write data/millage_{year}.json."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path

import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

_base_spec = importlib.util.spec_from_file_location(
    "fetch_millage_2025",
    Path(__file__).with_name("fetch_millage_2025.py"),
)
_base = importlib.util.module_from_spec(_base_spec)
assert _base_spec.loader is not None
_base_spec.loader.exec_module(_base)

MUNICIPALITY_ALIASES = _base.MUNICIPALITY_ALIASES
SCHOOL_ALIASES = _base.SCHOOL_ALIASES
fetch_html = _base.fetch_html
parse_muni_millage = _base.parse_muni_millage
parse_school_millage = _base.parse_school_millage
TREASURER_MILLAGE_URL = (
    "https://alleghenycountytreasurer.us/real-estate-tax/local-and-school-district-tax-millage/"
)
COUNTY_MILLS = 6.43
HOMESTEAD_EXCLUSION = 18_000
PITTSBURGH_ADDITIONAL_MILLS = [
    {"id": "parks", "label": "Pittsburgh Parks Tax", "mills": 0.5},
    {"id": "library", "label": "Pittsburgh Library Tax", "mills": 0.25},
]

# Extra aliases for treasurer page naming (2026 municipality table).
TREASURER_MUNICIPALITY_ALIASES: dict[str, str] = {
    **MUNICIPALITY_ALIASES,
    "Jefferson Boro": "Jefferson Hills Borough",
    "Greentree Boro": "Green Tree Borough",
    "City Of Clairton": "City of Clairton",
    "City Of Duquesne": "City of Duquesne",
    "City Of McKeesport": "City of McKeesport",
    "City Of Pittsburgh": "City of Pittsburgh",
    "Mt.Lebanon": "Mount Lebanon",
    "Mt. Lebanon Twp": "Mount Lebanon",
    "Mount Lebanon Township": "Mount Lebanon",
    "Monroeville Municipality": "Monroeville Municipality",
    "Upper St Clair Twp": "Upper St. Clair Township",
    "Upper St Clair Township": "Upper St. Clair Township",
}

TREASURER_SCHOOL_ALIASES: dict[str, str] = {
    **SCHOOL_ALIASES,
    "BALDWIN -WHITEHALL": "Baldwin-Whitehall",
    "BALDWIN -WHITEHALL   ": "Baldwin-Whitehall",
    "Elizabeth Forward": "Elizabeth-Forward",
    "West Jefferson Hills": "West Jefferson",
    "Mt. LEBANON": "Mt. Lebanon",
    "UPPER ST. CLAIR": "Upper St. Clair",
    "PENN-TRAFFORD*": "Penn-Trafford",
    "FORT CHERRY*": "Fort Cherry",
}


def fetch_treasurer_html() -> str:
    req = urllib.request.Request(
        TREASURER_MILLAGE_URL,
        headers={"User-Agent": "assessments-dataviz/1.0 (+https://github.com/prohousingpgh/assessments_dataviz)"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _clean_cell(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text.strip("*").strip()


def parse_tablepress_table(html: str, table_id: str) -> list[dict[int, str]]:
    block_m = re.search(
        rf'<table id="{re.escape(table_id)}"[^>]*>(.*?)</table>',
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if not block_m:
        return []
    block = block_m.group(1)
    rows: list[dict[int, str]] = []
    for row_html in re.findall(r"<tr[^>]*>(.*?)</tr>", block, flags=re.DOTALL | re.IGNORECASE):
        cols: dict[int, str] = {}
        for col_m in re.finditer(
            r'class="column-(\d+)"[^>]*>(.*?)</t[dh]>',
            row_html,
            flags=re.DOTALL | re.IGNORECASE,
        ):
            cols[int(col_m.group(1))] = _clean_cell(col_m.group(2))
        if cols:
            rows.append(cols)
    return rows


def _normalize_school_name(raw: str) -> str:
    name = re.sub(r"\s+", " ", raw).strip().upper()
    name = name.replace("BALDWIN -WHITEHALL", "BALDWIN-WHITEHALL")
    for key, canonical in TREASURER_SCHOOL_ALIASES.items():
        if name == key.strip().upper():
            return canonical
    title = re.sub(r"\s+", " ", raw).strip().title()
    title = title.replace("Baldwin -Whitehall", "Baldwin-Whitehall")
    title = title.replace("Mt. Lebanon", "Mt. Lebanon")
    return TREASURER_SCHOOL_ALIASES.get(title, SCHOOL_ALIASES.get(title, title))


def parse_treasurer_school_mills(html: str, *, column: int) -> dict[str, float]:
    mills: dict[str, float] = {}
    for cols in parse_tablepress_table(html, "tablepress-37"):
        name = cols.get(1, "").strip()
        mill_raw = cols.get(column, "").strip()
        if not name or not mill_raw:
            continue
        if not re.fullmatch(r"[\d.]+", mill_raw):
            continue
        school = _normalize_school_name(name)
        mills[school] = float(mill_raw)
    mills["Clairton"] = 10.0
    mills["Fort Cherry"] = mills.get("Fort Cherry", 16.506)
    mills["Penn-Trafford"] = mills.get("Penn-Trafford", 14.39)
    mills.setdefault("Norwin", 28.5)
    return mills


def _normalize_municipality_name(raw: str) -> str | None:
    name = _clean_cell(raw)
    if not name or name.lower() in {"municipality", "allegheny county"}:
        return None
    if name in TREASURER_MUNICIPALITY_ALIASES:
        return TREASURER_MUNICIPALITY_ALIASES[name]
    if name in MUNICIPALITY_ALIASES:
        return MUNICIPALITY_ALIASES[name]
    for key, canonical in {**TREASURER_MUNICIPALITY_ALIASES, **MUNICIPALITY_ALIASES}.items():
        if key.lower() == name.lower():
            return canonical

    expanded = name.replace("Hgts", "Heights")
    if expanded.endswith(" Twp"):
        expanded = expanded[:-4] + " Township"
    elif expanded.endswith(" Boro"):
        expanded = expanded[:-5] + " Borough"
    expanded = expanded.replace("Mt.Lebanon", "Mount Lebanon")
    if expanded in TREASURER_MUNICIPALITY_ALIASES:
        return TREASURER_MUNICIPALITY_ALIASES[expanded]
    if expanded in MUNICIPALITY_ALIASES.values():
        return expanded
    for canonical in MUNICIPALITY_ALIASES.values():
        if canonical.lower() == expanded.lower():
            return canonical
    return expanded


def parse_treasurer_municipality_mills(html: str, *, column: int) -> dict[str, float]:
    mills: dict[str, float] = {}
    for cols in parse_tablepress_table(html, "tablepress-36"):
        name_raw = cols.get(1, "")
        mill_raw = cols.get(column, "").strip()
        if not mill_raw or not re.fullmatch(r"[\d.]+", mill_raw):
            continue
        name = _normalize_municipality_name(name_raw)
        if not name:
            continue
        value = float(mill_raw)
        # Prefer primary row when duplicate municipality names (e.g. land-only second line).
        if name in mills and value < mills[name]:
            continue
        mills[name] = value
    return mills


def build_payload(year: int) -> dict:
    if year == 2025:
        muni_html = fetch_html("https://apps.alleghenycounty.us/website/MillMuni.asp?Year=2025")
        treasurer_html = fetch_treasurer_html()
        municipality_mills = parse_muni_millage(muni_html)
        school_mills = parse_treasurer_school_mills(treasurer_html, column=3)
        sources = {
            "municipality": "https://apps.alleghenycounty.us/website/MillMuni.asp?Year=2025",
            "school": TREASURER_MILLAGE_URL,
            "school_column": "2024-2025 MILLAGE",
        }
    elif year == 2026:
        treasurer_html = fetch_treasurer_html()
        municipality_mills = parse_treasurer_municipality_mills(treasurer_html, column=5)
        school_mills = parse_treasurer_school_mills(treasurer_html, column=4)
        sources = {
            "municipality": TREASURER_MILLAGE_URL,
            "municipality_column": "MILLAGE 2026",
            "school": TREASURER_MILLAGE_URL,
            "school_column": "2025-2026 MILLAGE",
        }
    else:
        raise ValueError(f"Unsupported tax year: {year}")

    return {
        "tax_year": year,
        "county_mills": COUNTY_MILLS,
        "homestead_exclusion": HOMESTEAD_EXCLUSION,
        "municipality_mills": dict(sorted(municipality_mills.items())),
        "municipality_additional_mills": {
            "City of Pittsburgh": PITTSBURGH_ADDITIONAL_MILLS,
        },
        "school_mills": dict(sorted(school_mills.items())),
        "municipality_aliases": MUNICIPALITY_ALIASES,
        "school_aliases": SCHOOL_ALIASES,
        "sources": sources,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--year",
        type=int,
        choices=(2025, 2026),
        default=2026,
        help="Tax year to fetch (default: 2026)",
    )
    args = parser.parse_args()
    out = ROOT / "data" / f"millage_{args.year}.json"
    payload = build_payload(args.year)
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {out}")
    print(f"  {len(payload['municipality_mills'])} municipality millages")
    print(f"  {len(payload['school_mills'])} school millages")


if __name__ == "__main__":
    main()
