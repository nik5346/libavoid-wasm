#!/usr/bin/env python3
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
VENDOR_DIR = ROOT_DIR / "third_party" / "adaptagrams" / "cola"
LIBAVOID_DIR = VENDOR_DIR / "libavoid"
DIST_DIR = ROOT_DIR / "dist"

if not LIBAVOID_DIR.exists():
    print(f"libavoid source not found at {LIBAVOID_DIR}.", file=sys.stderr)
    print("Run 'npm run fetch:adaptagrams' first.", file=sys.stderr)
    sys.exit(1)

EMCC = os.environ.get("EMCC")
if not EMCC:
    emcc_from_path = shutil.which("emcc")
    if emcc_from_path:
        EMCC = emcc_from_path
    else:
        print("emcc not found on PATH. Installing Emscripten automatically...")
        install_script = ROOT_DIR / "scripts" / "install_emscripten.py"
        result = subprocess.run([sys.executable, str(install_script)], capture_output=True, text=True)
        if result.returncode != 0:
            print(result.stderr, file=sys.stderr)
            sys.exit(result.returncode)
        EMCC = result.stdout.strip().splitlines()[-1]

EMCC_PATH = Path(EMCC).expanduser().resolve()
if not EMCC_PATH.exists():
    print(f"Resolved emcc path does not exist: {EMCC_PATH}", file=sys.stderr)
    sys.exit(1)

build_env = os.environ.copy()
build_env["EMSDK"] = str(EMCC_PATH.parent.parent.parent)
build_env["PATH"] = str(EMCC_PATH.parent) + os.pathsep + build_env.get("PATH", "")
for candidate in (EMCC_PATH.parent.parent.parent / "python").glob("**/python.exe"):
    build_env["EMSDK_PYTHON"] = str(candidate)
    break

result = subprocess.run([str(EMCC_PATH), "--version"], capture_output=True, text=True, env=build_env)
if result.returncode != 0:
    print(result.stderr, file=sys.stderr)
    sys.exit(result.returncode)

DIST_DIR.mkdir(parents=True, exist_ok=True)

libavoid_sources = [str(path) for path in LIBAVOID_DIR.glob("*.cpp")]
print(f"Compiling {len(libavoid_sources)} libavoid source files + bindings.cpp...")

cmd = [
    str(EMCC_PATH),
    "-std=c++17",
    "-O3",
    "-I",
    str(VENDOR_DIR),
    "--bind",
    "-lembind",
    "-sMODULARIZE=1",
    "-sEXPORT_ES6=1",
    "-sEXPORT_NAME=LibavoidModuleFactory",
    "-sALLOW_MEMORY_GROWTH=1",
    "-sENVIRONMENT=web,worker,node",
    "-sEXPORTED_RUNTIME_METHODS=[]",
    "-sDISABLE_EXCEPTION_CATCHING=0",
    *libavoid_sources,
    str(ROOT_DIR / "src" / "bindings.cpp"),
    "-o",
    str(DIST_DIR / "libavoid.js"),
]

result = subprocess.run(cmd, env=build_env)
if result.returncode != 0:
    sys.exit(result.returncode)

print(f"Wrote {DIST_DIR / 'libavoid.js'} and {DIST_DIR / 'libavoid.wasm'}")
shutil.copyfile(ROOT_DIR / "ts" / "libavoid.d.ts", DIST_DIR / "libavoid.d.ts")
