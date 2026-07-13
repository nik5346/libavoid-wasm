import { describe, it, expect, beforeAll } from "vitest";
// Imports from dist/, not ts/, because dist/libavoid.js (the compiled wasm
// glue) only exists after `npm run build:wasm` has run. Run `npm run build`
// before `npm test` (prepublishOnly already does this for you).
import {
  loadLibavoid,
  Router,
  ConnEnd,
  RouterFlag,
} from "../dist/index.js";
import type { LibavoidModule } from "../dist/libavoid.js";

let module_: LibavoidModule;

beforeAll(async () => {
  module_ = await loadLibavoid();
});

describe("Router", () => {
  it("routes a connector around a rectangular obstacle", () => {
    const router = new Router(module_, RouterFlag.OrthogonalRouting);

    const shape = router.addRectangle({ x: 10, y: 0 }, { x: 30, y: 20 });

    const src = ConnEnd.atPoint(module_, { x: 0, y: 10 });
    const dst = ConnEnd.atPoint(module_, { x: 40, y: 10 });
    const conn = router.addConnector(src, dst);

    router.processTransaction();

    const route = conn.route();
    expect(route.length).toBeGreaterThanOrEqual(2);
    expect(route[0]).toMatchObject({ x: 0, y: 10 });
    expect(route[route.length - 1]).toMatchObject({ x: 40, y: 10 });

    // The route must detour around the obstacle rather than cross it,
    // i.e. it should have more than just a straight 2-point line.
    expect(route.length).toBeGreaterThan(2);

    src.dispose();
    dst.dispose();
    router.deleteShape(shape);
    router.dispose();
  });

  it("forces a route through a checkpoint", () => {
    const router = new Router(module_, RouterFlag.OrthogonalRouting);

    const src = ConnEnd.atPoint(module_, { x: 0, y: 0 });
    const dst = ConnEnd.atPoint(module_, { x: 100, y: 0 });
    const conn = router.addConnector(src, dst);

    conn.setRoutingCheckpoints([{ point: { x: 50, y: 50 } }]);
    router.processTransaction();

    const route = conn.route();
    const passesNearCheckpoint = route.some(
      (p) => Math.abs(p.x - 50) < 1e-6 && Math.abs(p.y - 50) < 1e-6
    );
    expect(passesNearCheckpoint).toBe(true);

    const checkpoints = conn.routingCheckpoints();
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].point).toMatchObject({ x: 50, y: 50 });

    src.dispose();
    dst.dispose();
    router.dispose();
  });
});
