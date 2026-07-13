#!/usr/bin/env python3
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_EMSDK_DIR = (ROOT_DIR / "emsdk").resolve()

for env_var in ("EMSDK_DIR", "EMSDK_ROOT", "EMSDK"):
    env_value = os.environ.get(env_var)
    if env_value:
        candidate = Path(env_value).expanduser().resolve()
        if candidate.exists() and ((candidate / "emsdk.bat").exists() or (candidate / "emsdk").exists()):
            DEFAULT_EMSDK_DIR = candidate
            break


def run(cmd, cwd=None):
    print("$", " ".join(str(part) for part in cmd), file=sys.stderr)
    result = subprocess.run(cmd, cwd=cwd, check=False)
    if result.returncode != 0:
        sys.exit(result.returncode)


def find_emcc(emsdk_dir: Path):
    candidates = []
    if os.name == "nt":
        suffixes = ["", ".bat", ".cmd", ".exe"]
    else:
        suffixes = [""]

    search_roots = [
        emsdk_dir / "upstream" / "emscripten",
        emsdk_dir / "upstream" / "emscripten" / "incoming",
        emsdk_dir / "upstream" / "emscripten" / "latest",
        emsdk_dir / "emscripten",
    ]
    for root in search_roots:
        for name in ["emcc", "emcc.py"]:
            for suffix in suffixes:
                candidate = root / f"{name}{suffix}"
                if candidate.exists():
                    return candidate

    for candidate in emsdk_dir.rglob("emcc*"):
        if candidate.is_file() and not candidate.name.endswith((".js", ".pyc")):
            return candidate

    return None


def ensure_emscripten():
    emcc_from_path = shutil.which("emcc")
    if emcc_from_path:
        return emcc_from_path

    emsdk_dir = DEFAULT_EMSDK_DIR
    emsdk_cli = emsdk_dir / ("emsdk.bat" if os.name == "nt" else "emsdk")

    if not emsdk_dir.exists():
        print(f"Cloning emsdk into {emsdk_dir}...", file=sys.stderr)
        emsdk_dir.parent.mkdir(parents=True, exist_ok=True)
        run(["git", "clone", "https://github.com/emscripten-core/emsdk.git", str(emsdk_dir)])

    if not emsdk_cli.exists():
        print(f"emsdk not found at {emsdk_cli}.", file=sys.stderr)
        print("Please check your installation path or remove the partial clone and try again.", file=sys.stderr)
        sys.exit(1)

    print("Installing the latest Emscripten toolchain...", file=sys.stderr)
    if os.name == "nt":
        run(["cmd.exe", "/c", str(emsdk_cli), "install", "latest"])
        run(["cmd.exe", "/c", str(emsdk_cli), "activate", "latest"])
    else:
        run([str(emsdk_cli), "install", "latest"])
        run([str(emsdk_cli), "activate", "latest"])

    emcc_path = find_emcc(emsdk_dir)
    if emcc_path is None:
        print("Emscripten was installed, but emcc could not be found automatically.", file=sys.stderr)
        print(f"Checked under {emsdk_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Using Emscripten compiler: {emcc_path}", file=sys.stderr)
    return str(emcc_path)


if __name__ == "__main__":
    print(ensure_emscripten())
