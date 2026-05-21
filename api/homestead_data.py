from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

ROOT = Path(__file__).resolve().parents[1]
HOMESTEAD_PATH = ROOT / "data" / "homestead_exclusions.json"

Confidence = Literal["verified", "default"]

_data: dict[str, Any] | None = None


def load_homestead_exclusions() -> dict[str, Any]:
    global _data
    if _data is None:
        _data = json.loads(HOMESTEAD_PATH.read_text(encoding="utf-8"))
    return _data


def default_exclusion_amount() -> float:
    return float(load_homestead_exclusions().get("default_exclusion", 18_000))


def county_exclusion_amount() -> float:
    return float(load_homestead_exclusions()["county"]["amount"])


def municipality_exclusion_amount(mills_key: str | None) -> tuple[float, Confidence]:
    if not mills_key:
        return default_exclusion_amount(), "default"
    entry = load_homestead_exclusions()["municipalities"].get(mills_key)
    if not entry:
        return default_exclusion_amount(), "default"
    return float(entry["amount"]), entry["confidence"]


def school_exclusion_amount(mills_key: str | None) -> tuple[float, Confidence]:
    if not mills_key:
        return default_exclusion_amount(), "default"
    entry = load_homestead_exclusions()["school_districts"].get(mills_key)
    if not entry:
        return default_exclusion_amount(), "default"
    return float(entry["amount"]), entry["confidence"]


def list_homestead_table() -> dict[str, Any]:
    """Payload for GET /api/homestead-exemptions."""
    data = load_homestead_exclusions()
    municipalities = [
        {
            "name": name,
            "taxing_body": "municipality",
            **entry,
        }
        for name, entry in sorted(data["municipalities"].items())
    ]
    schools = [
        {
            "name": name,
            "taxing_body": "school",
            **entry,
        }
        for name, entry in sorted(data["school_districts"].items())
    ]
    return {
        "tax_year": data.get("tax_year"),
        "default_exclusion": data.get("default_exclusion"),
        "county": data.get("county"),
        "municipalities": municipalities,
        "school_districts": schools,
        "metadata": data.get("metadata", {}),
    }
