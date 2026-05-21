"""Verify revenue-neutral factors hold aggregate receipts constant per taxing body."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import sqlite3

from api.tax import compute_property_taxes, set_tax_db_connection

MILLAGE_PATH = ROOT / "data" / "millage_2025.json"


def _load_county_mills() -> float:
    return float(json.loads(MILLAGE_PATH.read_text(encoding="utf-8"))["county_mills"])


def _aggregate_receipts(
    current_sum: float, future_sum: float, nominal_mills: float, factor: float
) -> tuple[float, float]:
    before = current_sum * nominal_mills / 1000.0
    after = future_sum * nominal_mills * factor / 1000.0
    return before, after


def main() -> None:
    conn = sqlite3.connect(ROOT / "data" / "parcels.db")
    conn.row_factory = sqlite3.Row
    set_tax_db_connection(conn)
    county_mills = _load_county_mills()
    millage = json.loads(MILLAGE_PATH.read_text(encoding="utf-8"))
    muni_mills = millage.get("municipality_mills", {})

    rows = conn.execute(
        """
        SELECT scenario, jurisdiction_type, jurisdiction_name,
               current_taxable_sum, future_taxable_sum, revenue_neutral_factor
        FROM tax_jurisdiction_aggregates
        WHERE scenario = 'baseline'
        ORDER BY jurisdiction_type, jurisdiction_name
        """
    ).fetchall()

    print("Per taxing body (baseline scenario): receipts before vs after at aggregate level")
    print("-" * 72)
    max_err = 0.0
    for row in rows:
        jtype = row["jurisdiction_type"]
        name = row["jurisdiction_name"]
        cur = float(row["current_taxable_sum"])
        fut = float(row["future_taxable_sum"])
        factor = float(row["revenue_neutral_factor"])
        if jtype == "county":
            nominal = county_mills
        elif jtype == "municipality":
            nominal = float(muni_mills.get(name, 0))
        else:
            nominal = float(millage.get("school_mills", {}).get(name, 0))
        if nominal <= 0:
            continue
        before, after = _aggregate_receipts(cur, fut, nominal, factor)
        err = abs(before - after)
        max_err = max(max_err, err)
        if err > 1.0:
            print(f"{jtype:16} {name[:28]:28}  before={before:,.0f}  after={after:,.0f}  err=${err:,.2f}")

    print(f"\nMax aggregate receipt error (all jurisdictions): ${max_err:,.2f}")
    print("(Should be ~$0; small float drift only.)")

    name = "PITTSBURGH"
    factor_row = conn.execute(
        """
        SELECT revenue_neutral_factor FROM tax_jurisdiction_aggregates
        WHERE scenario='baseline' AND jurisdiction_type='municipality' AND jurisdiction_name=?
        """,
        (name,),
    ).fetchone()
    factor = float(factor_row[0])
    parcel_rows = conn.execute("SELECT * FROM parcels WHERE municipality = ?", (name,)).fetchall()
    cur_sum = 0.0
    fut_sum = 0.0
    for r in parcel_rows:
        t = compute_property_taxes(dict(r))
        cur_sum += t["current"]["municipality"]["annual_tax"]
        fut_sum += t["future"]["municipality"]["annual_tax"]
    print(f"\n{name} parcel-sum check ({len(parcel_rows)} homes):")
    print(f"  sum(current muni tax) = {cur_sum:,.2f}")
    print(f"  sum(future muni tax)  = {fut_sum:,.2f}")
    print(f"  ratio future/current  = {fut_sum / cur_sum:.4f}" if cur_sum else "  (no current tax)")
    print(f"  stored factor         = {factor:.6f}")
    print("  (Individual parcels vary; jurisdiction total should be ~revenue-neutral.)")

    conn.close()


if __name__ == "__main__":
    main()
