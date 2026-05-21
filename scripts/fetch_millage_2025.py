"""Download 2025 millage tables from Allegheny County Treasurer and write data/millage_2025.json."""

from __future__ import annotations

import json
import re
from pathlib import Path

import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "millage_2025.json"

COUNTY_MILLS = 6.43
HOMESTEAD_EXCLUSION = 18_000
TAX_YEAR = 2025

MUNICIPALITY_ALIASES: dict[str, str] = {
    "Aleppo": "Aleppo Township",
    "Aspinwall": "Aspinwall Borough",
    "Avalon": "Avalon Borough",
    "Baldwin Boro": "Baldwin Borough",
    "Baldwin Twp": "Baldwin Township",
    "Bell Acres": "Bell Acres Borough",
    "Bellevue": "Bellevue Borough",
    "Ben Avon": "Ben Avon Borough",
    "Ben Avon Heights": "Ben Avon Heights Borough",
    "Bethel Park": "Bethel Park",
    "Blawnox": "Blawnox Borough",
    "Brackenridge": "Brackenridge Borough",
    "Braddock": "Braddock Borough",
    "Braddock Hills": "Braddock Hills Borough",
    "Bradford Woods": "Bradford Woods Borough",
    "Brentwood": "Brentwood Borough",
    "Bridgeville": "Bridgeville Borough",
    "CLAIRTON": "City of Clairton",
    "Carnegie": "Carnegie Borough",
    "Castle Shannon": "Castle Shannon Borough",
    "Chalfant": "Chalfant Borough",
    "Cheswick": "Cheswick Borough",
    "Churchill": "Churchill Borough",
    "Collier": "Collier Township",
    "Coraopolis": "Coraopolis Borough",
    "Crafton": "Crafton Borough",
    "Crescent": "Crescent Township",
    "DUQUESNE": "City of Duquesne",
    "Dormont": "Dormont Borough",
    "Dravosburg": "Dravosburg Borough",
    "East Deer": "East Deer Township",
    "East McKeesport": "East McKeesport Borough",
    "East Pittsburgh": "East Pittsburgh Borough",
    "Edgewood": "Edgewood Borough",
    "Edgeworth": "Edgeworth Borough",
    "Elizabeth Boro": "Elizabeth Borough",
    "Elizabeth Twp": "Elizabeth Township",
    "Emsworth": "Emsworth Borough",
    "Etna": "Etna Borough",
    "Fawn": "Fawn Township",
    "Findlay": "Findlay Township",
    "Forest Hills": "Forest Hills Borough",
    "Forward": "Forward Township",
    "Fox Chapel": "Fox Chapel Borough",
    "Franklin Park": "Franklin Park Borough",
    "Frazer": "Frazer Township",
    "Glassport": "Glassport Borough",
    "Glen Osborne": "Glen Osborne Borough",
    "Glenfield": "Glenfield Borough",
    "Greentree": "Green Tree Borough",
    "Hampton": "Hampton Township",
    "Harmar": "Harmar Township",
    "Harrison": "Harrison Township",
    "Haysville": "Haysville Borough",
    "Heidelberg": "Heidelberg Borough",
    "Homestead": "Homestead Borough",
    "Indiana": "Indiana Township",
    "Ingram": "Ingram Borough",
    "Jefferson Hills": "Jefferson Hills Borough",
    "Kennedy": "Kennedy Township",
    "Kilbuck": "Kilbuck Township",
    "Leet": "Leet Township",
    "Leetsdale": "Leetsdale Borough",
    "Liberty": "Liberty Borough",
    "Lincoln": "Lincoln Borough",
    "Marshall": "Marshall Township",
    "McCandless": "McCandless Township",
    "McDonald": "McDonald Borough",
    "McKEESPORT": "City of McKeesport",
    "McKees Rocks": "McKees Rocks Borough",
    "Millvale": "Millvale Borough",
    "Monroeville": "Monroeville Municipality",
    "Moon": "Moon Township",
    "Mt. Oliver": "Mount Oliver Borough",
    "Mt.Lebanon": "Mount Lebanon",
    "Munhall": "Munhall Borough",
    "Neville": "Neville Township",
    "North Braddock": "North Braddock Borough",
    "North Fayette": "North Fayette Township",
    "North Versailles": "North Versailles Township",
    "O'Hara": "O'Hara Township",
    "O''Hara": "O'Hara Township",
    "Oakdale": "Oakdale Borough",
    "Oakmont": "Oakmont Borough",
    "Ohio": "Ohio Township",
    "PITTSBURGH": "City of Pittsburgh",
    "Penn Hills": "Penn Hills Township",
    "Pennsbury Village": "Pennsbury Village",
    "Pine": "Pine Township",
    "Pitcairn": "Pitcairn Borough",
    "Pleasant Hills": "Pleasant Hills Borough",
    "Plum": "Plum Borough",
    "Port Vue": "Port Vue Borough",
    "Rankin": "Rankin Borough",
    "Reserve": "Reserve Township",
    "Richland": "Richland Township",
    "Robinson": "Robinson Township",
    "Ross": "Ross Township",
    "Rosslyn Farms": "Rosslyn Farms Borough",
    "Scott": "Scott Township",
    "Sewickley": "Sewickley Borough",
    "Sewickley Heights": "Sewickley Heights Borough",
    "Sewickley Hills": "Sewickley Hills Borough",
    "Shaler": "Shaler Township",
    "Sharpsburg": "Sharpsburg Borough",
    "South Fayette": "South Fayette Township",
    "South Park": "South Park Township",
    "South Versailles": "South Versailles Township",
    "Springdale Boro": "Springdale Borough",
    "Springdale Twp": "Springdale Township",
    "Stowe": "Stowe Township",
    "Swissvale": "Swissvale Borough",
    "Tarentum": "Tarentum Borough",
    "Thornburg": "Thornburg Borough",
    "Trafford": "Trafford Borough",
    "Turtle Creek": "Turtle Creek Borough",
    "Upper St. Clair": "Upper St. Clair Township",
    "Verona": "Verona Borough",
    "Versailles": "Versailles Borough",
    "Wall": "Wall Borough",
    "West Deer": "West Deer Township",
    "West Elizabeth": "West Elizabeth Borough",
    "West Homestead": "West Homestead Borough",
    "West Mifflin": "West Mifflin Borough",
    "West View": "West View Borough",
    "Whitaker": "Whitaker Borough",
    "White Oak": "White Oak Borough",
    "Whitehall": "Whitehall Borough",
    "Wilkins": "Wilkins Township",
    "Wilkinsburg": "Wilkinsburg Borough",
    "Wilmerding": "Wilmerding Borough",
}

SCHOOL_ALIASES: dict[str, str] = {
    "Allegheny Valley": "Allegheny Valley",
    "Avonworth": "Avonworth",
    "Baldwin Whitehall": "Baldwin-Whitehall",
    "Bethel Park": "Bethel Park",
    "Brentwood Boro": "Brentwood",
    "Carlynton": "Carlynton",
    "Chartiers Valley": "Chartiers Valley",
    "Clairton City": "Clairton",
    "Cornell": "Cornell",
    "Deer Lakes": "Deer Lakes",
    "Duquesne City": "Duquesne Area",
    "East Allegheny": "East Allegheny",
    "Elizabeth Forward": "Elizabeth-Forward",
    "Fort Cherry": "Fort Cherry",
    "Fox Chapel Area": "Fox Chapel Area",
    "Gateway": "Gateway",
    "Hampton Township": "Hampton",
    "Highlands": "Highlands",
    "Keystone Oaks": "Keystone Oaks",
    "McKeesport Area": "McKeesport Area",
    "Montour": "Montour",
    "Moon Area": "Moon Area",
    "Mt Lebanon": "Mt. Lebanon",
    "North Allegheny": "North Allegheny",
    "North Hills": "North Hills",
    "Northgate": "Northgate",
    "Norwin": "Norwin",
    "Penn Hills Twp": "Penn Hills",
    "Penn-Trafford": "Penn-Trafford",
    "Pine-Richland": "Pine-Richland",
    "Pittsburgh": "Pittsburgh",
    "Plum Boro": "Plum",
    "Quaker Valley": "Quaker Valley",
    "Riverview": "Riverview",
    "Shaler Area": "Shaler Area",
    "South Allegheny": "South Allegheny",
    "South Fayette Twp": "South Fayette",
    "South Park": "South Park",
    "Steel Valley": "Steel Valley",
    "Sto-Rox": "Sto-Rox",
    "Upper St Clair": "Upper St. Clair",
    "West Allegheny": "West Allegheny",
    "West Jefferson Hills": "West Jefferson",
    "West Mifflin Area": "West Mifflin Area",
    "Wilkinsburg Boro": "Wilkinsburg",
    "Woodland Hills": "Woodland Hills",
}


def fetch_html(url: str) -> str:
    with urllib.request.urlopen(url, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_muni_millage(html: str) -> dict[str, float]:
    mills: dict[str, float] = {}
    for row in re.findall(r"<tr>(.*?)</tr>", html, flags=re.DOTALL | re.IGNORECASE):
        if 'data-title="Millage"' not in row:
            continue
        name_m = re.search(
            r'data-title="Muni"[^>]*>(?:<a[^>]*>)?([^<]+?)(?:\s*<sup>|\s*</a>|</td>)',
            row,
            flags=re.IGNORECASE,
        )
        mill_m = re.search(
            r'data-title="Millage"[^>]*>\s*([\d.]+)',
            row,
            flags=re.IGNORECASE,
        )
        if not name_m or not mill_m:
            continue
        name = re.sub(r"\s+", " ", name_m.group(1)).strip()
        if name == "Allegheny County":
            continue
        mills[name] = float(mill_m.group(1))
    return mills


def parse_school_millage(html: str) -> dict[str, float]:
    mills: dict[str, float] = {}
    for row in re.findall(r"<tr>(.*?)</tr>", html, flags=re.DOTALL | re.IGNORECASE):
        if 'data-title="Millage"' not in row or "School Dist" not in row:
            continue
        name_m = re.search(
            r'data-title="School Dist\."[^>]*>\s*([^<]+?)\s*</td>',
            row,
            flags=re.IGNORECASE,
        )
        mill_m = re.search(
            r'data-title="Millage"[^>]*>\s*([\d.]+)',
            row,
            flags=re.IGNORECASE,
        )
        if not name_m or not mill_m:
            continue
        name = re.sub(r"\s+", " ", name_m.group(1)).strip()
        mills[name] = float(mill_m.group(1))
    return mills


def main() -> None:
    muni_html = fetch_html("https://apps.alleghenycounty.us/website/MillMuni.asp?Year=2025")
    school_html = fetch_html("https://apps.alleghenycounty.us/website/millsd.asp?Year=2025")

    municipality_mills = parse_muni_millage(muni_html)
    school_mills = parse_school_millage(school_html)

    school_mills.update(
        {
            "Clairton": 10.0,
            "Fort Cherry": 16.506,
            "Penn-Trafford": 14.39,
            # Norwin SD is mostly outside Allegheny; approximate for border parcels
            "Norwin": 28.5,
        }
    )

    payload = {
        "tax_year": TAX_YEAR,
        "county_mills": COUNTY_MILLS,
        "homestead_exclusion": HOMESTEAD_EXCLUSION,
        "municipality_mills": municipality_mills,
        "school_mills": school_mills,
        "municipality_aliases": MUNICIPALITY_ALIASES,
        "school_aliases": SCHOOL_ALIASES,
        "sources": {
            "municipality": "https://apps.alleghenycounty.us/website/MillMuni.asp?Year=2025",
            "school": "https://apps.alleghenycounty.us/website/millsd.asp?Year=2025",
        },
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"  {len(municipality_mills)} municipality millages")
    print(f"  {len(school_mills)} school millages")


if __name__ == "__main__":
    main()
