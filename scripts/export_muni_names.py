import sqlite3
from pathlib import Path

c = sqlite3.connect(Path(__file__).parents[1] / "data" / "parcels.db")
rows = c.execute("SELECT DISTINCT municipality, school_district FROM parcels ORDER BY municipality").fetchall()
for m, s in rows:
    print(f"{m!r}\t{s!r}")
print("count", len(rows))
c.close()
