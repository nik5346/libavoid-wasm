import LibavoidModuleFactory, {
  type LibavoidModule,
  type EmbindRouter,
  type EmbindShapeRef,
  type EmbindConnRef,
  type EmbindConnEnd,
  type EmbindPointVector,
} from "./libavoid.js";
import {
  RoutingType,
  RouterFlag,
  RoutingParameter,
  RoutingOption,
  ConnDirFlag,
  type XY,
  type CheckpointSpec,
} from "./types.js";

export { RoutingType, RouterFlag, RoutingParameter, RoutingOption, ConnDirFlag };
export type { XY, CheckpointSpec, LibavoidModule };

// Use a global cache to survive HMR reloads
declare global {
  var __libavoidModulePromise: Promise<LibavoidModule> | undefined;
  var __libavoidModuleInstance: LibavoidModule | undefined;

  // Vite's import.meta.hot isn't part of the standard ImportMeta type;
  // declare it as optional so this compiles under plain tsc/other bundlers
  // too, without depending on "vite/client" ambient types.
  interface ImportMeta {
    hot?: {
      accept(cb?: (mod: unknown) => void): void;
    };
  }
}

// Prevent HMR reloads from re-initializing this module
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    // Refuse to update, keep the cached module
  });
}

/**
 * Loads (once, cached globally) and returns the compiled libavoid WebAssembly module.
 * Call this once at startup; `new Router()` requires it to have resolved.
 */
export function loadLibavoid(
  options?: Record<string, unknown>
): Promise<LibavoidModule> {
  if (globalThis.__libavoidModuleInstance) {
    // Already loaded, return immediately
    return Promise.resolve(globalThis.__libavoidModuleInstance);
  }
  
  if (!globalThis.__libavoidModulePromise) {
    globalThis.__libavoidModulePromise = LibavoidModuleFactory(options).then(
      (mod) => {
        globalThis.__libavoidModuleInstance = mod;
        return mod;
      }
    );
  }
  return globalThis.__libavoidModulePromise;
}

/** Marker interface for wrapper objects that own a C++ handle. */
interface Disposable {
  dispose(): void;
}

function disposeAll(items: Disposable[]): void {
  for (const item of items) item.dispose();
}

/**
 * Converts an Embind point-vector handle (which exposes `.size()`/`.get()`,
 * not a real JS array) into a plain array of `{x, y}` objects, then frees
 * the vector handle. Every Embind function that returns `std::vector<Point>`
 * (routePoints, displayRoutePoints, polygonPoints, ...) needs this — it is
 * NOT automatically converted to a JS array despite what old type
 * declarations may have claimed.
 */
function pointVectorToArray(vec: EmbindPointVector): XY[] {
  const out: XY[] = [];
  const size = vec.size();
  for (let i = 0; i < size; i++) {
    const p = vec.get(i);
    out.push({ x: p.x, y: p.y });
    p.delete();
  }
  vec.delete();
  return out;
}

/**
 * A shape (obstacle) that connectors will be routed around.
 * Call `.dispose()` (or let the owning Router dispose it) when you remove
 * the shape from the diagram — the underlying C++ object is not garbage
 * collected automatically.
 */
export class Shape implements Disposable {
  /** @internal */
  readonly handle: EmbindShapeRef;
  private disposed = false;

  private constructor(handle: EmbindShapeRef) {
    this.handle = handle;
  }

  /** @internal — constructed via Router.addShape()/addRectangle() */
  static _wrap(handle: EmbindShapeRef): Shape {
    return new Shape(handle);
  }

  /** The current boundary polygon of this shape, as plain {x, y} points. */
  polygonPoints(): XY[] {
    return pointVectorToArray(this.handle.polygonPoints());
  }

  dispose(): void {
    if (this.disposed) return;
    // C++ ShapeRef is owned and deleted by the Router, so we must not call
    // this.handle.delete() directly (which invokes the C++ destructor).
    // Doing so triggers assertions in libavoid's destructor and aborts.
    this.disposed = true;
  }
}

/** One endpoint of a connector: either a fixed point, or attached to a shape. */
export class ConnEnd implements Disposable {
  /** @internal */
  readonly handle: EmbindConnEnd;
  private disposed = false;

  /** @internal — use ConnEnd.atPoint() / ConnEnd.atShape() instead */
  private constructor(handle: EmbindConnEnd) {
    this.handle = handle;
  }

  static atPoint(module: LibavoidModule, point: XY, visDirs?: ConnDirFlag): ConnEnd {
    const p = new module.Point(point.x, point.y);
    const handle =
      visDirs === undefined
        ? new module.ConnEnd(p)
        : module.ConnEnd.atPointWithDirs(p, visDirs as unknown as number);
    p.delete();
    return new ConnEnd(handle);
  }

  static atShape(module: LibavoidModule, shape: Shape, connectionPinClassId = 0): ConnEnd {
    const handle = new module.ConnEnd(shape.handle, connectionPinClassId);
    return new ConnEnd(handle);
  }

  dispose(): void {
    if (this.disposed) return;
    this.handle.delete();
    this.disposed = true;
  }
}

/** A routed connector between two ConnEnds. */
export class Connector implements Disposable {
  /** @internal */
  readonly handle: EmbindConnRef;
  private readonly module: LibavoidModule;
  private disposed = false;

  /** @internal — constructed via Router.addConnector() */
  static _wrap(module: LibavoidModule, handle: EmbindConnRef): Connector {
    return new Connector(module, handle);
  }

  private constructor(module: LibavoidModule, handle: EmbindConnRef) {
    this.module = module;
    this.handle = handle;
  }

  id(): number {
    return this.handle.id();
  }

  setEndpoints(src: ConnEnd, dst: ConnEnd): void {
    this.handle.setEndpoints(src.handle, dst.handle);
  }

  setRoutingType(type: RoutingType): void {
    this.handle.setRoutingType(type as unknown as number);
  }

  routingType(): RoutingType {
    return this.handle.routingType() as unknown as RoutingType;
  }

  needsRepaint(): boolean {
    return this.handle.needsRepaint();
  }

  /** The final, display-ready route (simplified, nudged, corners applied). */
  route(): XY[] {
    return pointVectorToArray(this.handle.displayRoutePoints());
  }

  /** The raw shortest-path route, before nudging / corner post-processing. */
  rawRoute(): XY[] {
    return pointVectorToArray(this.handle.routePoints());
  }

  /**
   * Sets an ordered list of points the route must pass through (in order),
   * optionally constraining which side each is entered/left from. Takes
   * effect on the next `processTransaction()`.
   */
  setRoutingCheckpoints(checkpoints: CheckpointSpec[]): void {
    const vec = new this.module.CheckpointVector();
    for (const cp of checkpoints) {
      const p = new this.module.Point(cp.point.x, cp.point.y);
      const arrival = cp.arrivalDirections ?? ConnDirFlag.All;
      const departure = cp.departureDirections ?? ConnDirFlag.All;
      const embindCp = new this.module.Checkpoint(p, arrival, departure);
      vec.push_back(embindCp);
      p.delete();
      embindCp.delete();
    }
    this.handle.setRoutingCheckpoints(vec);
    vec.delete();
  }

  /** The current ordered list of routing checkpoints for this connector. */
  routingCheckpoints(): CheckpointSpec[] {
    const vec = this.handle.routingCheckpoints();
    const out: CheckpointSpec[] = [];
    for (let i = 0; i < vec.size(); i++) {
      const cp = vec.get(i);
      out.push({
        point: { x: cp.point.x, y: cp.point.y },
        arrivalDirections: cp.arrivalDirections as ConnDirFlag,
        departureDirections: cp.departureDirections as ConnDirFlag,
      });
      cp.delete();
    }
    vec.delete();
    return out;
  }

  dispose(): void {
    if (this.disposed) return;
    // C++ ConnRef is owned and deleted by the Router, so we must not call
    // this.handle.delete() directly (which invokes the C++ destructor).
    // Doing so triggers assertions in libavoid's destructor and aborts.
    this.disposed = true;
  }
}

/**
 * A libavoid routing scene. Create shapes and connectors on it, then call
 * `processTransaction()` (or leave `transactionUse` at its default of
 * `true` and call it after each batch of changes) to compute routes.
 */
export class Router implements Disposable {
  private readonly module: LibavoidModule;
  private readonly handle: EmbindRouter;
  private readonly owned: Disposable[] = [];
  private disposed = false;

  constructor(module: LibavoidModule, flags: RouterFlag = RouterFlag.OrthogonalRouting) {
    this.module = module;
    this.handle = new module.Router(flags);
  }

  setRoutingParameter(parameter: RoutingParameter, value: number): void {
    this.handle.setRoutingParameter(parameter as unknown as number, value);
  }

  routingParameter(parameter: RoutingParameter): number {
    return this.handle.routingParameter(parameter as unknown as number);
  }

  setRoutingOption(option: RoutingOption, value: boolean): void {
    this.handle.setRoutingOption(option as unknown as number, value);
  }

  routingOption(option: RoutingOption): boolean {
    return this.handle.routingOption(option as unknown as number);
  }

  /**
   * Batches shape/connector changes so they're processed efficiently in one
   * pass. Defaults to true, matching libavoid's own default.
   */
  setTransactionUse(use: boolean): void {
    this.handle.setTransactionUse(use);
  }

  /** Applies all queued moves/additions/deletions and reroutes affected connectors. */
  processTransaction(): boolean {
    return this.handle.processTransaction();
  }

  /** Adds a polygonal obstacle to the scene. */
  addShape(points: XY[], id = 0): Shape {
    const vec = new this.module.PointVector();
    for (const p of points) {
      const pt = new this.module.Point(p.x, p.y);
      vec.push_back(pt);
      pt.delete();
    }
    const handle = new this.module.ShapeRef(this.handle, vec, id);
    vec.delete();
    const shape = Shape._wrap(handle);
    this.owned.push(shape);
    return shape;
  }

  /** Adds a rectangular obstacle to the scene. */
  addRectangle(topLeft: XY, bottomRight: XY, id = 0): Shape {
    const tl = new this.module.Point(topLeft.x, topLeft.y);
    const br = new this.module.Point(bottomRight.x, bottomRight.y);
    const handle = this.module.ShapeRef.fromRect(this.handle, tl, br, id);
    tl.delete();
    br.delete();
    const shape = Shape._wrap(handle);
    this.owned.push(shape);
    return shape;
  }

  /** Moves a shape to a new rectangular position (keeps its point count). */
  moveShapeBy(shape: Shape, xDiff: number, yDiff: number): void {
    this.handle.moveShapeBy(shape.handle, xDiff, yDiff);
  }

  /** Removes a shape from the scene and frees it. */
  deleteShape(shape: Shape): void {
    this.handle.deleteShape(shape.handle);
    shape.dispose();
  }

  /** Adds a connector routed between two endpoints. */
  addConnector(src: ConnEnd, dst: ConnEnd): Connector {
    const handle = new this.module.ConnRef(this.handle, src.handle, dst.handle);
    const conn = Connector._wrap(this.module, handle);
    this.owned.push(conn);
    return conn;
  }

  /** Removes a connector from the scene and frees it. */
  deleteConnector(conn: Connector): void {
    this.handle.deleteConnector(conn.handle);
    conn.dispose();
  }

  /**
   * Frees the router and every shape/connector it still owns. Always call
   * this when you're done with a Router — WASM memory is not garbage
   * collected.
   */
  dispose(): void {
    if (this.disposed) return;
    disposeAll(this.owned);
    this.handle.delete();
    this.disposed = true;
  }
}
