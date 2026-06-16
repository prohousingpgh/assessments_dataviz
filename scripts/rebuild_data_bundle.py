"""
Rebuild runtime data from agc_assessments output + WPRDC source files.

Downloads fresh predictions from agc_assessments/output/, refreshes proposed
school homestead exclusions, rebuilds parcels.db, and writes data/data-bundle.zip.
County base growth (slider midpoint, map center) is recomputed automatically in
the new database.

Usage:
  python scripts/rebuild_data_bundle.py
  python scripts/rebuild_data_bundle.py --skip-fetch   # use existing data/upstream/agc
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
AGC_DEST = DATA_DIR / "upstream" / "agc"
SOURCES_DEST = DATA_DIR / "sources"
STATE_PATH = ROOT / ".github" / "data-sync-state.json"


def _run(cmd: list[str], *, env: dict[str, str] | None = None) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True, cwd=ROOT, env=env)


def _env_with_token(token: str | None) -> dict[str, str]:
    import os

    merged = os.environ.copy()
    if token:
        merged["GH_TOKEN"] = token
    return merged


def _agc_token() -> str | None:
    import os

    return os.environ.get("AGC_ASSESSMENTS_TOKEN") or os.environ.get("GH_TOKEN") or os.environ.get(
        "GITHUB_TOKEN"
    )


def _repo_token() -> str | None:
    import os

    return os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")


def main() -> None:
    parser = argparse.ArgumentParser(description="Rebuild data bundle from upstream sources")
    parser.add_argument("--skip-fetch", action="store_true", help="Use existing upstream files")
    parser.add_argument("--agc-ref", default="main", help="agc_assessments git ref")
    parser.add_argument(
        "--assessments",
        type=Path,
        default=None,
        help="WPRDC assessments CSV (default: data/sources/assessments_wprdc.csv)",
    )
    parser.add_argument(
        "--centroids",
        type=Path,
        default=None,
        help="Parcel centroids CSV (default: data/sources/parcel_centroids.csv)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DATA_DIR / "data-bundle.zip",
    )
    parser.add_argument(
        "--sptra-workbook",
        type=Path,
        default=SOURCES_DEST / "2026-27sptra.xlsx",
        help="PA property tax relief allocation workbook cache path",
    )
    args = parser.parse_args()

    if not args.skip_fetch:
        _run(
            [sys.executable, "scripts/fetch_agc_output.py", "--dest", str(AGC_DEST), "--ref", args.agc_ref],
            env=_env_with_token(_agc_token()),
        )
        try:
            _run(
                [sys.executable, "scripts/fetch_data_sources.py", "--dest", str(SOURCES_DEST)],
                env=_env_with_token(_repo_token()),
            )
        except subprocess.CalledProcessError:
            print(
                "Warning: sources release not found; continuing if data/sources/ already has CSVs.",
                file=sys.stderr,
            )

    predictions = AGC_DEST / "residential_predictions.csv"
    if not predictions.is_file():
        raise SystemExit(f"Missing {predictions}. Run fetch_agc_output.py first.")

    commercial = AGC_DEST / "commercial_existing_valuations.csv"
    assessments = args.assessments
    if assessments is None:
        for candidate in (
            SOURCES_DEST / "assessments_wprdc.csv",
            SOURCES_DEST / "wprdc_property_assessments.csv",
            DATA_DIR / "assessments_wprdc.csv",
        ):
            if candidate.is_file():
                assessments = candidate
                break
    if assessments is None or not assessments.is_file():
        raise SystemExit(
            "WPRDC assessments CSV not found. Add data/sources/assessments_wprdc.csv locally "
            "or publish a GitHub Release tagged 'sources' (see DEPLOY.md)."
        )

    _run(
        [
            sys.executable,
            "scripts/update_school_homestead_exclusions.py",
            "--assessments",
            str(assessments),
            "--workbook",
            str(args.sptra_workbook),
        ]
    )

    centroids = args.centroids
    if centroids is None:
        for candidate in (
            SOURCES_DEST / "parcel_centroids.csv",
            SOURCES_DEST / "parcel_centroids_2025_march.csv",
            DATA_DIR / "parcel_centroids.csv",
        ):
            if candidate.is_file():
                centroids = candidate
                break

    build_cmd = [
        sys.executable,
        "scripts/build_db.py",
        "--predictions",
        str(predictions),
        "--assessments",
        str(assessments),
        "--db",
        str(DATA_DIR / "parcels.db"),
    ]
    if commercial.is_file():
        build_cmd.extend(["--commercial", str(commercial)])
    if centroids and centroids.is_file():
        build_cmd.extend(["--centroids", str(centroids)])
    _run(build_cmd)

    _run([sys.executable, "scripts/verify_data.py"])
    _run([sys.executable, "scripts/package_data.py", "--output", str(args.output)])

    # Record upstream SHA for change detection in CI.
    sha = subprocess.check_output(
        [sys.executable, "scripts/fetch_agc_output.py", "--print-sha", "--ref", args.agc_ref],
        text=True,
        cwd=ROOT,
        env=_env_with_token(_agc_token()),
    ).strip()
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(
        json.dumps(
            {
                "agc_predictions_sha": sha,
                "agc_ref": args.agc_ref,
                "last_rebuild_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "predictions_file": predictions.name,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote sync state to {STATE_PATH}")
    print(f"Bundle ready: {args.output}")


if __name__ == "__main__":
    main()
