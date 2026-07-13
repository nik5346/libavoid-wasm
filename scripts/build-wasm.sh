#!/usr/bin/env bash
# Compiles libavoid + src/bindings.cpp into dist/libavoid.{js,wasm} using
# Embind. Requires an activated emsdk environment (`emcc` on PATH) — see
# README for setup, or run this inside .github/workflows/build.yml's CI
# container instead.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="${ROOT_DIR}/third_party/adaptagrams/cola"
LIBAVOID_DIR="${VENDOR_DIR}/libavoid"
DIST_DIR="${ROOT_DIR}/dist"

if [ ! -d "${LIBAVOID_DIR}" ]; then
  echo "libavoid source not found at ${LIBAVOID_DIR}." >&2
  echo "Run 'npm run fetch:adaptagrams' first." >&2
  exit 1
fi

command -v emcc >/dev/null 2>&1 || {
  echo "emcc not found on PATH. Install/activate emsdk first:" >&2
  echo "  git clone https://github.com/emscripten-core/emsdk.git" >&2
  echo "  ./emsdk/emsdk install latest && ./emsdk/emsdk activate latest" >&2
  echo "  source ./emsdk/emsdk_env.sh" >&2
  exit 1
}

mkdir -p "${DIST_DIR}"

# All libavoid .cpp files except its own test/demo binaries.
mapfile -t LIBAVOID_SOURCES < <(find "${LIBAVOID_DIR}" -maxdepth 1 -name '*.cpp')

echo "Compiling ${#LIBAVOID_SOURCES[@]} libavoid source files + bindings.cpp..."

emcc \
  -std=c++17 \
  -O3 \
  -I "${VENDOR_DIR}" \
  --bind \
  -lembind \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME=LibavoidModuleFactory \
  -sALLOW_MEMORY_GROWTH=1 \
  -sENVIRONMENT=web,worker,node \
  -sEXPORTED_RUNTIME_METHODS=[] \
  -sDISABLE_EXCEPTION_CATCHING=0 \
  "${LIBAVOID_SOURCES[@]}" \
  "${ROOT_DIR}/src/bindings.cpp" \
  -o "${DIST_DIR}/libavoid.js"

echo "Wrote ${DIST_DIR}/libavoid.js and ${DIST_DIR}/libavoid.wasm"

# Ship the low-level .d.ts alongside the compiled module so `./wasm`
# subpath consumers (see package.json exports) get types too.
cp "${ROOT_DIR}/ts/libavoid.d.ts" "${DIST_DIR}/libavoid.d.ts"
