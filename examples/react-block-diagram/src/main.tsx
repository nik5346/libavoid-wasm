import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  loadLibavoid,
  Router,
  ConnEnd,
  RouterFlag,
  RoutingType,
  Connector,
  Shape,
  ConnDirFlag,
  RoutingParameter,
  type LibavoidModule,
  type XY,
} from 'libavoid-wasm';

const getDirFlag = (side: 'top' | 'bottom' | 'left' | 'right') => {
  switch (side) {
    case 'top': return ConnDirFlag.Up;
    case 'bottom': return ConnDirFlag.Down;
    case 'left': return ConnDirFlag.Left;
    case 'right': return ConnDirFlag.Right;
  }
};

type Node = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: Shape;
};

type Edge = {
  id: string;
  sourceNodeId: string;
  sourcePortSide: 'top' | 'bottom' | 'left' | 'right';
  targetNodeId: string;
  targetPortSide: 'top' | 'bottom' | 'left' | 'right';
  connector: Connector;
  checkpoints: XY[];
};

type DragState =
  | { type: 'node'; id: string; startX: number; startY: number }
  | { type: 'checkpoint'; edgeId: string; index: number; startX: number; startY: number }
  | null;

type LinkingState = {
  srcNodeId: string;
  srcPortSide: 'top' | 'bottom' | 'left' | 'right';
  mousePos: XY;
  previewConnector: Connector;
};

const PORT_SIDES = ['top', 'bottom', 'left', 'right'] as const;

function getPortPosition(node: Node, side: 'top' | 'bottom' | 'left' | 'right'): XY {
  switch (side) {
    case 'top':
      return { x: node.x + node.width / 2, y: node.y };
    case 'bottom':
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case 'left':
      return { x: node.x, y: node.y + node.height / 2 };
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height / 2 };
  }
}

// Distance helper for segment click detection
function distanceToSegment(p: XY, v: XY, w: XY): number {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

// Helper to find the index along the route
function getDistanceAlongRoute(pt: XY, route: XY[]): number {
  let minDistance = Infinity;
  let closestSegmentIndex = 0;
  let closestProjectionT = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];
    const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
    if (l2 === 0) continue;
    let t = ((pt.x - p1.x) * (p2.x - p1.x) + (pt.y - p1.y) * (p2.y - p1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const dist = Math.hypot(pt.x - (p1.x + t * (p2.x - p1.x)), pt.y - (p1.y + t * (p2.y - p1.y)));
    if (dist < minDistance) {
      minDistance = dist;
      closestSegmentIndex = i;
      closestProjectionT = t;
    }
  }

  let accumDist = 0;
  for (let i = 0; i < closestSegmentIndex; i++) {
    accumDist += Math.hypot(route[i + 1].x - route[i].x, route[i + 1].y - route[i].y);
  }
  const segLen = Math.hypot(
    route[closestSegmentIndex + 1].x - route[closestSegmentIndex].x,
    route[closestSegmentIndex + 1].y - route[closestSegmentIndex].y
  );
  accumDist += closestProjectionT * segLen;
  return accumDist;
}

function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Keep router and module in refs to manage C++ lifecycles cleanly
  const routerRef = useRef<Router | null>(null);
  const moduleRef = useRef<LibavoidModule | null>(null);

  // Interaction States
  const [dragState, setDragState] = useState<DragState>(null);
  const [linkingState, setLinkingState] = useState<LinkingState | null>(null);

  // SVG dimensions
  const width = 1000;
  const height = 650;

  // Initialize libavoid and set up initial diagram
  useEffect(() => {
    let canceled = false;
    let r: Router | null = null;

    console.log("useEffect mounting...");
    loadLibavoid().then((mod) => {
      if (canceled) {
        console.log("loadLibavoid resolved, but canceled was true.");
        return;
      }
      console.log("loadLibavoid resolved successfully!");
      moduleRef.current = mod;

      // Enable orthogonal routing with segment improvements
      r = new Router(mod, RouterFlag.OrthogonalRouting);
      r.setRoutingOption(4, true); // ImproveHyperedgeRoutesMovingAddingAndDeletingJunctions
      r.setRoutingParameter(RoutingParameter.ShapeBufferDistance, 15);
      r.setRoutingParameter(RoutingParameter.IdealNudgingDistance, 15);
      routerRef.current = r;

      // Create initial nodes
      const n1 = addNodeHelper(r, 'Input Node', 100, 150);
      const n2 = addNodeHelper(r, 'Process Card', 400, 100);
      const n3 = addNodeHelper(r, 'Output Result', 700, 250);

      // Create initial edges
      const e1 = addEdgeHelper(r, mod, n1, 'right', n2, 'left');
      const e2 = addEdgeHelper(r, mod, n2, 'right', n3, 'top');

      r.processTransaction();

      setNodes([n1, n2, n3]);
      setEdges([e1, e2]);
      setReady(true);
      console.log("Initial diagram loaded, ready is true.");
    });

    return () => {
      canceled = true;
      if (r) {
        r.dispose();
      }
    };
  }, []);

  // Helper to create a shape & react node
  const addNodeHelper = (r: Router, label: string, x: number, y: number): Node => {
    const id = 'node_' + Math.random().toString(36).substring(2, 9);
    const shape = r.addRectangle({ x, y }, { x: x + 140, y: y + 85 });
    return { id, label, x, y, width: 140, height: 85, shape };
  };

  // Helper to create a connector & react edge
  const addEdgeHelper = (
    r: Router,
    mod: LibavoidModule,
    srcNode: Node,
    srcPort: 'top' | 'bottom' | 'left' | 'right',
    dstNode: Node,
    dstPort: 'top' | 'bottom' | 'left' | 'right'
  ): Edge => {
    const id = 'edge_' + Math.random().toString(36).substring(2, 9);
    const srcPos = getPortPosition(srcNode, srcPort);
    const dstPos = getPortPosition(dstNode, dstPort);
    const srcEnd = ConnEnd.atPoint(mod, srcPos, getDirFlag(srcPort));
    const dstEnd = ConnEnd.atPoint(mod, dstPos, getDirFlag(dstPort));

    const connector = r.addConnector(srcEnd, dstEnd);
    connector.setRoutingType(RoutingType.Orthogonal);

    srcEnd.dispose();
    dstEnd.dispose();

    return {
      id,
      sourceNodeId: srcNode.id,
      sourcePortSide: srcPort,
      targetNodeId: dstNode.id,
      targetPortSide: dstPort,
      connector,
      checkpoints: [],
    };
  };

  // Function to add a brand new node from UI
  const handleAddNewNode = () => {
    console.log("handleAddNewNode triggered");
    const r = routerRef.current;
    console.log("Router in handleAddNewNode:", r);
    if (!r) {
      console.log("Router does not exist!");
      return;
    }

    // Place randomly in central area of canvas
    const x = 150 + Math.random() * 400;
    const y = 100 + Math.random() * 300;
    const newNode = addNodeHelper(r, `Node ${nodes.length + 1}`, x, y);

    r.processTransaction();
    console.log("Added new node:", newNode);
    setNodes((prev) => {
      const updated = [...prev, newNode];
      console.log("setNodes updated list:", updated);
      return updated;
    });
    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
  };

  // Function to delete selected item (either node or edge)
  const handleDeleteSelected = () => {
    const r = routerRef.current;
    if (!r) return;

    if (selectedNodeId) {
      const nodeToDelete = nodes.find((n) => n.id === selectedNodeId);
      if (!nodeToDelete) return;

      // 1. Delete connected connectors from C++ and filter them out of react state
      const remainingEdges = edges.filter((edge) => {
        if (edge.sourceNodeId === selectedNodeId || edge.targetNodeId === selectedNodeId) {
          r.deleteConnector(edge.connector);
          return false;
        }
        return true;
      });

      // 2. Delete shape from C++
      r.deleteShape(nodeToDelete.shape);

      // 3. Update React States
      setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
      setEdges(remainingEdges);
      setSelectedNodeId(null);

      r.processTransaction();
    } else if (selectedEdgeId) {
      const edgeToDelete = edges.find((e) => e.id === selectedEdgeId);
      if (!edgeToDelete) return;

      // 1. Delete connector from C++
      r.deleteConnector(edgeToDelete.connector);

      // 2. Update React State
      setEdges((prev) => prev.filter((e) => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);

      r.processTransaction();
    }
  };

  // Listen for delete/backspace key to remove selected items
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Prevent deleting if user is typing in inputs (if any)
        if (document.activeElement?.tagName === 'INPUT') return;
        handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedEdgeId, nodes, edges]);

  // Pointer move handler for Canvas: Handles dragging nodes, checkpoints, and drawing new edges (real-time routing)
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = routerRef.current;
    const mod = moduleRef.current;
    if (!r || !mod) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragState) {
      if (dragState.type === 'node') {
        const node = nodes.find((n) => n.id === dragState.id);
        if (!node) return;

        // Calculate delta drag
        const dx = x - dragState.startX;
        const dy = y - dragState.startY;

        if (dx === 0 && dy === 0) return;

        // Move the shape in libavoid
        r.moveShapeBy(node.shape, dx, dy);

        // Update node position in state
        const updatedNodes = nodes.map((n) =>
          n.id === dragState.id ? { ...n, x: n.x + dx, y: n.y + dy } : n
        );

        // Update endpoints of all connected edges
        updateConnectedEdges(r, mod, node.id, updatedNodes, edges);

        r.processTransaction();

        setNodes(updatedNodes);
        setDragState({
          type: 'node',
          id: node.id,
          startX: x,
          startY: y,
        });
      } else if (dragState.type === 'checkpoint') {
        const edge = edges.find((edgeItem) => edgeItem.id === dragState.edgeId);
        if (!edge) return;

        // Move the specific checkpoint
        const nextCheckpoints = edge.checkpoints.map((pt, idx) =>
          idx === dragState.index ? { x, y } : pt
        );

        // Update checkpoints on connector
        const spec = nextCheckpoints.map((pt) => ({ point: pt }));
        edge.connector.setRoutingCheckpoints(spec);

        r.processTransaction();

        setEdges((prev) =>
          prev.map((eItem) =>
            eItem.id === edge.id ? { ...eItem, checkpoints: nextCheckpoints } : eItem
          )
        );

        setDragState({
          type: 'checkpoint',
          edgeId: edge.id,
          index: dragState.index,
          startX: x,
          startY: y,
        });
      }
    } else if (linkingState) {
      // Update real-time preview connector's destination endpoint
      const srcNode = nodes.find((n) => n.id === linkingState.srcNodeId)!;
      const srcPos = getPortPosition(srcNode, linkingState.srcPortSide);

      const srcEnd = ConnEnd.atPoint(mod, srcPos, getDirFlag(linkingState.srcPortSide));
      const dstEnd = ConnEnd.atPoint(mod, { x, y });

      linkingState.previewConnector.setEndpoints(srcEnd, dstEnd);

      srcEnd.dispose();
      dstEnd.dispose();

      r.processTransaction();

      setLinkingState({
        ...linkingState,
        mousePos: { x, y },
      });
    }
  };

  // Helper to re-route all connected edges
  const updateConnectedEdges = (
    r: Router,
    mod: LibavoidModule,
    nodeId: string,
    currentNodes: Node[],
    currentEdges: Edge[]
  ) => {
    for (const edge of currentEdges) {
      if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) {
        const srcNode = currentNodes.find((n) => n.id === edge.sourceNodeId)!;
        const dstNode = currentNodes.find((n) => n.id === edge.targetNodeId)!;
        const srcPos = getPortPosition(srcNode, edge.sourcePortSide);
        const dstPos = getPortPosition(dstNode, edge.targetPortSide);

        const srcEnd = ConnEnd.atPoint(mod, srcPos, getDirFlag(edge.sourcePortSide));
        const dstEnd = ConnEnd.atPoint(mod, dstPos, getDirFlag(edge.targetPortSide));

        edge.connector.setEndpoints(srcEnd, dstEnd);

        srcEnd.dispose();
        dstEnd.dispose();
      }
    }
  };

  // Start dragging a node
  const handleNodeDragStart = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);

    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setDragState({
      type: 'node',
      id: nodeId,
      startX: x,
      startY: y,
    });
  };

  // Start linking from a port
  const handlePortPointerDown = (
    e: React.PointerEvent,
    nodeId: string,
    portSide: 'top' | 'bottom' | 'left' | 'right'
  ) => {
    e.stopPropagation();
    const r = routerRef.current;
    const mod = moduleRef.current;
    if (!r || !mod) return;

    const svgElement = e.currentTarget.closest('svg')!;
    const rect = svgElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const srcNode = nodes.find((n) => n.id === nodeId)!;
    const srcPos = getPortPosition(srcNode, portSide);

    // Create a temporary connector for real-time preview routing
    const srcEnd = ConnEnd.atPoint(mod, srcPos, getDirFlag(portSide));
    const dstEnd = ConnEnd.atPoint(mod, { x, y });

    const previewConnector = r.addConnector(srcEnd, dstEnd);
    previewConnector.setRoutingType(RoutingType.Orthogonal);

    srcEnd.dispose();
    dstEnd.dispose();

    r.processTransaction();

    setLinkingState({
      srcNodeId: nodeId,
      srcPortSide: portSide,
      mousePos: { x, y },
      previewConnector,
    });
  };

  // Finalize linking / pointer up
  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = routerRef.current;
    const mod = moduleRef.current;

    if (dragState) {
      setDragState(null);
    } else if (linkingState && r && mod) {
      // Check if released over another node's port
      const target = e.target as SVGElement;
      const targetPortAttr = target.getAttribute('data-port');

      if (targetPortAttr) {
        const [targetNodeId, targetPortSide] = targetPortAttr.split(':') as [
          string,
          'top' | 'bottom' | 'left' | 'right'
        ];

        // Ensure we aren't linking to the exact same node and port
        if (
          targetNodeId !== linkingState.srcNodeId ||
          targetPortSide !== linkingState.srcPortSide
        ) {
          const srcNode = nodes.find((n) => n.id === linkingState.srcNodeId)!;
          const dstNode = nodes.find((n) => n.id === targetNodeId)!;

          // Create permanent edge
          const newEdge = addEdgeHelper(
            r,
            mod,
            srcNode,
            linkingState.srcPortSide,
            dstNode,
            targetPortSide
          );

          setEdges((prev) => [...prev, newEdge]);
          setSelectedEdgeId(newEdge.id);
          setSelectedNodeId(null);
        }
      }

      // Cleanup preview connector
      r.deleteConnector(linkingState.previewConnector);
      r.processTransaction();
      setLinkingState(null);
    }
  };

  // Add a checkpoint when clicking on a selected edge path
  const handleEdgePathClick = (e: React.MouseEvent<SVGPathElement>, edgeId: string) => {
    e.stopPropagation();
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);

    const r = routerRef.current;
    const mod = moduleRef.current;
    if (!r || !mod) return;

    const edge = edges.find((edgeItem) => edgeItem.id === edgeId);
    if (!edge) return;

    // Calculate relative click coordinates
    const svgElement = e.currentTarget.closest('svg')!;
    const rect = svgElement.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const route = edge.connector.route();
    if (route.length === 0) return;

    // Check if click was indeed close to a segment of the route
    const clickedPoint = { x: clickX, y: clickY };
    const distToRoute = Math.min(
      ...route.slice(0, -1).map((pt, idx) => distanceToSegment(clickedPoint, pt, route[idx + 1]))
    );

    // Only insert checkpoint if clicking relatively close to path
    if (distToRoute < 20) {
      const nextCheckpoints = [...edge.checkpoints, clickedPoint];

      // Smart sorting of checkpoints along the routing path
      nextCheckpoints.sort((a, b) => getDistanceAlongRoute(a, route) - getDistanceAlongRoute(b, route));

      // Apply the updated checkpoints spec to libavoid connector
      const spec = nextCheckpoints.map((pt) => ({ point: pt }));
      edge.connector.setRoutingCheckpoints(spec);

      r.processTransaction();

      setEdges((prev) =>
        prev.map((eItem) =>
          eItem.id === edgeId ? { ...eItem, checkpoints: nextCheckpoints } : eItem
        )
      );

      // Start dragging this newly created checkpoint immediately
      const insertedIndex = nextCheckpoints.indexOf(clickedPoint);
      setDragState({
        type: 'checkpoint',
        edgeId,
        index: insertedIndex,
        startX: clickX,
        startY: clickY,
      });
    }
  };

  // Start dragging a checkpoint handle
  const handleCheckpointDragStart = (
    e: React.PointerEvent,
    edgeId: string,
    index: number
  ) => {
    e.stopPropagation();
    const rect = e.currentTarget.closest('svg')?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setDragState({
      type: 'checkpoint',
      edgeId,
      index,
      startX: x,
      startY: y,
    });
  };

  // Remove a checkpoint when double-clicking its handle
  const handleCheckpointDoubleClick = (e: React.MouseEvent, edgeId: string, index: number) => {
    e.stopPropagation();
    const r = routerRef.current;
    if (!r) return;

    const edge = edges.find((edgeItem) => edgeItem.id === edgeId);
    if (!edge) return;

    const nextCheckpoints = edge.checkpoints.filter((_, idx) => idx !== index);
    const spec = nextCheckpoints.map((pt) => ({ point: pt }));

    edge.connector.setRoutingCheckpoints(spec);
    r.processTransaction();

    setEdges((prev) =>
      prev.map((eItem) =>
        eItem.id === edgeId ? { ...eItem, checkpoints: nextCheckpoints } : eItem
      )
    );
  };

  // Completely clear and reset canvas to initial state
  const handleResetCanvas = () => {
    const r = routerRef.current;
    const mod = moduleRef.current;
    if (!r || !mod) return;

    // Delete all current shapes/connectors from C++
    for (const edge of edges) {
      r.deleteConnector(edge.connector);
    }
    for (const node of nodes) {
      r.deleteShape(node.shape);
    }

    // Set up initial diagram again
    const n1 = addNodeHelper(r, 'Input Node', 100, 150);
    const n2 = addNodeHelper(r, 'Process Card', 400, 100);
    const n3 = addNodeHelper(r, 'Output Result', 700, 250);

    const e1 = addEdgeHelper(r, mod, n1, 'right', n2, 'left');
    const e2 = addEdgeHelper(r, mod, n2, 'right', n3, 'top');

    r.processTransaction();

    setNodes([n1, n2, n3]);
    setEdges([e1, e2]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.titleArea}>
          <h1 style={styles.title}>Libavoid Connector Router</h1>
          <span style={styles.badge}>React + WebAssembly</span>
        </div>
        <p style={styles.subtitle}>
          Interactive orthgonal block diagram highlighting automatic object avoidance and manual route tuning.
        </p>
      </header>

      {/* Main workspace */}
      <div style={styles.workspace}>
        {/* Sidebar / Controls */}
        <aside style={styles.sidebar}>
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Controls</h3>
            <button style={styles.primaryButton} onClick={handleAddNewNode}>
              + Add Node
            </button>
            <button
              style={{
                ...styles.dangerButton,
                opacity: selectedNodeId || selectedEdgeId ? 1 : 0.5,
              }}
              onClick={handleDeleteSelected}
              disabled={!selectedNodeId && !selectedEdgeId}
            >
              🗑 Delete Selected
            </button>
            <button style={styles.secondaryButton} onClick={handleResetCanvas}>
              🔄 Reset Diagram
            </button>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Selected Item</h3>
            {selectedNodeId ? (
              <div style={styles.selectedDetails}>
                <p><strong>Type:</strong> Node</p>
                <p><strong>ID:</strong> {selectedNodeId}</p>
                <p><strong>Label:</strong> {nodes.find((n) => n.id === selectedNodeId)?.label}</p>
              </div>
            ) : selectedEdgeId ? (
              <div style={styles.selectedDetails}>
                <p><strong>Type:</strong> Connection Edge</p>
                <p><strong>ID:</strong> {selectedEdgeId}</p>
                <p><strong>Checkpoints:</strong> {edges.find((e) => e.id === selectedEdgeId)?.checkpoints.length}</p>
              </div>
            ) : (
              <p style={styles.emptyText}>No item selected. Click nodes or edges to customize.</p>
            )}
          </div>

          <div style={styles.instructions}>
            <h4 style={styles.instructionsTitle}>Guide</h4>
            <ul style={styles.instructionsList}>
              <li><strong>Move Node:</strong> Drag the center of any card.</li>
              <li><strong>Connect Nodes:</strong> Drag from any small dark port to another port.</li>
              <li><strong>Select Edge:</strong> Click once on any line.</li>
              <li><strong>Adjust Route:</strong> Click anywhere on a selected line to insert a checkpoint handle, then drag it!</li>
              <li><strong>Delete Checkpoint:</strong> Double-click the handle.</li>
              <li><strong>Delete Selected:</strong> Press <code>Backspace</code> or <code>Delete</code>.</li>
            </ul>
          </div>
        </aside>

        {/* Canvas Area */}
        <main style={styles.canvasContainer}>
          {!ready ? (
            <div style={styles.loader}>
              <div style={styles.spinner}></div>
              <p>Loading libavoid WASM engine...</p>
            </div>
          ) : (
            <svg
              width={width}
              height={height}
              style={{
                ...styles.canvas,
                cursor: linkingState ? 'crosshair' : 'default',
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              }}
            >
              {/* Subtle grid pattern background */}
              <defs>
                <pattern id="dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1" fill="#cbd5e1" />
                </pattern>
                {/* Custom arrowheads for routed connections */}
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#475569" />
                </marker>
                <marker
                  id="arrow-selected"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563eb" />
                </marker>
              </defs>
              <rect width="100%" height="100%" fill="url(#dot-grid)" />

              {/* 1. RENDER EDGES */}
              {edges.map((edge) => {
                const isSelected = selectedEdgeId === edge.id;
                const routePoints = edge.connector.route() || [];

                if (routePoints.length < 2) return null;

                // Build path string "M x1 y1 L x2 y2 ..."
                const pathData = routePoints
                  .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                  .join(' ');

                return (
                  <g key={edge.id}>
                    {/* Thick transparent backdrop path for easy selecting/clicking */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="14"
                      cursor="pointer"
                      onClick={(e) => handleEdgePathClick(e, edge.id)}
                    />
                    {/* Visual rendered path */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={isSelected ? '#2563eb' : '#64748b'}
                      strokeWidth={isSelected ? '3' : '2'}
                      markerEnd={isSelected ? 'url(#arrow-selected)' : 'url(#arrow)'}
                      pointerEvents="none"
                      style={{ transition: 'stroke 0.1s ease' }}
                    />
                  </g>
                );
              })}

              {/* 2. RENDER REALTIME PREVIEW CONNECTOR */}
              {linkingState && (() => {
                const routePoints = linkingState.previewConnector.route() || [];
                if (routePoints.length < 2) return null;

                const pathData = routePoints
                  .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                  .join(' ');

                return (
                  <path
                    d={pathData}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    strokeDasharray="4,4"
                    pointerEvents="none"
                  />
                );
              })()}

              {/* 3. RENDER NODES AND THEIR PORTS */}
              {nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;

                return (
                  <g key={node.id}>
                    {/* Node Card Box */}
                    <g
                      transform={`translate(${node.x}, ${node.y})`}
                      onPointerDown={(e) => handleNodeDragStart(e, node.id)}
                      style={{ cursor: 'move' }}
                    >
                      {/* Outer Card Rect */}
                      <rect
                        width={node.width}
                        height={node.height}
                        rx="8"
                        fill="#ffffff"
                        stroke={isSelected ? '#2563eb' : '#e2e8f0'}
                        strokeWidth={isSelected ? '2.5' : '1.5'}
                        style={styles.nodeCardShadow}
                      />
                      {/* Decorative header slice */}
                      <rect
                        width={node.width}
                        height="10"
                        rx="4"
                        fill={isSelected ? '#2563eb' : '#94a3b8'}
                      />
                      {/* Node Text Label */}
                      <text
                        x={node.width / 2}
                        y={node.height / 2 + 4}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={styles.nodeText}
                      >
                        {node.label}
                      </text>
                    </g>

                    {/* Port Circles rendered at Top, Bottom, Left, Right */}
                    {PORT_SIDES.map((side) => {
                      const pos = getPortPosition(node, side);
                      return (
                        <circle
                          key={`${node.id}-${side}`}
                          cx={pos.x}
                          cy={pos.y}
                          r="6"
                          fill="#475569"
                          stroke="#ffffff"
                          strokeWidth="1.5"
                          data-port={`${node.id}:${side}`}
                          style={styles.portCircle}
                          onPointerDown={(e) => handlePortPointerDown(e, node.id, side)}
                        />
                      );
                    })}
                  </g>
                );
              })}

              {/* 4. RENDER DRAGGABLE CHECKPOINT HANDLES (displayed only when an edge is selected) */}
              {edges.map((edge) => {
                if (selectedEdgeId !== edge.id) return null;
                return edge.checkpoints.map((pt, idx) => (
                  <g key={`${edge.id}-cp-${idx}`}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="7.5"
                      fill="#ea580c"
                      stroke="#ffffff"
                      strokeWidth="2"
                      style={styles.checkpointHandle}
                      onPointerDown={(e) => handleCheckpointDragStart(e, edge.id, idx)}
                      onDoubleClick={(e) => handleCheckpointDoubleClick(e, edge.id, idx)}
                    />
                  </g>
                ));
              })}
            </svg>
          )}
        </main>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    padding: '16px 24px',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },
  titleArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '4px',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 700,
    color: '#1e293b',
  },
  badge: {
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    fontSize: '11px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '9999px',
    border: '1px solid #bfdbfe',
  },
  subtitle: {
    margin: 0,
    fontSize: '13px',
    color: '#64748b',
  },
  workspace: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: '280px',
    backgroundColor: '#ffffff',
    borderRight: '1px solid #e2e8f0',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
    overflowY: 'auto' as const,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: '#94a3b8',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 16px',
    fontWeight: 600,
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  dangerButton: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 16px',
    fontWeight: 600,
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  secondaryButton: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    padding: '8px 16px',
    fontWeight: 600,
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  selectedDetails: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '12px',
    fontSize: '12.5px',
    color: '#334155',
    lineHeight: '1.6',
  },
  emptyText: {
    margin: 0,
    fontSize: '12.5px',
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  instructions: {
    marginTop: 'auto',
    backgroundColor: '#faf5ff',
    border: '1px solid #f3e8ff',
    borderRadius: '8px',
    padding: '16px',
  },
  instructionsTitle: {
    margin: '0 0 8px 0',
    fontSize: '12.5px',
    fontWeight: 600,
    color: '#6b21a8',
  },
  instructionsList: {
    margin: 0,
    paddingLeft: '16px',
    fontSize: '11.5px',
    color: '#581c87',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  canvasContainer: {
    flex: 1,
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto',
  },
  canvas: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.025)',
    userSelect: 'none' as const,
  },
  nodeCardShadow: {
    filter: 'drop-shadow(0 4px 3px rgba(0, 0, 0, 0.07)) drop-shadow(0 2px 2px rgba(0, 0, 0, 0.06))',
  },
  nodeText: {
    fontSize: '13px',
    fontWeight: 600,
    fill: '#334155',
    userSelect: 'none' as const,
  },
  portCircle: {
    cursor: 'pointer',
    transition: 'transform 0.1s ease, fill 0.1s ease',
  },
  checkpointHandle: {
    cursor: 'move',
    transition: 'transform 0.1s ease',
  },
  loader: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '16px',
    color: '#64748b',
    fontSize: '14px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #e2e8f0',
    borderTop: '4px solid #2563eb',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
