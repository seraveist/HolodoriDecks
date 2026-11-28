#!/usr/bin/env python3
"""Reconcile the revision served by Pages with the current main commit."""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

PRODUCTION_URL = "https://holosims.net/"


def github_api(path: str, *, method: str = "GET", payload: dict | None = None):
    command = ["gh", "api", "--method", method, path]
    if payload is not None:
        command += ["--input", "-"]
    result = subprocess.run(
        command, input=json.dumps(payload) if payload is not None else None,
        text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout) if result.stdout.strip() else None


def production_revision() -> str | None:
    request = Request(f"{PRODUCTION_URL}?deployment-check={time.time_ns()}",
                      headers={"Cache-Control": "no-cache", "User-Agent": "HolodoriDeckSim deployment check"})
    try:
        with urlopen(request, timeout=12) as response:
            html = response.read(256 * 1024)
    except (URLError, TimeoutError) as error:
        print(f"::warning::Could not verify the live Pages revision: {error}")
        return None
    marker = re.search(rb'data-card-asset-revision="([0-9a-f]{40})"', html)
    return marker.group(1).decode("ascii") if marker else None


def ensure_pages_deployment(repository: str, *, api=github_api, observe=production_revision) -> dict:
    prefix = f"repos/{repository}"
    head = api(f"{prefix}/commits/main")["sha"]
    live = observe()
    result = {"dispatched": False, "head_sha": head, "live_sha": live}
    if live == head:
        return {**result, "reason": "already-deployed"}
    runs = api(f"{prefix}/actions/workflows/pages.yml/runs?branch=main&head_sha={head}")["workflow_runs"]
    if any(run["head_sha"] == head and run["status"] != "completed" for run in runs):
        return {**result, "reason": "deployment-active"}
    api(f"{prefix}/actions/workflows/pages.yml/dispatches", method="POST", payload={"ref": "main"})
    return {**result, "dispatched": True, "reason": "deployment-needed"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY"))
    args = parser.parse_args()
    if not args.repo:
        parser.error("--repo or GITHUB_REPOSITORY is required")
    result = ensure_pages_deployment(args.repo)
    print(json.dumps(result))
    if output := os.environ.get("GITHUB_OUTPUT"):
        with open(output, "a", encoding="utf-8") as stream:
            stream.write(f"dispatched={str(result['dispatched']).lower()}\n")


if __name__ == "__main__":
    main()
