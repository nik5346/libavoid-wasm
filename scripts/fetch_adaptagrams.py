#!/usr/bin/env python3
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
VENDOR_DIR = ROOT_DIR / "third_party" / "adaptagrams"
ADAPTAGRAMS_REPO = os.environ.get("ADAPTAGRAMS_REPO", "https://github.com/mjwybrow/adaptagrams.git")
ADAPTAGRAMS_REF = os.environ.get("ADAPTAGRAMS_REF", "master")


def run(cmd, *args, check=True):
    result = subprocess.run([cmd, *args], check=False)
    if check and result.returncode != 0:
        sys.exit(result.returncode)
    return result.returncode


if (VENDOR_DIR / ".git").exists():
    print(f"adaptagrams already present at {VENDOR_DIR}, fetching ref {ADAPTAGRAMS_REF}...")
    run("git", "-C", str(VENDOR_DIR), "fetch", "--depth", "1", "origin", ADAPTAGRAMS_REF)
    run("git", "-C", str(VENDOR_DIR), "checkout", "FETCH_HEAD")
else:
    print(f"cloning adaptagrams ({ADAPTAGRAMS_REF}) into {VENDOR_DIR}...")
    if VENDOR_DIR.exists():
        shutil.rmtree(VENDOR_DIR)
    VENDOR_DIR.parent.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        ["git", "clone", "--depth", "1", "--branch", ADAPTAGRAMS_REF, ADAPTAGRAMS_REPO, str(VENDOR_DIR)],
        check=False,
    )
    if result.returncode != 0:
        run("git", "clone", ADAPTAGRAMS_REPO, str(VENDOR_DIR))
        run("git", "-C", str(VENDOR_DIR), "checkout", ADAPTAGRAMS_REF)

print(f"adaptagrams source ready at {VENDOR_DIR}")
print(f"libavoid sources: {VENDOR_DIR / 'cola' / 'libavoid'}")
