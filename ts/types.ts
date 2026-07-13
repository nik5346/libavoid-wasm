export interface XY {
  x: number;
  y: number;
}

/** Which routing algorithm a connector should use. */
export enum RoutingType {
  None = 0,
  PolyLine = 1,
  Orthogonal = 2,
}

/** Flags passed when constructing a Router — which routing modes it supports. */
export enum RouterFlag {
  PolyLineRouting = 1,
  OrthogonalRouting = 2,
}

/** Penalty / distance parameters that shape routing quality and style. */
export enum RoutingParameter {
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

/** Boolean routing behaviours that can be toggled on a Router. */
export enum RoutingOption {
  NudgeOrthogonalSegmentsConnectedToShapes = 0,
  ImproveHyperedgeRoutesMovingAddedAndDeletedEndpoints = 1,
  PenaliseOrthogonalSharedPathsAtConnEnds = 2,
  NudgeOrthogonalTouchingColinearSegments = 3,
  PerformUnifyingNudgingPreprocessingStep = 4,
  ImproveHyperedgeRoutesMovingJunctions = 5,
  NudgeSharedPathsWithCommonEndPoint = 6,
}

/**
 * Which side(s) of a shape a ConnEnd/Checkpoint may be entered/left from.
 * Bitmask — combine with `|`, e.g. `ConnDirFlag.Up | ConnDirFlag.Down`.
 */
export enum ConnDirFlag {
  None = 0,
  Up = 1,
  Down = 2,
  Left = 4,
  Right = 8,
  All = 15,
}

/** A point a connector's route must pass through, in order. */
export interface CheckpointSpec {
  point: XY;
  /** Directions the route may arrive from. Defaults to ConnDirFlag.All. */
  arrivalDirections?: ConnDirFlag;
  /** Directions the route may depart towards. Defaults to ConnDirFlag.All. */
  departureDirections?: ConnDirFlag;
}
