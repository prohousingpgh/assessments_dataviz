"""
Download static WPRDC source files used when rebuilding parcels.db.

These rarely change compared to agc_assessments predictions. Store them once on a
GitHub Release tagged sources (see DEPLOY.md), then CI reuses them on each rebuild.

Usage:
  python scripts/fetch_data_sources.py --dest data/sources
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DEST = ROOT / "data" / "sources"
SOURCES_RELEASE_TAG = "sources"


def _run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def fetch_sources_release(dest: Path, tag: str = SOURCES_RELEASE_TAG) -> list[Path]:
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("Set GH_TOKEN or GITHUB_TOKEN.")

    dest.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "gh",
            "release",
            "download",
            tag,
            "--dir",
            str(dest),
            "--clobber",
        ]
    )
    files = sorted(dest.glob("*"))
    if not files:
        raise SystemExit(
            f"No assets in release {tag!r}. Create it once with assessments_wprdc.csv "
            "and parcel_centroids.csv (see DEPLOY.md)."
        )
    for path in files:
        print(f"Fetched {path.name} ({path.stat().st_size / 1_048_576:.1f} MB)")
    return files


def resolve_assessments_path(dest: Path) -> Path | None:
    for name in ("assessments_wprdc.csv", "wprdc_property_assessments.csv"):
        path = dest / name
        if path.is_file():
            return path
    return None


def resolve_centroids_path(dest: Path) -> Path | None:
    for name in ("parcel_centroids.csv", "parcel_centroids_2025_march.csv"):
        path = dest / name
        if path.is_file():
            return path
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch WPRDC source CSVs from sources release")
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST)
    parser.add_argument("--tag", default=SOURCES_RELEASE_TAG)
    args = parser.parse_args()
    fetch_sources_release(args.dest, args.tag)


if __name__ == "__main__":
    main()
