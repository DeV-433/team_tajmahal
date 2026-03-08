// ---------------------------------------------------------------------------
// components/GraphCanvas.tsx — Call chain visualization canvas (simplified)
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, type FC } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import CallChainNode from './nodes/CallChainNode';
import CallChainEdge, { CallChainMarkers } from './edges/CallChainEdge';
import ChainStatsBar from './ChainStatsBar';
import type { UseGraphReturn } from '../hooks/useGraph';
import type { UseSSEReturn } from '../hooks/useSSE';

interface GraphCanvasProps {
  graph: UseGraphReturn;
  sse: UseSSEReturn;
}

const GraphCanvas: FC<GraphCanvasProps> = ({ graph, sse }) => {
  const nodeTypes = useMemo(
    () => ({ callChainNode: CallChainNode }),
    [],
  );
  const edgeTypes = useMemo(
    () => ({ callChain: CallChainEdge }),
    [],
  );

  const { fitView } = useReactFlow();
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(graph.nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(graph.edges);

  // Sync external graph state → React Flow state
  useEffect(() => {
    setRfNodes(graph.nodes);
    setRfEdges(graph.edges);
  }, [graph.nodes, graph.edges, setRfNodes, setRfEdges]);

  // Auto fit-view when nodes change
  useEffect(() => {
    if (rfNodes.length > 0) {
      const timer = setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100);
      return () => clearTimeout(timer);
    }
  }, [rfNodes.length, fitView]);

  const { canvasMode, callChainMeta, exitCallChain } = graph;
  const isCallChain = canvasMode === 'call_chain' && callChainMeta !== null;

  // Empty state
  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-transparent">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg shadow-blue-500/20">
            <span className="text-2xl font-bold tracking-tight text-white" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>C</span>
          </div>
          <h2 className="text-xl font-bold text-gray-200" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Codrix.ai</h2>
          <p className="text-sm text-gray-500">
            Select a tool above and enter a query to explore your codebase
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{ animated: false }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="#1a2236"
          gap={28}
          size={1}
          style={{ backgroundColor: 'transparent' }}
        />

        {isCallChain && <CallChainMarkers />}

        <Controls
          position="bottom-left"
          className="!border-gray-700 !bg-gray-800 [&>button]:!border-gray-700 [&>button]:!bg-gray-800 [&>button]:!text-gray-300 [&>button:hover]:!bg-gray-700"
        />

        {/* Call chain stats bar */}
        {isCallChain && callChainMeta && (
          <Panel position="top-center">
            <ChainStatsBar
              stats={callChainMeta.stats}
              rootName={
                graph.nodes.find((n) => n.id === callChainMeta.root_id)?.data?.name ??
                callChainMeta.root_id
              }
              onClose={exitCallChain}
            />
          </Panel>
        )}
      </ReactFlow>

      {/* Error banner */}
      {graph.error && (
        <div className="absolute left-4 right-4 top-4 z-40 flex items-center gap-3 rounded-lg bg-red-900/90 px-4 py-2.5 text-sm text-red-200 shadow-lg backdrop-blur">
          <span className="flex-1 truncate">{graph.error}</span>
          <button
            onClick={() => graph.setError(null)}
            className="shrink-0 text-red-400 transition-colors hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default GraphCanvas;
