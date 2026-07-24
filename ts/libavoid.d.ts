// Type declarations for the raw Embind output (dist/libavoid.js / .wasm).
// These mirror src/bindings.cpp 1:1. Prefer the ergonomic wrapper in
// ts/index.ts for application code — this file is the low-level surface it
// is built on.

export interface EmbindPoint {
  x: number;
  y: number;
  delete(): void;
}

export interface EmbindPointVector {
  size(): number;
  get(index: number): EmbindPoint;
  push_back(point: EmbindPoint): void;
  delete(): void;
}

export interface EmbindPolygon {
  size(): number;
  empty(): boolean;
  delete(): void;
}

export interface EmbindRectangle extends EmbindPolygon {}

export const enum ConnDirFlag {
  None = 0,
  Up = 1,
  Down = 2,
  Left = 4,
  Right = 8,
  All = 15,
}

export interface EmbindCheckpoint {
  point: EmbindPoint;
  arrivalDirections: number;
  departureDirections: number;
  delete(): void;
}

export interface EmbindCheckpointVector {
  size(): number;
  get(index: number): EmbindCheckpoint;
  push_back(cp: EmbindCheckpoint): void;
  delete(): void;
}

export interface EmbindConnEnd {
  delete(): void;
}

export interface EmbindShapeRef {
  polygonPoints(): EmbindPointVector;
  delete(): void;
}

export const enum RoutingType {
  None = 0,
  PolyLine = 1,
  Orthogonal = 2,
}

export interface EmbindConnRef {
  id(): number;
  setEndpoints(src: EmbindConnEnd, dst: EmbindConnEnd): void;
  setSourceEndpoint(src: EmbindConnEnd): void;
  setDestEndpoint(dst: EmbindConnEnd): void;
  needsRepaint(): boolean;
  routePoints(): EmbindPointVector;
  displayRoutePoints(): EmbindPointVector;
  routingType(): RoutingType;
  setRoutingType(type: RoutingType): void;
  hasFixedRoute(): boolean;
  clearFixedRoute(): void;
  setRoutingCheckpoints(checkpoints: EmbindCheckpointVector): void;
  routingCheckpoints(): EmbindCheckpointVector;
  delete(): void;
}

export const enum RoutingParameter {
  SegmentPenalty = 0,
  AnglePenalty = 1,
  CrossingPenalty = 2,
  ClusterCrossingPenalty = 3,
  FixedSharedPathPenalty = 4,
  PortDirectionPenalty = 5,
  ShapeBufferDistance = 6,
  IdealNudgingDistance = 7,
  ReverseDirectionPenalty = 8,
}

export const enum RoutingOption {
  NudgeOrthogonalSegmentsConnectedToShapes = 0,
  ImproveHyperedgeRoutesMovingAddingAndDeletingJunctions = 1,
  PenaliseOrthogonalSharedPathsAtConnEnds = 2,
  NudgeOrthogonalTouchingColinearSegments = 3,
  PerformUnifyingNudgingPreprocessingStep = 4,
  ImproveHyperedgeRoutesMovingJunctions = 5,
  NudgeSharedPathsWithCommonEndPoint = 6,
}

export const enum RouterFlag {
  PolyLineRouting = 1,
  OrthogonalRouting = 2,
}

export interface EmbindRouter {
  setRoutingParameter(parameter: RoutingParameter, value: number): void;
  routingParameter(parameter: RoutingParameter): number;
  setRoutingOption(option: RoutingOption, value: boolean): void;
  routingOption(option: RoutingOption): boolean;
  setTransactionUse(use: boolean): void;
  processTransaction(): boolean;
  deleteShape(shape: EmbindShapeRef): void;
  deleteConnector(conn: EmbindConnRef): void;
  moveShapeTo(shape: EmbindShapeRef, poly: EmbindPolygon, firstMove: boolean): void;
  moveShapeBy(shape: EmbindShapeRef, xDiff: number, yDiff: number): void;
  delete(): void;
}

export interface LibavoidModule {
  Point: {
    new (x: number, y: number): EmbindPoint;
  };
  PointVector: {
    new (): EmbindPointVector;
  };
  Polygon: {
    new (): EmbindPolygon;
  };
  Rectangle: {
    new (topLeft: EmbindPoint, bottomRight: EmbindPoint): EmbindRectangle;
  };
  Checkpoint: {
    new (): EmbindCheckpoint;
    new (point: EmbindPoint): EmbindCheckpoint;
    new (point: EmbindPoint, arrivalDirections: number, departureDirections: number): EmbindCheckpoint;
  };
  CheckpointVector: {
    new (): EmbindCheckpointVector;
  };
  ConnEnd: {
    new (point: EmbindPoint): EmbindConnEnd;
    new (point: EmbindPoint, visDirs: number): EmbindConnEnd;
    new (shape: EmbindShapeRef, connectionPinClassId: number): EmbindConnEnd;
    atPointWithDirs(point: EmbindPoint, visDirs: number): EmbindConnEnd;
  };
  ShapeRef: {
    new (router: EmbindRouter, points: EmbindPointVector, id: number): EmbindShapeRef;
    fromRect(
      router: EmbindRouter,
      topLeft: EmbindPoint,
      bottomRight: EmbindPoint,
      id: number
    ): EmbindShapeRef;
  };
  ConnRef: {
    new (router: EmbindRouter): EmbindConnRef;
    new (router: EmbindRouter, src: EmbindConnEnd, dst: EmbindConnEnd): EmbindConnRef;
  };
  Router: {
    new (flags: number): EmbindRouter;
  };
  polygonFromPoints(points: EmbindPointVector): EmbindPolygon;
  polygonToPoints(polygon: EmbindPolygon): EmbindPointVector;
}

declare function LibavoidModuleFactory(
  options?: Record<string, unknown>
): Promise<LibavoidModule>;

export default LibavoidModuleFactory;
