import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { loadLibavoid, Router, ConnEnd, RouterFlag, RoutingType } from 'libavoid-wasm';

type Module = any;

type Node = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  shape: any;
};

type Port = {
  id: string;
  nodeId: number;
  side: 'left' | 'right' | 'top' | 'bottom';
  x: number;
  y: number;
  connEnd: any;
};

type Edge = {
  id: string;
  source: string;
  target: string;
  connector: any;
};

type DragState = {
  type: 'node' | 'port';
  id: string | number;
  offsetX: number;
  offsetY: number;
};

const NODE_SIZE = { width: 120, height: 70 };

function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [router, setRouter] = useState<Router | null>(null);
  const [module, setModule] = useState<Module | null>(null);
  const [ready, setReady] = useState(false);
  const dragState = useRef<DragState | null>(null);

  const rerender = () => setNodes((current) => [...current]);

  const createNode = (r: Router, mod: Module, x: number, y: number, label: string, id: number): Node => {
    const shape = r.addRectangle({ x, y }, { x: x + NODE_SIZE.width, y: y + NODE_SIZE.height }, id);
    return { id, x, y, width: NODE_SIZE.width, height: NODE_SIZE.height, label, shape };
  };

  const createPortsForNode = (node: Node, mod: Module): Port[] => {
    const left = {
      id: `${node.id}-left`,
      nodeId: node.id,
      side: 'left' as const,
      x: node.x,
      y: node.y + node.height / 2,
      connEnd: ConnEnd.atPoint(mod, { x: node.x, y: node.y + node.height / 2 }),
    };
    const right = {
      id: `${node.id}-right`,
      nodeId: node.id,
      side: 'right' as const,
      x: node.x + node.width,
      y: node.y + node.height / 2,
      connEnd: ConnEnd.atPoint(mod, { x: node.x + node.width, y: node.y + node.height / 2 }),
    };
    return [left, right];
  };

  const createEdge = (r: Router, src: Port, dst: Port): Edge => {
    const connector = r.addConnector(src.connEnd, dst.connEnd);
    connector.setRoutingType(RoutingType.Orthogonal);
    return { id: `${src.id}-${dst.id}`, source: src.id, target: dst.id, connector };
  };

  const refreshPortsForNodes = (nextNodes: Node[], nextPorts: Port[], mod: Module) => {
    const freshPorts = nextNodes.flatMap((node) => {
      const existing = nextPorts.filter((p) => p.nodeId === node.id);
      if (existing.length) {
        return existing.map((port) => ({ ...port, x: port.side === 'left' ? node.x : node.x + node.width, y: node.y + node.height / 2 }));
      }
      return createPortsForNode(node, mod);
    });
    return freshPorts;
  };

  const commitLayout = () => {
    if (!router) return;
    router.processTransaction();
    rerender();
  };

  useEffect(() => {
    let canceled = false;
    loadLibavoid().then((mod) => {
      if (canceled) return;
      const r = new Router(mod, RouterFlag.OrthogonalRouting);
      r.setRoutingOption(4, true); // ImproveHyperedgeRoutesMovingAddingAndDeletingJunctions
      setModule(mod);
      setRouter(r);

      const initialNodes = [
        createNode(r, mod, 80, 80, 'Input', 1),
        createNode(r, mod, 320, 80, 'Process', 2),
      ];
      const initialPorts = refreshPortsForNodes(initialNodes, [], mod);
      setNodes(initialNodes);
      setPorts(initialPorts);
      setEdges([createEdge(r, initialPorts[1], initialPorts[3])]);
      setReady(true);
    });
    return () => {
      canceled = true;
    };
  }, []);

  const handleAddNode = () => {
    if (!router || !module) return;
    const id = Date.now();
    const node = createNode(router, module, 120 + nodes.length * 80, 120, `Node ${nodes.length + 1}`, id);
    const nextNodes = [...nodes, node];
    const nextPorts = refreshPortsForNodes(nextNodes, ports, module);
    setNodes(nextNodes);
    setPorts(nextPorts);
    commitLayout();
  };

  const handleDeleteSelected = () => {
    if (!router || selectedNodeId == null) return;
    const node = nodes.find((entry) => entry.id === selectedNodeId);
    if (!node) return;

    const remainingNodes = nodes.filter((entry) => entry.id !== selectedNodeId);
    const remainingPorts = ports.filter((port) => port.nodeId !== selectedNodeId);
    const remainingEdges = edges.filter((edge) => {
      const src = remainingPorts.find((port) => port.id === edge.source);
      const dst = remainingPorts.find((port) => port.id === edge.target);
      return src && dst;
    });

    for (const port of ports.filter((entry) => entry.nodeId === selectedNodeId)) {
      port.connEnd.dispose();
    }
    for (const edge of edges.filter((entry) => entry.source.startsWith(`${selectedNodeId}-`) || entry.target.startsWith(`${selectedNodeId}-`))) {
      router.deleteConnector(edge.connector);
    }
    router.deleteShape(node.shape);

    setNodes(remainingNodes);
    setPorts(remainingPorts);
    setEdges(remainingEdges);
    setSelectedNodeId(null);
    commitLayout();
  };

  const handlePointerDown = (type: 'node' | 'port', id: string | number, x: number, y: number) => {
    const node = nodes.find((entry) => entry.id === id);
    if (type === 'node' && node) {
      dragState.current = { type, id, offsetX: x - node.x, offsetY: y - node.y };
      setSelectedNodeId(node.id);
      return;
    }

    const port = ports.find((entry) => entry.id === id);
    if (port) {
      dragState.current = { type, id, offsetX: x - port.x, offsetY: y - port.y };
    }
  };

  const updateEdgeEndpoints = (edge: Edge, updatedPort: Port) => {
    const otherPort = ports.find((port) => port.id === (edge.source === updatedPort.id ? edge.target : edge.source));
    if (!otherPort || !module) return;
    const src = edge.source === updatedPort.id ? updatedPort : otherPort;
    const dst = edge.target === updatedPort.id ? updatedPort : otherPort;
    const srcEnd = ConnEnd.atPoint(module, { x: src.x, y: src.y });
    const dstEnd = ConnEnd.atPoint(module, { x: dst.x, y: dst.y });
    edge.connector.setEndpoints(srcEnd, dstEnd);
    srcEnd.dispose();
    dstEnd.dispose();
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!router || !dragState.current || !module) return;
    const svgRect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - svgRect.left;
    const y = event.clientY - svgRect.top;

    if (dragState.current.type === 'node') {
      const id = dragState.current.id as number;
      const node = nodes.find((entry) => entry.id === id);
      if (!node) return;

      const nextX = x - dragState.current.offsetX;
      const nextY = y - dragState.current.offsetY;
      const nextNodes = nodes.map((entry) => (entry.id === id ? { ...entry, x: nextX, y: nextY } : entry));
      const nextPorts = refreshPortsForNodes(nextNodes, ports, module);
      setNodes(nextNodes);
      setPorts(nextPorts);

      router.moveShapeBy(node.shape, nextX - node.x, nextY - node.y);
      for (const edge of edges) {
        const sourcePort = nextPorts.find((port) => port.id === edge.source);
        const targetPort = nextPorts.find((port) => port.id === edge.target);
        if (sourcePort && targetPort) {
          const srcEnd = ConnEnd.atPoint(module, { x: sourcePort.x, y: sourcePort.y });
          const dstEnd = ConnEnd.atPoint(module, { x: targetPort.x, y: targetPort.y });
          edge.connector.setEndpoints(srcEnd, dstEnd);
          srcEnd.dispose();
          dstEnd.dispose();
        }
      }
      router.processTransaction();
      return;
    }

    const portId = dragState.current.id as string;
    const port = ports.find((entry) => entry.id === portId);
    if (!port) return;

    const nextPorts = ports.map((entry) => (entry.id === portId ? { ...entry, x, y } : entry));
    setPorts(nextPorts);

    for (const edge of edges.filter((entry) => entry.source === port.id || entry.target === port.id)) {
      updateEdgeEndpoints(edge, { ...port, x, y });
    }
    router.processTransaction();
  };

  const handlePointerUp = () => {
    dragState.current = null;
    router?.processTransaction();
    rerender();
  };

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h2>React block diagram demo</h2>
      <p>Drag nodes and ports to update routing live. Add or delete nodes and the connectors reroute automatically.</p>
      {!ready && <p>Loading libavoid WebAssembly...</p>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={handleAddNode}>Add node</button>
        <button onClick={handleDeleteSelected} disabled={selectedNodeId == null}>Delete selected</button>
      </div>
      <svg
        width="800"
        height="500"
        style={{ border: '1px solid #ddd', background: '#fafafa' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Render edges first (behind nodes) */}
        {edges.map((edge) => {
          const sourcePort = ports.find((p) => p.id === edge.source);
          const targetPort = ports.find((p) => p.id === edge.target);
          if (!sourcePort || !targetPort) return null;

          const route = edge.connector.route() || [];
          if (route.length === 0) {
            return (
              <line
                key={edge.id}
                x1={sourcePort.x}
                y1={sourcePort.y}
                x2={targetPort.x}
                y2={targetPort.y}
                stroke="#666"
                strokeWidth="2"
                pointerEvents="none"
              />
            );
          }

          let d = `M ${sourcePort.x} ${sourcePort.y}`;
          for (const pt of route) {
            d += ` L ${pt.x} ${pt.y}`;
          }

          return (
            <path
              key={edge.id}
              d={d}
              stroke="#666"
              strokeWidth="2"
              fill="none"
              pointerEvents="none"
            />
          );
        })}

        {/* Render nodes */}
        {nodes.map((node) => (
          <g key={node.id} onPointerDown={(e) => handlePointerDown('node', node.id, e.clientX - (e.currentTarget as any).getBoundingClientRect().left, e.clientY - (e.currentTarget as any).getBoundingClientRect().top)}>
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              fill={selectedNodeId === node.id ? '#e0e0ff' : '#fff'}
              stroke="#333"
              strokeWidth="2"
              rx="4"
              cursor="move"
            />
            <text
              x={node.x + node.width / 2}
              y={node.y + node.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="14"
              pointerEvents="none"
            >
              {node.label}
            </text>

            {/* Render ports */}
            {ports
              .filter((port) => port.nodeId === node.id)
              .map((port) => (
                <circle
                  key={port.id}
                  cx={port.x}
                  cy={port.y}
                  r="6"
                  fill="#666"
                  stroke="#333"
                  strokeWidth="1"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    handlePointerDown('port', port.id, e.clientX - (e.currentTarget as any).getBoundingClientRect().left, e.clientY - (e.currentTarget as any).getBoundingClientRect().top);
                  }}
                  cursor="grab"
                  style={{ userSelect: 'none' }}
                />
              ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
