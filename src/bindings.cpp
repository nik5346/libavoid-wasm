// libavoid-wasm bindings
//
// Embind bindings that expose the libavoid (Adaptagrams) public C++ API to
// JavaScript/TypeScript via Emscripten. This file contains only glue code;
// all routing logic lives in libavoid itself (vendored under
// third_party/adaptagrams, fetched by scripts/fetch-adaptagrams.sh).
//
// Scope for v0.1: Router, ShapeRef, ConnRef, ConnEnd, Point, Polygon,
// Rectangle, Checkpoint, and the core enums (RouterFlag, ConnType,
// ConnDirFlag, RoutingParameter, RoutingOption).
//
// Deliberately NOT bound yet (see README "API coverage" for why and what
// it would take): JunctionRef (free-floating attachable points,
// ConnRef::splitAtSegment), ShapeConnectionPin (named attachment points
// on shapes), Cluster (grouping shapes), HyperedgeRerouter and the
// hyperedge-improvement machinery, ConnRef::setCallback (the C++ callback
// takes a raw function pointer, which doesn't cross the JS boundary —
// needsRepaint() polling is the workaround), setFixedRoute /
// setFixedExistingRoute, Router::outputDiagram(SVG) debug dumps, and
// moveJunction/deleteJunction.
//
// SPDX-License-Identifier: LGPL-2.1-or-later

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "libavoid/libavoid.h"

using namespace emscripten;
using namespace Avoid;

namespace {

// --- Helpers -----------------------------------------------------------
// embind can't bind std::vector<Point> element access directly in a way
// that's ergonomic from JS, so we provide small free functions that
// convert to/from JS arrays of {x, y} plain objects. This keeps the
// TypeScript wrapper thin (see ts/index.ts).

Polygon polygonFromPoints(const std::vector<Point>& points) {
    Polygon poly(static_cast<int>(points.size()));
    for (size_t i = 0; i < points.size(); ++i) {
        poly.ps[i] = points[i];
    }
    return poly;
}

std::vector<Point> polygonToPoints(const Polygon& poly) {
    std::vector<Point> out;
    out.reserve(poly.ps.size());
    for (const auto& p : poly.ps) {
        out.push_back(p);
    }
    return out;
}

std::vector<Point> polylineToPoints(const PolyLine& line) {
    std::vector<Point> out;
    out.reserve(line.ps.size());
    for (const auto& p : line.ps) {
        out.push_back(p);
    }
    return out;
}

// Thin wrapper so JS can build a ShapeRef straight from an array of Points
// (a Polygon) without needing to construct a Polygon object first.
ShapeRef* makeShapeRefFromPoints(Router* router,
                                  const std::vector<Point>& points,
                                  unsigned int id) {
    Polygon poly = polygonFromPoints(points);
    return new ShapeRef(router, poly, id);
}

ShapeRef* makeShapeRefFromRect(Router* router, const Point& topLeft,
                               const Point& bottomRight, unsigned int id) {
    Rectangle rect(topLeft, bottomRight);
    return new ShapeRef(router, rect, id);
}

std::vector<Point> connRefDisplayRoutePoints(ConnRef& conn) {
    return polylineToPoints(conn.displayRoute());
}

std::vector<Point> connRefRoutePoints(const ConnRef& conn) {
    return polylineToPoints(conn.route());
}

std::vector<Point> shapeRefPolygonPoints(const ShapeRef& shape) {
    return polygonToPoints(shape.polygon());
}

// --- Checkpoints ---------------------------------------------------------
// Checkpoint's fields are public and simple, but embind's value_object
// can't hold a nested non-primitive (Point) cleanly across the JS/wasm
// boundary alongside two enums-as-ints, so we bind it as a class_ instead
// and expose the fields as properties.

} // namespace

EMSCRIPTEN_BINDINGS(libavoid) {

    // --- Enums -----------------------------------------------------------
    enum_<RouterFlag>("RouterFlag")
        .value("PolyLineRouting", PolyLineRouting)
        .value("OrthogonalRouting", OrthogonalRouting);

    enum_<ConnType>("ConnType")
        .value("None", ConnType_None)
        .value("PolyLine", ConnType_PolyLine)
        .value("Orthogonal", ConnType_Orthogonal);

    enum_<ConnDirFlag>("ConnDirFlag")
        .value("None", ConnDirNone)
        .value("Up", ConnDirUp)
        .value("Down", ConnDirDown)
        .value("Left", ConnDirLeft)
        .value("Right", ConnDirRight)
        .value("All", ConnDirAll);

    enum_<RoutingParameter>("RoutingParameter")
        .value("SegmentPenalty", segmentPenalty)
        .value("AnglePenalty", anglePenalty)
        .value("CrossingPenalty", crossingPenalty)
        .value("ClusterCrossingPenalty", clusterCrossingPenalty)
        .value("FixedSharedPathPenalty", fixedSharedPathPenalty)
        .value("PortDirectionPenalty", portDirectionPenalty)
        .value("ShapeBufferDistance", shapeBufferDistance)
        .value("IdealNudgingDistance", idealNudgingDistance)
        .value("ReverseDirectionPenalty", reverseDirectionPenalty);

    enum_<RoutingOption>("RoutingOption")
        .value("NudgeOrthogonalSegmentsConnectedToShapes",
               nudgeOrthogonalSegmentsConnectedToShapes)
         .value("ImproveHyperedgeRoutesMovingAddingAndDeletingJunctions",
             improveHyperedgeRoutesMovingAddingAndDeletingJunctions)
        .value("PenaliseOrthogonalSharedPathsAtConnEnds",
               penaliseOrthogonalSharedPathsAtConnEnds)
        .value("NudgeOrthogonalTouchingColinearSegments",
               nudgeOrthogonalTouchingColinearSegments)
        .value("PerformUnifyingNudgingPreprocessingStep",
               performUnifyingNudgingPreprocessingStep)
        .value("ImproveHyperedgeRoutesMovingJunctions",
               improveHyperedgeRoutesMovingJunctions)
        .value("NudgeSharedPathsWithCommonEndPoint",
               nudgeSharedPathsWithCommonEndPoint);

    // --- Point -------------------------------------------------------------
    value_object<Point>("PointValue")
        .field("x", &Point::x)
        .field("y", &Point::y);

    // We also expose a constructible Point class (embind's value_object is
    // read/write-only for plain data; this class_ overload lets JS `new`
    // one and pass it into APIs that expect an Avoid::Point by value).
    class_<Point>("Point")
        .constructor<double, double>()
        .property("x", &Point::x)
        .property("y", &Point::y);

    register_vector<Point>("PointVector");

    // --- Polygon / Rectangle ------------------------------------------------
    class_<Polygon>("Polygon")
        .constructor<>()
        .function("size", &Polygon::size)
        .function("empty", &Polygon::empty);

    function("polygonFromPoints", &polygonFromPoints);
    function("polygonToPoints", &polygonToPoints);

    class_<Rectangle, base<Polygon>>("Rectangle")
        .constructor<const Point&, const Point&>();

    // --- Checkpoint ----------------------------------------------------------
    // A point a connector's route must pass through, with optional
    // constraints on which side it's entered/left from.
    class_<Checkpoint>("Checkpoint")
        .constructor<>()
        .constructor<const Point&>()
        .constructor<const Point&, ConnDirFlags, ConnDirFlags>()
        .property("point", &Checkpoint::point)
        .property("arrivalDirections", &Checkpoint::arrivalDirections)
        .property("departureDirections", &Checkpoint::departureDirections);

    register_vector<Checkpoint>("CheckpointVector");

    // --- ConnEnd -------------------------------------------------------------
    class_<ConnEnd>("ConnEnd")
        .constructor<const Point&>()
        .constructor<const Point&, unsigned int>()
        .constructor<ShapeRef*, unsigned int>();

    // --- ShapeRef --------------------------------------------------------
    class_<ShapeRef>("ShapeRef")
        .constructor(&makeShapeRefFromPoints, allow_raw_pointers())
        .class_function("fromRect", &makeShapeRefFromRect, allow_raw_pointers())
        .function("polygonPoints", &shapeRefPolygonPoints);

    // --- ConnRef -----------------------------------------------------------
    // --- Router ------------------------------------------------------------
    class_<Router>("Router")
        .constructor<unsigned int>()
        .function("setRoutingParameter",
                   select_overload<void(const RoutingParameter, const double)>(
                       &Router::setRoutingParameter))
        .function("routingParameter", &Router::routingParameter)
        .function("setRoutingOption", &Router::setRoutingOption)
        .function("routingOption", &Router::routingOption)
        .function("setTransactionUse", &Router::setTransactionUse)
        .function("processTransaction", &Router::processTransaction)
        .function("deleteShape", &Router::deleteShape, allow_raw_pointers())
        .function("deleteConnector", &Router::deleteConnector, allow_raw_pointers())
        .function("moveShapeTo",
                   select_overload<void(ShapeRef*, const Polygon&, const bool)>(
                       &Router::moveShape),
                   allow_raw_pointers())
        .function("moveShapeBy",
                   select_overload<void(ShapeRef*, const double, const double)>(
                       &Router::moveShape),
                   allow_raw_pointers());

    // --- ConnRef -----------------------------------------------------------
    class_<ConnRef>("ConnRef")
        .constructor<Router*>(allow_raw_pointers())
        .constructor<Router*, const ConnEnd&, const ConnEnd&>(allow_raw_pointers())
        .function("id", &ConnRef::id)
        .function("setEndpoints", &ConnRef::setEndpoints)
        .function("setSourceEndpoint", &ConnRef::setSourceEndpoint)
        .function("setDestEndpoint", &ConnRef::setDestEndpoint)
        .function("needsRepaint", &ConnRef::needsRepaint)
        .function("routePoints", &connRefRoutePoints)
        .function("displayRoutePoints", &connRefDisplayRoutePoints)
        .function("routingType", &ConnRef::routingType)
        .function("setRoutingType", &ConnRef::setRoutingType)
        .function("hasFixedRoute", &ConnRef::hasFixedRoute)
        .function("clearFixedRoute", &ConnRef::clearFixedRoute)
        .function("setRoutingCheckpoints", &ConnRef::setRoutingCheckpoints)
        .function("routingCheckpoints", &ConnRef::routingCheckpoints);
}
