// ---------------------------------------------------------------------------
// hooks/useGraph.ts — Graph state management (contextplus-backed)
// ---------------------------------------------------------------------------

import { useCallback, useMemo, useState } from 'react';
import type { Node as ReactFlowNode, Edge as ReactFlowEdge } from 'reactflow';
import type { CallChainMeta, CanvasMode, FlatEdge, FlatNode } from '../types/graph';
import { applyTreeLayout } from './useGraphLayout';

// ---------------------------------------------------------------------------
// Convert FlatNode to a CallChainNode ReactFlow node
// ---------------------------------------------------------------------------

function flatNodeToRF(n: FlatNode, meta: CallChainMeta): ReactFlowNode {
  const annotations = [
    ...(n.annotations ?? []),
    ...(meta.annotations[n.id] ?? []),
  ];
  const depth = meta.depths[n.id] ?? -1;
  const role = meta.node_roles[n.id] ?? 'callee';
  const isExternal = annotations.includes('external') || annotations.includes('ext');

  return {
    id: n.id,
    type: 'callChainNode',
    position: { x: 0, y: 0 },
    data: {
      name: n.name,
      file_path: n.file_path,
      line_start: n.line,
      line_end: n.end_line,
      signature: n.signature,
      is_external: isExternal,
      annotations,
      chainDepth: depth,
      role,
    },
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseGraphReturn {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  canvasMode: CanvasMode;
  callChainMeta: CallChainMeta | null;
  textResult: string | null;
  textTool: string | null;
  setCallChainData: (nodes: ReactFlowNode[], edges: ReactFlowEdge[], meta: CallChainMeta) => void;
  setCallChainFromResponse: (
    flatNodes: FlatNode[],
    flatEdges: FlatEdge[],
    meta: CallChainMeta,
  ) => Promise<void>;
  setTextResult: (tool: string, text: string) => void;
  exitCallChain: () => void;
  clearAll: () => void;
  /** Restore a previously saved snapshot of nodes + edges. */
  restoreSnapshot: (nodes: ReactFlowNode[], edges: ReactFlowEdge[]) => void;
  isLoading: boolean;
  error: string | null;
  setError: (e: string | null) => void;
}

export function useGraph(): UseGraphReturn {
  const [rfNodes, setNodes] = useState<ReactFlowNode[]>([]);
  const [rfEdges, setEdges] = useState<ReactFlowEdge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('call_chain');
  const [callChainMeta, setCallChainMeta] = useState<CallChainMeta | null>(null);
  const [textResult, setTextResultState] = useState<string | null>(null);
  const [textTool, setTextTool] = useState<string | null>(null);

  // ---- Set call chain from already-built ReactFlow nodes -------------------
  const setCallChainData = useCallback(
    async (newNodes: ReactFlowNode[], newEdges: ReactFlowEdge[], meta: CallChainMeta) => {
      setCanvasMode('call_chain');
      setCallChainMeta(meta);
      setTextResultState(null);
      setTextTool(null);
      const { nodes: ln, edges: le } = await applyTreeLayout(newNodes, newEdges, meta);
      setNodes(ln);
      setEdges(le);
    },
    [],
  );

  // ---- Set call chain from raw API response --------------------------------
  const setCallChainFromResponse = useCallback(
    async (
      flatNodes: FlatNode[],
      flatEdges: FlatEdge[],
      meta: CallChainMeta,
    ) => {
      const rfN = flatNodes.map((n) => flatNodeToRF(n, meta));
      const rfE: ReactFlowEdge[] = flatEdges.map((e) => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: 'callChain' as const,
        data: { type: e.type ?? 'calls', isCycle: false },
      }));
      setCanvasMode('call_chain');
      setCallChainMeta(meta);
      setTextResultState(null);
      setTextTool(null);
      const { nodes: ln, edges: le } = await applyTreeLayout(rfN, rfE, meta);
      setNodes(ln);
      setEdges(le);
    },
    [],
  );

  // ---- Set text result (search, skeleton, etc.) ----------------------------
  const setTextResult = useCallback((tool: string, text: string) => {
    setCanvasMode('text_result');
    setCallChainMeta(null);
    setTextResultState(text);
    setTextTool(tool);
    setNodes([]);
    setEdges([]);
  }, []);

  // ---- Exit call chain mode ------------------------------------------------
  const exitCallChain = useCallback(() => {
    setCanvasMode('call_chain');
    setCallChainMeta(null);
    setNodes([]);
    setEdges([]);
  }, []);

  // ---- Clear all -----------------------------------------------------------
  const clearAll = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setCanvasMode('call_chain');
    setCallChainMeta(null);
    setTextResultState(null);
    setTextTool(null);
    setError(null);
  }, []);

  // ---- Restore a saved snapshot -------------------------------------------
  const restoreSnapshot = useCallback(
    (nodes: ReactFlowNode[], edges: ReactFlowEdge[]) => {
      setCanvasMode('call_chain');
      setCallChainMeta(null);
      setTextResultState(null);
      setTextTool(null);
      setError(null);
      setNodes(nodes);
      setEdges(edges);
    },
    [],
  );

  return {
    nodes: rfNodes,
    edges: rfEdges,
    canvasMode,
    callChainMeta,
    textResult,
    textTool,
    setCallChainData,
    setCallChainFromResponse,
    setTextResult,
    exitCallChain,
    clearAll,
    restoreSnapshot,
    isLoading,
    error,
    setError,
  };
}
