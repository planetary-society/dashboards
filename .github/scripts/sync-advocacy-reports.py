#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

REQUIRED_FIELDS = {
    "member_id",
    "public_filename",
    "source_html_path",
    "state",
    "district",
    "chamber",
    "party",
    "display_name",
    "sort_name",
    "updated_at",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync advocacy report HTML files into docs/sentiment."
    )
    parser.add_argument(
        "--source-root", required=True, help="Checked-out source repository root."
    )
    parser.add_argument(
        "--manifest",
        required=True,
        help="Manifest path relative to the source root.",
    )
    parser.add_argument(
        "--dest", required=True, help="Destination directory for public HTML files."
    )
    parser.add_argument(
        "--dest-manifest",
        required=True,
        help="Destination manifest path in the dashboards repo.",
    )
    return parser.parse_args()


def load_manifest(source_root: Path, manifest_path: str) -> dict:
    path = source_root / manifest_path
    if not path.exists():
        raise SystemExit(f"Missing source manifest: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("entries")
    if not isinstance(entries, list):
        raise SystemExit("Manifest must contain an entries list")
    return payload


def validate_entry(entry: dict, seen: dict[str, str]) -> None:
    missing = sorted(field for field in REQUIRED_FIELDS if field not in entry)
    if missing:
        raise SystemExit(f"Manifest entry missing required fields: {missing}")
    filename = entry["public_filename"]
    if (
        not isinstance(filename, str)
        or not filename.endswith(".html")
        or "/" in filename
        or "\\" in filename
    ):
        raise SystemExit(f"Invalid public_filename: {filename!r}")
    existing = seen.get(filename)
    if existing and existing != entry["member_id"]:
        raise SystemExit(
            f"Duplicate public_filename {filename!r} for {existing} and {entry['member_id']}"
        )
    seen[filename] = entry["member_id"]


def sync_reports(
    source_root: Path, manifest: dict, dest_dir: Path, dest_manifest: Path
) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_manifest.parent.mkdir(parents=True, exist_ok=True)

    seen: dict[str, str] = {}
    expected_filenames: set[str] = set()

    for entry in manifest["entries"]:
        validate_entry(entry, seen)
        source_path = source_root / entry["source_html_path"]
        if not source_path.exists():
            raise SystemExit(f"Missing source HTML file: {source_path}")
        dest_path = dest_dir / entry["public_filename"]
        shutil.copy2(source_path, dest_path)
        expected_filenames.add(entry["public_filename"])

    for stale_path in dest_dir.glob("*.html"):
        if stale_path.name not in expected_filenames:
            stale_path.unlink()

    dest_manifest.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    args = parse_args()
    source_root = Path(args.source_root).resolve()
    manifest = load_manifest(source_root, args.manifest)
    sync_reports(source_root, manifest, Path(args.dest), Path(args.dest_manifest))


if __name__ == "__main__":
    main()
