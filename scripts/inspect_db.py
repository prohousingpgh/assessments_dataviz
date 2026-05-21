import sqlite3
from pathlib import Path

conn = sqlite3.connect(Path(__file__).parents[1] / "data" / "parcels.db")
print("Sample address_display values:")
for r in conn.execute("SELECT parcel_id, address_display FROM parcels LIMIT 6"):
    print(" ", r)
for term in ("shawnee", "center st", "412", "pittsburgh ward"):
    n = conn.execute(
        "SELECT count(*) FROM parcels WHERE address_search LIKE ?", (f"%{term}%",)
    ).fetchone()[0]
    print(f"Rows matching '{term}': {n}")
print("Shawnee samples:")
for r in conn.execute(
    "SELECT address_display, municipality FROM parcels WHERE address_search LIKE '%shawnee%' LIMIT 5"
):
    print(" ", r)
print(
    "Millvale + shawnee count:",
    conn.execute(
        "SELECT count(*) FROM parcels WHERE address_search LIKE '%shawnee%' AND municipality LIKE '%illvale%'"
    ).fetchone()[0],
)
conn.close()
