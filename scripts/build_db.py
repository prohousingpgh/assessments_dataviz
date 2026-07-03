"""
Build SQLite database for the homeowner assessment explorer.

Usage:
  python scripts/build_db.py \\
    --predictions path/to/residential_predictions.csv \\
    --assessments path/to/wprdc_property_assessments.csv

The WPRDC assessments file provides street addresses for search (PARID join).
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
from api.commercial_scenarios import (  # noqa: E402
    build_scenario_tax_aggregates,
    load_commercial_valuations,
    revenue_neutral_factor,
)
from homeowner_uses import is_homeowner_use  # noqa: E402

DEFAULT_DB = ROOT / "data" / "parcels.db"
DEFAULT_COMMERCIAL = ROOT / "data" / "commercial_existing_valuations.csv"
MANIFEST_PATH = ROOT / "data" / "manifest.json"
MILLAGE_PATH = ROOT / "data" / "millage_2026.json"
DEFAULT_AGC_SETTINGS = ROOT / "data" / "upstream" / "agc" / "settings.json"
AGGREGATES_PATH = ROOT / "data" / "tax_aggregates.json"
HOMESTEAD_EXCLUSION = 18_000
COUNTY_JURISDICTION_NAME = "Allegheny County"


def normalize_address(
    house: str | float | None,
    fraction: str | float | None,
    street: str | float | None,
    unit: str | float | None,
    city: str | float | None,
    state: str | float | None,
    zip_code: str | float | None,
) -> str:
    def s(v: str | float | None) -> str:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return ""
        return str(v).strip()

    parts = [s(house), s(fraction), s(street), s(unit)]
    line1 = " ".join(p for p in parts if p)
    line2 = ", ".join(p for p in [s(city), s(state)] if p)
    tail = s(zip_code)
    if tail:
        line2 = f"{line2} {tail}".strip() if line2 else tail
    return ", ".join(p for p in [line1, line2] if p)


def normalize_search_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def load_assessment_fields(assessments_path: Path) -> pd.DataFrame:
    usecols = [
        "PARID",
        "PROPERTYHOUSENUM",
        "PROPERTYFRACTION",
        "PROPERTYADDRESS",
        "PROPERTYUNIT",
        "PROPERTYCITY",
        "PROPERTYSTATE",
        "PROPERTYZIP",
        "COUNTYTOTAL",
        "LOCALTOTAL",
        "HOMESTEADFLAG",
    ]
    df = pd.read_csv(assessments_path, usecols=usecols, dtype=str, low_memory=False)
    df = df.rename(columns={"PARID": "parcel_id"})
    for col in ("COUNTYTOTAL", "LOCALTOTAL"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.rename(
        columns={
            "COUNTYTOTAL": "county_total",
            "LOCALTOTAL": "local_total",
            "HOMESTEADFLAG": "homestead_flag",
        }
    )
    df["address_display"] = df.apply(
        lambda r: normalize_address(
            r["PROPERTYHOUSENUM"],
            r["PROPERTYFRACTION"],
            r["PROPERTYADDRESS"],
            r["PROPERTYUNIT"],
            r["PROPERTYCITY"],
            r["PROPERTYSTATE"],
            r["PROPERTYZIP"],
        ),
        axis=1,
    )
    df["address_search"] = df["address_display"].map(normalize_search_key)
    return df[
        [
            "parcel_id",
            "address_display",
            "address_search",
            "county_total",
            "local_total",
            "homestead_flag",
        ]
    ].drop_duplicates("parcel_id")


def load_centroids(centroids_path: Path) -> pd.DataFrame:
    """WPRDC parcel centroids CSV (PARID + lon/lat)."""
    df = pd.read_csv(centroids_path, dtype=str, low_memory=False)
    cols = {c.upper(): c for c in df.columns}
    parcel_col = cols.get("PARID") or cols.get("PARCEL_ID") or cols.get("PIN")
    if not parcel_col:
        raise ValueError(f"No PARID/PIN column in {centroids_path}")

    lon_col = None
    lat_col = None
    for candidate in ("LON", "LONG", "LONGITUDE", "X", "CENTROID_X"):
        if candidate in cols:
            lon_col = cols[candidate]
            break
    for candidate in ("LAT", "LATITUDE", "Y", "CENTROID_Y"):
        if candidate in cols:
            lat_col = cols[candidate]
            break
    if not lon_col or not lat_col:
        raise ValueError(
            f"No lon/lat columns found in {centroids_path} (expected LON/LAT or LONGITUDE/LATITUDE)"
        )

    out = pd.DataFrame(
        {
            "parcel_id": df[parcel_col].astype(str).str.strip(),
            "lon": pd.to_numeric(df[lon_col], errors="coerce"),
            "lat": pd.to_numeric(df[lat_col], errors="coerce"),
        }
    )
    return out.drop_duplicates("parcel_id")


def load_predictions(predictions_path: Path) -> pd.DataFrame:
    df = pd.read_csv(predictions_path, dtype=str, low_memory=False)
    rename = {
        "PARCEL_ID": "parcel_id",
        "USE_DESCRIPTION": "use_description",
        "MUNICIPALITY": "municipality",
        "SCHOOL_DISTRICT": "school_district",
        "LAND_AREA_SQFT": "land_area_sqft",
        "BUILDING_AREA_SQFT": "building_area_sqft",
        "CURRENT_ASSESSMENT_LAND": "current_assessment_land",
        "CURRENT_ASSESSMENT_TOTAL": "current_assessment_total",
        "NEW_ASSESSMENT_LAND": "new_assessment_land",
        "NEW_ASSESSMENT_TOTAL": "new_assessment_total",
    }
    df = df.rename(columns=rename)
    # Upstream CSV may ship VALUATION_RATIO; we recompute median-scaled ratio in attach_valuation_ratio.
    df = df.drop(columns=[c for c in ("VALUATION_RATIO", "valuation_ratio") if c in df.columns])
    df = df[df["use_description"].map(lambda u: is_homeowner_use(str(u)))]
    for col in [
        "land_area_sqft",
        "building_area_sqft",
        "current_assessment_land",
        "current_assessment_total",
        "new_assessment_land",
        "new_assessment_total",
    ]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["municipality"] = df["municipality"].str.strip()
    df["value_change_dollars"] = df["new_assessment_total"] - df["current_assessment_total"]
    df["value_change_pct"] = (
        (df["value_change_dollars"] / df["current_assessment_total"].replace(0, pd.NA)) * 100
    )
    return df


def attach_valuation_ratio(df: pd.DataFrame) -> tuple[pd.DataFrame, float]:
    """Median-scaled new/old assessment ratio (1.0 = county median parcel)."""
    work = df.copy()
    cur = work["current_assessment_total"].astype(float)
    new = work["new_assessment_total"].astype(float)
    valid = (cur > 0) & (new > 0)
    assessment_ratio = new / cur.replace(0, pd.NA)
    sorted_ratios = assessment_ratio.loc[valid].sort_values()
    n = len(sorted_ratios)
    if n == 0:
        median_ratio = 1.0
    elif n % 2 == 1:
        median_ratio = float(sorted_ratios.iloc[n // 2])
    else:
        mid = n // 2
        median_ratio = float((sorted_ratios.iloc[mid - 1] + sorted_ratios.iloc[mid]) / 2)
    work["valuation_ratio"] = assessment_ratio / median_ratio
    return work, median_ratio


def valuation_date_from_settings(settings_path: Path | None) -> str:
    """Read OpenAvmKit valuation date from agc_assessments settings.json."""
    if settings_path and settings_path.is_file():
        data = json.loads(settings_path.read_text(encoding="utf-8"))
        meta = data.get("modeling", {}).get("metadata", {})
        if isinstance(meta, dict) and meta.get("valuation_date"):
            return str(meta["valuation_date"])
        if data.get("valuation_date"):
            return str(data["valuation_date"])
    return "2026-01-01"


def write_manifest(
    conn: sqlite3.Connection,
    predictions_path: Path,
    row_count: int,
    assessments_path: Path | None = None,
    *,
    county_median_assessment_ratio: float | None = None,
    settings_path: Path | None = None,
) -> None:
    from datetime import datetime, timezone

    cur = conn.execute(
        """
        SELECT
          AVG(value_change_pct) AS median_proxy,
          SUM(current_assessment_total) AS cur_sum,
          SUM(new_assessment_total) AS new_sum
        FROM parcels
        WHERE current_assessment_total > 0 AND new_assessment_total > 0
        """
    )
    row = cur.fetchone()
    ratio = (row[2] / row[1]) if row and row[1] else None

    manifest = {
        "scenario_id": "openavmkit-homeowner",
        "scenario_label": "Pro-Housing Pittsburgh modeled reassessment (homeowners)",
        "data_as_of": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "source_predictions": str(predictions_path.name),
        "source_assessments": assessments_path.name if assessments_path else None,
        "has_street_addresses": assessments_path is not None,
        "parcel_count": row_count,
        "county_residential_value_ratio": ratio,
        "county_median_assessment_ratio": county_median_assessment_ratio,
        "methodology_url": "https://github.com/prohousingpgh/agc_assessments",
        "valuation_date": valuation_date_from_settings(
            settings_path or DEFAULT_AGC_SETTINGS
        ),
        "disclaimer": "Illustrative estimates only. Not official county reassessment or tax bills.",
    }
    if MILLAGE_PATH.exists():
        mill = json.loads(MILLAGE_PATH.read_text(encoding="utf-8"))
        tax_year = mill.get("tax_year", 2026)
        manifest["tax_year"] = tax_year
        manifest["tax_millage_year"] = tax_year
        manifest["tax_assumptions"] = (
            "See /assumptions for full detail: revenue-neutral millage per taxing body; commercial "
            "growth bands 0% / +20% / +40%; homestead $18,000 (county & municipality) and $43,750 "
            "(Pittsburgh school), scaled after reassessment by county residential value ratio."
        )
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def _homestead_taxable_series(
    assessed: pd.Series, homestead: pd.Series, exclusion: float
) -> pd.Series:
    taxable = assessed.fillna(0).astype(float).copy()
    hom = homestead.fillna("").astype(str).str.strip().str.upper() == "HOM"
    taxable.loc[hom] = (taxable.loc[hom] - exclusion).clip(lower=0)
    return taxable


def _prepare_residential_taxable(df: pd.DataFrame) -> pd.DataFrame:
    """Residential parcel taxable columns for aggregate millage (homestead on file)."""
    work = df.copy()
    fmv_cur = work["current_assessment_total"].astype(float)
    fmv_new = work["new_assessment_total"].astype(float)
    ratio = fmv_new / fmv_cur.replace(0, pd.NA)

    work["local_current"] = work["local_total"].astype(float).fillna(fmv_cur)
    work["local_future"] = work["local_current"] * ratio
    work["county_current"] = work["county_total"].astype(float).fillna(fmv_cur)
    work["county_future"] = work["county_current"] * ratio
    homestead_col = (
        work["homestead_flag"] if "homestead_flag" in work.columns else pd.Series([""] * len(work))
    )
    work["county_taxable_current"] = _homestead_taxable_series(
        work["county_current"], homestead_col, HOMESTEAD_EXCLUSION
    )
    work["county_taxable_future"] = _homestead_taxable_series(
        work["county_future"], homestead_col, HOMESTEAD_EXCLUSION
    )
    work["local_taxable_current"] = _homestead_taxable_series(
        work["local_current"], homestead_col, HOMESTEAD_EXCLUSION
    )
    work["local_taxable_future"] = _homestead_taxable_series(
        work["local_future"], homestead_col, HOMESTEAD_EXCLUSION
    )
    return work


def build_tax_aggregates(
    df: pd.DataFrame, commercial_path: Path | None = None
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Per-jurisdiction revenue-neutral factors; optional commercial valuation scenarios."""
    residential = _prepare_residential_taxable(df)

    if commercial_path and commercial_path.exists():
        commercial = load_commercial_valuations(commercial_path)
        tax_agg_df, scenario_factors = build_scenario_tax_aggregates(residential, commercial)
        baseline = scenario_factors["baseline"]
        json_payload: dict[str, Any] = {
            "default_scenario": "baseline",
            "scenarios": scenario_factors,
            "county": baseline["county"],
            "municipality": baseline["municipality"],
            "school_district": baseline["school_district"],
            "commercial_summary": {
                "parcel_count": int(len(commercial)),
                "current_assessment_total": float(commercial["current_assessment_total"].sum()),
                "source_file": commercial_path.name,
            },
        }
        return tax_agg_df, json_payload

    # Residential-only fallback (no commercial file)
    rows: list[dict[str, object]] = []
    json_factors: dict[str, dict[str, float]] = {
        "county": {},
        "municipality": {},
        "school_district": {},
    }

    def add_group(jtype: str, name_col: str, cur_col: str, fut_col: str) -> None:
        grouped = residential.groupby(name_col, dropna=False).agg(
            current_sum=(cur_col, "sum"),
            future_sum=(fut_col, "sum"),
        )
        for name, row in grouped.iterrows():
            if not name or (isinstance(name, float) and pd.isna(name)):
                continue
            cur = float(row["current_sum"] or 0)
            fut = float(row["future_sum"] or 0)
            factor = revenue_neutral_factor(cur, fut)
            rows.append(
                {
                    "scenario": "baseline",
                    "jurisdiction_type": jtype,
                    "jurisdiction_name": str(name).strip(),
                    "current_taxable_sum": cur,
                    "future_taxable_sum": fut,
                    "revenue_neutral_factor": factor,
                }
            )
            json_factors[jtype][str(name).strip()] = factor

    county_cur = float(residential["county_taxable_current"].sum())
    county_fut = float(residential["county_taxable_future"].sum())
    county_factor = revenue_neutral_factor(county_cur, county_fut)
    rows.append(
        {
            "scenario": "baseline",
            "jurisdiction_type": "county",
            "jurisdiction_name": COUNTY_JURISDICTION_NAME,
            "current_taxable_sum": county_cur,
            "future_taxable_sum": county_fut,
            "revenue_neutral_factor": county_factor,
        }
    )
    json_factors["county"][COUNTY_JURISDICTION_NAME] = county_factor

    add_group("municipality", "municipality", "local_taxable_current", "local_taxable_future")
    add_group("school_district", "school_district", "local_taxable_current", "local_taxable_future")

    json_payload = {
        "default_scenario": "baseline",
        "scenarios": {"baseline": json_factors},
        **json_factors,
    }
    return pd.DataFrame(rows), json_payload


def attach_tax_delta_dollars(conn: sqlite3.Connection) -> None:
    """Baseline-scenario annual tax change ($/yr) for map coloring."""
    from functools import lru_cache

    import api.tax as tax_module
    from api import db as db_module
    from api.tax import compute_property_taxes, map_tax_delta_dollars, set_tax_db_connection
    from api.tax_aggregates import build_revenue_neutral_bases, load_tax_aggregates

    cols = {r[1] for r in conn.execute("PRAGMA table_info(parcels)").fetchall()}
    if "tax_delta_dollars" not in cols:
        conn.execute("ALTER TABLE parcels ADD COLUMN tax_delta_dollars REAL")

    set_tax_db_connection(conn)
    summary = db_module.get_summary_stats(conn)
    tax_module.get_summary_stats = lambda _conn: summary
    aggregates = load_tax_aggregates(conn)

    @lru_cache(maxsize=8192)
    def _cached_revenue_neutral_bases(municipality: str, school_district: str) -> dict:
        return build_revenue_neutral_bases(
            aggregates,
            municipality=municipality or None,
            school_district=school_district or None,
            db=conn,
        )

    def _patched_revenue_neutral_bases(
        _aggregates,
        *,
        municipality=None,
        school_district=None,
        db=None,
    ) -> dict:
        return _cached_revenue_neutral_bases(municipality or "", school_district or "")

    tax_module.build_revenue_neutral_bases = _patched_revenue_neutral_bases

    total = conn.execute("SELECT COUNT(*) FROM parcels").fetchone()[0]
    batch: list[tuple[float | None, str]] = []
    last_rowid = 0
    processed = 0
    while True:
        rows = conn.execute(
            "SELECT rowid, * FROM parcels WHERE rowid > ? ORDER BY rowid LIMIT 5000",
            (last_rowid,),
        ).fetchall()
        if not rows:
            break
        for row in rows:
            last_rowid = row["rowid"]
            parcel = dict(row)
            parcel.pop("rowid", None)
            processed += 1
            try:
                taxes = compute_property_taxes(parcel)
                delta = map_tax_delta_dollars(taxes)
            except Exception:
                delta = None
            batch.append((delta, parcel["parcel_id"]))
            if len(batch) >= 5000:
                conn.executemany(
                    "UPDATE parcels SET tax_delta_dollars = ? WHERE parcel_id = ?",
                    batch,
                )
                conn.commit()
                batch.clear()
                print(f"  tax delta: {processed:,} / {total:,}", file=sys.stderr)
        if batch:
            conn.executemany(
                "UPDATE parcels SET tax_delta_dollars = ? WHERE parcel_id = ?",
                batch,
            )
            conn.commit()
            batch.clear()
            print(f"  tax delta: {processed:,} / {total:,}", file=sys.stderr)
    print(f"Computed tax_delta_dollars for {total:,} parcels", file=sys.stderr)


def build_db(
    predictions_path: Path,
    assessments_path: Path | None,
    db_path: Path,
    commercial_path: Path | None = None,
    centroids_path: Path | None = None,
) -> None:
    preds = load_predictions(predictions_path)

    if assessments_path and assessments_path.exists():
        assessment_fields = load_assessment_fields(assessments_path)
        df = preds.merge(assessment_fields, on="parcel_id", how="left")
    else:
        print("Warning: no --assessments file; address search will be limited.", file=sys.stderr)
        df = preds.copy()
        df["address_display"] = df["municipality"] + " · Parcel " + df["parcel_id"]
        df["address_search"] = df["address_display"].str.lower()

    if centroids_path and centroids_path.exists():
        centroids = load_centroids(centroids_path)
        df = df.merge(centroids, on="parcel_id", how="left")
        matched = int(df["lon"].notna().sum())
        print(f"Matched {matched:,} / {len(df):,} parcels with map centroids")
    elif centroids_path:
        print(f"Warning: centroids file not found at {centroids_path}", file=sys.stderr)

    df = df[df["address_search"].notna() & (df["address_search"] != "")]
    df, county_median_ratio = attach_valuation_ratio(df)

    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    tax_agg_df, tax_agg_json = build_tax_aggregates(df, commercial_path)

    conn = sqlite3.connect(db_path)
    df.to_sql("parcels", conn, index=False, if_exists="replace")
    tax_agg_df.to_sql("tax_jurisdiction_aggregates", conn, index=False, if_exists="replace")

    attach_tax_delta_dollars(conn)

    AGGREGATES_PATH.parent.mkdir(parents=True, exist_ok=True)
    AGGREGATES_PATH.write_text(json.dumps(tax_agg_json, indent=2), encoding="utf-8")

    conn.execute(
        """
        CREATE VIRTUAL TABLE parcels_fts USING fts5(
            address_search,
            municipality,
            school_district,
            parcel_id UNINDEXED
        )
        """
    )
    conn.execute(
        """
        INSERT INTO parcels_fts(address_search, municipality, school_district, parcel_id)
        SELECT address_search, municipality, school_district, parcel_id FROM parcels
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_parcels_id ON parcels(parcel_id)"
    )
    if "lon" in df.columns and "lat" in df.columns:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_parcels_geo ON parcels(lon, lat)"
        )
    conn.commit()

    write_manifest(
        conn,
        predictions_path,
        len(df),
        assessments_path,
        county_median_assessment_ratio=county_median_ratio,
        settings_path=DEFAULT_AGC_SETTINGS if DEFAULT_AGC_SETTINGS.is_file() else None,
    )
    conn.close()
    print(f"Wrote {len(df):,} homeowner parcels to {db_path}")
    scenarios = tax_agg_json.get("scenarios", {})
    print(
        f"Wrote {len(tax_agg_df):,} jurisdiction tax aggregates "
        f"({len(scenarios)} commercial scenario(s))"
    )
    print(f"Wrote manifest to {MANIFEST_PATH}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build homeowner parcel SQLite database")
    parser.add_argument(
        "--predictions",
        type=Path,
        required=True,
        help="residential_predictions.csv from agc_assessments",
    )
    parser.add_argument(
        "--assessments",
        type=Path,
        default=None,
        help="WPRDC property assessments CSV for address fields (recommended)",
    )
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument(
        "--commercial",
        type=Path,
        default=DEFAULT_COMMERCIAL,
        help="Commercial current valuations CSV for revenue-neutral millage scenarios",
    )
    parser.add_argument(
        "--centroids",
        type=Path,
        default=None,
        help="WPRDC parcel centroids CSV (PARID, lon, lat) for the neighborhood map",
    )
    args = parser.parse_args()
    commercial = args.commercial if args.commercial and args.commercial.exists() else None
    if args.commercial and not commercial:
        print(f"Warning: commercial file not found at {args.commercial}", file=sys.stderr)
    centroids = args.centroids if args.centroids and args.centroids.exists() else None
    if args.centroids and not centroids:
        print(f"Warning: centroids file not found at {args.centroids}", file=sys.stderr)
    build_db(args.predictions, args.assessments, args.db, commercial, centroids)


if __name__ == "__main__":
    main()
