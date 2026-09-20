#!/usr/bin/env python3
"""Reuse only successful recommendation-inventory checks for identical Git inputs.

All tracked files, including workflows and this policy, belong to the input key.
Only portrait WebPs and their two provenance files are excluded: Pages still runs
its data, Python and browser checks for those changes. Missing or unusable proof
always leaves the expensive inventory regression enabled.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import time
import zipfile


SCHEMA = 1
SUITE = "recommendation-inventories-v1"
PROOF_FILE = "recommendation-validation.json"
WORKFLOWS = {
    ".github/workflows/validate.yml",
    ".github/workflows/pages.yml",
    # validate.yml is also called on the exact generated candidate by Master sync.
    ".github/workflows/sync-master-data.yml",
}
PORTRAITS = re.compile(r"assets/(?:cards|characters)/[^/]+\.webp\Z")
PROVENANCE = {"assets/card-portrait-sync.json", "assets/character-portrait-sync.json"}


def fingerprint(tree: bytes) -> str:
    entries = []
    for entry in tree.split(b"\0"):
        if not entry:
            continue
        metadata, path_bytes = entry.split(b"\t", 1)
        mode, kind, oid = metadata.decode("ascii").split()
        path = path_bytes.decode("utf-8")
        if mode == "100644" and kind == "blob" and (PORTRAITS.fullmatch(path) or path in PROVENANCE):
            continue
        if not re.fullmatch(r"[0-9a-f]{40}", oid):
            raise ValueError("Invalid Git object identity")
        entries.append(entry)
    if not entries:
        raise ValueError("Empty validation input tree")
    return hashlib.sha256(SUITE.encode() + b"\0" + b"\0".join(sorted(entries))).hexdigest()


def capture(root: Path, environ=os.environ) -> dict:
    def git(*args):
        return subprocess.run(
            ["git", "-c", f"safe.directory={root.resolve().as_posix()}", *args], cwd=root,
            check=True, capture_output=True, timeout=15,
        ).stdout

    # Capture before any build/test mutates generated files. Never certify an
    # edited checkout using the old committed tree (also protects local use).
    if git("status", "--porcelain", "--untracked-files=normal").strip():
        raise ValueError("Validation proof requires a clean checkout")
    return {
        "schema": SCHEMA, "suite": SUITE,
        "fingerprint": fingerprint(git("ls-tree", "-rz", "--full-tree", "HEAD")),
        "tested_sha": git("rev-parse", "HEAD").decode().strip(),
        "repository": environ.get("GITHUB_REPOSITORY", ""),
        "run_id": environ.get("GITHUB_RUN_ID", ""),
        "run_attempt": environ.get("GITHUB_RUN_ATTEMPT", ""),
    }


def github_api(path: str, *, raw=False, timeout=15):
    result = subprocess.run(
        ["gh", "api", path], capture_output=True, check=True, timeout=timeout,
    )
    return result.stdout if raw else json.loads(result.stdout)


def read_proof(archive: bytes) -> dict:
    if len(archive) > 65536:
        raise ValueError("Oversized proof archive")
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        if zipped.namelist() != [PROOF_FILE] or zipped.getinfo(PROOF_FILE).file_size > 16384:
            raise ValueError("Unexpected proof archive contents")
        return json.loads(zipped.read(PROOF_FILE))


def find_proof(current: dict, *, api=None) -> dict:
    if api is None:
        deadline = time.monotonic() + 20

        def api(path, **kwargs):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Proof lookup time budget exhausted")
            return github_api(path, timeout=min(15, remaining), **kwargs)

    fallback = {"reuse": False, "reason": "no-successful-matching-proof"}
    repository = current["repository"]
    name = f"{SUITE}-{current['fingerprint']}"
    prefix = f"repos/{repository}"
    try:
        artifacts = api(f"{prefix}/actions/artifacts?name={name}&per_page=20")["artifacts"]
        for artifact in artifacts[:20]:
            if artifact.get("expired") or artifact.get("name") != name:
                continue
            run_id = artifact["workflow_run"]["id"]
            if str(run_id) == current["run_id"]:
                continue
            run = api(f"{prefix}/actions/runs/{int(run_id)}")
            if (run.get("status") != "completed" or run.get("conclusion") != "success"
                or run.get("path") not in WORKFLOWS
                or run.get("repository", {}).get("full_name") != repository
                or run.get("head_repository", {}).get("full_name") != repository):
                continue
            # Read only a bounded JSON member; never extract an artifact to disk.
            proof = read_proof(api(f"{prefix}/actions/artifacts/{int(artifact['id'])}/zip", raw=True))
            if (not isinstance(proof, dict)
                or any(proof.get(key) != current[key] for key in ("schema", "suite", "fingerprint", "repository"))
                or str(proof.get("run_id")) != str(run_id)
                or str(proof.get("run_attempt")) != str(run["run_attempt"])
                or not re.fullmatch(r"[0-9a-f]{40}", str(proof.get("tested_sha", "")))):
                continue
            return {"reuse": True, "reason": "successful-matching-proof", "source_run": run_id,
                    "tested_sha": proof["tested_sha"]}
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError, zipfile.BadZipFile):
        # An unavailable API, expired artifact or schema change is not a deploy
        # failure: run the real test instead. Do not print gh stderr/tokens.
        return {"reuse": False, "reason": "proof-unavailable"}
    return fallback


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lookup", action="store_true", help="Check previous successful CI runs")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    args = parser.parse_args()
    result = {"reuse": False, "reason": "full-validation"}
    current = None
    try:
        current = capture(args.root)
        output = args.root / ".local" / PROOF_FILE
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")
        if args.lookup:
            result = find_proof(current)
    except (OSError, subprocess.SubprocessError, ValueError):
        result = {"reuse": False, "reason": "input-capture-unavailable"}
        current = None
    print(json.dumps(result))
    if target := os.environ.get("GITHUB_OUTPUT"):
        with open(target, "a", encoding="utf-8") as stream:
            stream.write(f"reuse={str(result['reuse']).lower()}\n")
            if current:
                stream.write(f"fingerprint={current['fingerprint']}\n")
    if target := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(target, "a", encoding="utf-8") as stream:
            stream.write(f"Recommendation inventory check: {'reuse' if result['reuse'] else 'run'} "
                         f"({result['reason']}).\n")
            if result.get("source_run"):
                stream.write(f"Verified run: {result['source_run']}; tested commit: {result['tested_sha']}.\n")


if __name__ == "__main__":
    main()
