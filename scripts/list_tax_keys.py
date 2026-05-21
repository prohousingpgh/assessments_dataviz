import sqlite3
from pathlib import Path

c = sqlite3.connect(Path(__file__).parents[1] / "data" / "parcels.db")
print("Municipalities sample:", c.execute("SELECT DISTINCT municipality FROM parcels ORDER BY municipality LIMIT 30").fetchall())
print("School districts:", c.execute("SELECT DISTINCT school_district FROM parcels ORDER BY school_district").fetchall())
c.close()
