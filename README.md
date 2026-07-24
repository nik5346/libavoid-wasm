# libavoid-wasm

WebAssembly bindings for [libavoid](https://github.com/mjwybrow/adaptagrams)
(part of the Adaptagrams project) — fast, object-avoiding polyline and
orthogonal connector routing for diagram editors — with a typed TypeScript
API, built via [Embind](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html).

## Install

```bash
npm install libavoid-wasm
```

## Usage

```ts
import { loadLibavoid, Router, ConnEnd, RouterFlag } from "libavoid-wasm";

const module = await loadLibavoid();
const router = new Router(module, RouterFlag.OrthogonalRouting);

const shape = router.addRectangle({ x: 150, y: 50 }, { x: 250, y: 150 });

const src = ConnEnd.atPoint(module, { x: 20, y: 100 });
const dst = ConnEnd.atPoint(module, { x: 380, y: 100 });
const conn = router.addConnector(src, dst);

router.processTransaction();

console.log(conn.route()); // [{ x, y }, ...] — the routed polyline

src.dispose();
dst.dispose();
router.dispose(); // frees the shape and connector too
```

WASM objects are **not garbage collected** — always call `.dispose()`
(shapes, connectors, ConnEnds) or `router.dispose()`, which cascades to
everything the router still owns.

## Building from source

```bash
git clone https://github.com/nik5346/libavoid-wasm.git
cd libavoid-wasm
npm install

# 1. Fetch libavoid's C++ source (LGPL-2.1-or-later, Monash University)
npm run fetch:adaptagrams

# 2. Install Emscripten automatically (or run it explicitly if preferred)
npm run install:emscripten

# 3. Build the wasm module + TypeScript wrapper
npm run build

# 4. Run tests
npm test
```

## React block-diagram example

An online, interactive version of this demo is hosted on [GitHub Pages](https://nik5346.github.io/libavoid-wasm/).

A runnable React/Vite demo lives in [examples/react-block-diagram](examples/react-block-diagram). It shows how to:

- create and delete nodes as rectangular obstacles
- create and move ports and edges
- let libavoid recompute connector routes in real time as the diagram changes

Run it from the repo root:

```bash
cd examples/react-block-diagram
npm install
npm run dev
```

Then open the local Vite URL in your browser.

## Architecture

- `src/bindings.cpp` — Embind glue exposing the C++ classes to JS. This is
  the only hand-written C++ in the repo; all routing logic is libavoid's.
- `ts/libavoid.d.ts` — low-level types mirroring the raw Embind output.
- `ts/index.ts` — the ergonomic wrapper most consumers should use: plain
  `{x, y}` objects instead of Embind vectors, explicit `dispose()` instead
  of manual `.delete()` bookkeeping, enums instead of magic numbers.
- `scripts/fetch_adaptagrams.py` — vendors a pinned libavoid revision into
  `third_party/adaptagrams` (gitignored, fetched at build time rather than
  committed).
- `scripts/build_wasm.py` — the `emcc` invocation.
- `scripts/install_emscripten.py` — installs Emscripten automatically when
  needed.
