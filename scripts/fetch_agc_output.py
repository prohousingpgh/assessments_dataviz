"""
Download output/ artifacts from prohousingpgh/agc_assessments.

Usage:
  python scripts/fetch_agc_output.py
  python scripts/fetch_agc_output.py --dest data/upstream/agc --ref main
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

DEFAULT_REPO = "prohousingpgh/agc_assessments"
DEFAULT_REF = "main"
DEFAULT_DEST = Path(__file__).resolve().parents[1] / "data" / "upstream" / "agc"
OUTPUT_DIR = "output"


def _gh_api(path: str, token: str) -> bytes:
    url = f"https://api.github.com{path}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def _download_raw(repo: str, ref: str, path: str, dest: Path, token: str) -> None:
    url = f"https://api.github.com/repos/{repo}/contents/{path}?ref={ref}"
    payload = json.loads(_gh_api(url.replace("https://api.github.com", ""), token))
    if not isinstance(payload, dict) or payload.get("encoding") != "base64":
        raise RuntimeError(f"Unexpected GitHub contents response for {path}")

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(base64.b64decode(payload["content"].replace("\n", "")))


def list_output_files(repo: str, ref: str, token: str) -> list[str]:
    path = f"/repos/{repo}/contents/{OUTPUT_DIR}?ref={ref}"
    payload = json.loads(_gh_api(path, token))
    if not isinstance(payload, list):
        raise RuntimeError(f"No {OUTPUT_DIR}/ directory at {repo}@{ref}")
    return [item["name"] for item in payload if item.get("type") == "file"]


def fetch_output(
    *,
    repo: str = DEFAULT_REPO,
    ref: str = DEFAULT_REF,
    dest: Path = DEFAULT_DEST,
    token: str | None = None,
) -> list[Path]:
    token = token or os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("Set GH_TOKEN or GITHUB_TOKEN to download from GitHub.")

    dest.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for name in sorted(list_output_files(repo, ref, token)):
        out = dest / name
        _download_raw(repo, ref, f"{OUTPUT_DIR}/{name}", out, token)
        written.append(out)
        print(f"Fetched {name} ({out.stat().st_size / 1_048_576:.1f} MB)")
    return written


def predictions_sha(repo: str, ref: str, token: str | None = None) -> str:
    """Git blob SHA for output/residential_predictions.csv (change detection)."""
    token = token or os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("Set GH_TOKEN or GITHUB_TOKEN.")
    path = f"/repos/{repo}/contents/{OUTPUT_DIR}/residential_predictions.csv?ref={ref}"
    payload = json.loads(_gh_api(path, token))
    return str(payload["sha"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch agc_assessments output/ files")
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--ref", default=DEFAULT_REF)
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST)
    parser.add_argument("--print-sha", action="store_true", help="Print predictions file SHA and exit")
    args = parser.parse_args()

    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if args.print_sha:
        print(predictions_sha(args.repo, args.ref, token))
        return

    files = fetch_output(repo=args.repo, ref=args.ref, dest=args.dest, token=token)
    if not any(p.name == "residential_predictions.csv" for p in files):
        raise SystemExit("residential_predictions.csv missing from agc_assessments output/")


if __name__ == "__main__":
    main()
