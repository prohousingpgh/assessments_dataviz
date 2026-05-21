"""Verify revenue-neutral tax math for a jurisdiction."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import sqlite3

from api.tax import compute_property_taxes, set_tax_db_connection

conn = sqlite3.connect(ROOT / "data" / "parcels.db")
conn.row_factory = sqlite3.Row
set_tax_db_connection(conn)

agg = json.loads((ROOT / "data" / "tax_aggregates.json").read_text())
for name in ("PITTSBURGH", "Millvale", "Mt.Lebanon"):
    factor = agg["municipality"].get(name)
    row = conn.execute(
        "SELECT current_taxable_sum, future_taxable_sum, revenue_neutral_factor FROM tax_jurisdiction_aggregates WHERE jurisdiction_type='municipality' AND jurisdiction_name=?",
        (name,),
    ).fetchone()
    print(f"\n{name}: factor={factor:.6f} db={row[2]:.6f} value ratio={row[0]/row[1]:.6f}")

    rows = conn.execute(
        "SELECT * FROM parcels WHERE municipality = ?", (name,)
    ).fetchall()
    cur_sum = 0.0
    fut_sum = 0.0
    for r in rows:
        t = compute_property_taxes(dict(r))
        cur_sum += t["current"]["municipality"]["annual_tax"]
        fut_sum += t["future"]["municipality"]["annual_tax"]
    print(f"  ALL {len(rows)} parcels: current={cur_sum:,.2f} future={fut_sum:,.2f} ratio={fut_sum/cur_sum:.6f}")

conn.close()
