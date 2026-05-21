"""Property use codes included in the homeowner-facing site."""

HOMEOWNER_USES = frozenset(
    {
        "SINGLE FAMILY",
        "TOWNHOUSE",
        "ROWHOUSE",
        "CONDOMINIUM",
        "TWO FAMILY",
        "THREE FAMILY",
        "FOUR FAMILY",
        "MOBILE HOME",
        "MOBILE HOME (IN PARK)",
    }
)

EXCLUDED_USES = frozenset(
    {
        "VACANT LAND",
        "BUILDERS LOT",
        "RES AUX BUILDING (NO HOUSE)",
        "CONDEMNED/BOARDED-UP",
        "RESIDENTIAL VACANT LAND",
        ">10 ACRES VACANT",
    }
)


def is_homeowner_use(use_description: str) -> bool:
    normalized = (use_description or "").strip().upper()
    if normalized in EXCLUDED_USES:
        return False
    if normalized in HOMEOWNER_USES:
        return True
    # Allow other improved residential (e.g. "FOUR FAMILY") not in exclude list
    return bool(normalized) and "VACANT" not in normalized and "COMMERCIAL" not in normalized
