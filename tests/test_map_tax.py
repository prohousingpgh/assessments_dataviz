"""Tax-change map config and on-the-fly delta fallback."""

from __future__ import annotations

import sqlite3
import unittest
from pathlib import Path

from api.map_data import (
    clear_map_data_cache,
    map_tax_config,
    map_tax_hexbins_geojson,
    map_tax_parcel_feature,
    map_tax_parcels_geojson,
)
from api.tax import (
    compute_map_tax_delta,
    compute_property_taxes,
    map_tax_delta_dollars,
    prepare_map_tax_context,
    set_tax_db_connection,
)
from api.tax_aggregates import clear_aggregate_cache

ROOT = Path(__file__).resolve().parents[1]
LIVE_DB = ROOT / "data" / "parcels.db"


def _memory_conn(*column_sql: str) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    cols = ", ".join(column_sql)
    conn.execute(f"CREATE TABLE parcels ({cols})")
    return conn


class TaxMapConfigTests(unittest.TestCase):
    def setUp(self) -> None:
        clear_map_data_cache()
        clear_aggregate_cache()

    def test_unavailable_without_centroids(self) -> None:
        conn = _memory_conn("parcel_id TEXT", "current_assessment_total REAL")
        conn.execute("INSERT INTO parcels VALUES ('p1', 100000)")
        config = map_tax_config(conn)
        self.assertEqual(config["mode"], "unavailable")
        self.assertFalse(config["tax_delta_precomputed"])

    def test_points_mode_without_precomputed_column(self) -> None:
        conn = _memory_conn(
            "parcel_id TEXT",
            "lon REAL",
            "lat REAL",
            "current_assessment_total REAL",
        )
        conn.execute("INSERT INTO parcels VALUES ('p1', -80.0, 40.4, 100000)")
        config = map_tax_config(conn)
        self.assertEqual(config["mode"], "points")
        self.assertFalse(config["tax_delta_precomputed"])
        self.assertIsNone(config["pmtiles_url"])

    def test_points_mode_with_precomputed_column(self) -> None:
        conn = _memory_conn(
            "parcel_id TEXT",
            "lon REAL",
            "lat REAL",
            "tax_delta_dollars REAL",
        )
        conn.execute("INSERT INTO parcels VALUES ('p1', -80.0, 40.4, 120.5)")
        config = map_tax_config(conn)
        self.assertEqual(config["mode"], "points")
        self.assertTrue(config["tax_delta_precomputed"])


class TaxMapComputeTests(unittest.TestCase):
    def setUp(self) -> None:
        clear_map_data_cache()
        clear_aggregate_cache()

    def test_on_the_fly_parcel_sample_returns_deltas(self) -> None:
        conn = _memory_conn(
            "parcel_id TEXT",
            "lon REAL",
            "lat REAL",
            "address_display TEXT",
            "municipality TEXT",
            "school_district TEXT",
            "current_assessment_total REAL",
            "new_assessment_total REAL",
            "county_total REAL",
            "local_total REAL",
            "homestead_flag TEXT",
            "current_assessment_land REAL",
            "new_assessment_land REAL",
            "value_change_pct REAL",
        )
        conn.execute(
            """
            INSERT INTO parcels VALUES (
              'p-pgh', -80.0, 40.44, '1 Test St', 'PITTSBURGH', 'PITTSBURGH',
              100000, 200000, 100000, 100000, 'HOM', 20000, 40000, 100
            )
            """
        )
        payload = map_tax_parcels_geojson(
            conn, west=-80.2, south=40.3, east=-79.8, north=40.6, limit=10, zoom=12
        )
        self.assertGreater(len(payload["features"]), 0)
        delta = payload["features"][0]["properties"]["tax_delta_dollars"]
        self.assertIsInstance(delta, float)
        hexbins = map_tax_hexbins_geojson(conn, hex_size_deg=0.006, min_count=8)
        self.assertEqual(hexbins["features"], [])

    def test_compute_matches_parcel_page_helper(self) -> None:
        conn = _memory_conn(
            "parcel_id TEXT",
            "current_assessment_total REAL",
            "new_assessment_total REAL",
            "county_total REAL",
            "local_total REAL",
            "homestead_flag TEXT",
            "municipality TEXT",
            "school_district TEXT",
            "current_assessment_land REAL",
            "new_assessment_land REAL",
            "value_change_pct REAL",
        )
        conn.execute(
            """
            INSERT INTO parcels VALUES (
              'p-pgh', 80000, 180000, 80000, 80000, 'HOM',
              'PITTSBURGH', 'PITTSBURGH', 25000, 40000, 125
            )
            """
        )
        conn.execute(
            """
            INSERT INTO parcels VALUES (
              'p-mck', 50000, 90000, 50000, 50000, '',
              'MCKEESPORT', 'McKeesport Area', 15000, 20000, 80
            )
            """
        )
        set_tax_db_connection(conn)
        try:
            ctx = prepare_map_tax_context(conn)
            for parcel_id in ("p-pgh", "p-mck"):
                parcel = dict(
                    conn.execute(
                        "SELECT * FROM parcels WHERE parcel_id = ?", (parcel_id,)
                    ).fetchone()
                )
                expected = map_tax_delta_dollars(compute_property_taxes(parcel))
                got = compute_map_tax_delta(parcel, ctx)
                self.assertEqual(got, expected, parcel_id)
        finally:
            set_tax_db_connection(None)

    @unittest.skipUnless(LIVE_DB.is_file(), "runtime parcels.db not present")
    def test_live_bundle_tax_config_and_known_parcels(self) -> None:
        conn = sqlite3.connect(f"file:{LIVE_DB}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            config = map_tax_config(conn)
            self.assertEqual(config["mode"], "points")
            self.assertFalse(config["tax_delta_precomputed"])

            feature = map_tax_parcel_feature(conn, "0381J00137000000")
            self.assertIsNotNone(feature)
            assert feature is not None
            self.assertIsInstance(feature["properties"]["tax_delta_dollars"], float)

            set_tax_db_connection(conn)
            try:
                ctx = prepare_map_tax_context(conn)
                for parcel_id in ("0381J00137000000", "0129J00032000000"):
                    row = conn.execute(
                        "SELECT * FROM parcels WHERE parcel_id = ?", (parcel_id,)
                    ).fetchone()
                    if row is None:
                        continue
                    parcel = dict(row)
                    expected = map_tax_delta_dollars(compute_property_taxes(parcel))
                    got = compute_map_tax_delta(parcel, ctx)
                    self.assertEqual(got, expected, parcel_id)
            finally:
                set_tax_db_connection(None)
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()
