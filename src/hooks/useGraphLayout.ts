// ---------------------------------------------------------------------------
// hooks/useGraphLayout.ts — ELK layout computation + tree layout for call chains
// ---------------------------------------------------------------------------

import type { Node as ReactFlowNode, Edge as ReactFlowEdge } from 'reactflow';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs';
import type { CallChainMeta } from '../types/graph';

const elk = new ELK();

// ---------------------------------------------------------------------------
// Node size helpers — consistent sizes by type
// ---------------------------------------------------------------------------

function getNodeWidth(type: string): number {
  const widths: Record<string, number> = {
    service:          200,
    package:          180,
    file:             180,
    function:         200,
    struct:           180,
    interface:        180,
    cloud_service:    160,
    data_flow:        160,
    repository:       220,
    runtime_instance: 180,
  };
  return widths[type] ?? 180;
}

function getNodeHeight(type: string): number {
  const heights: Record<string, number> = {
    service:          60,
    package:          50,
    file:             50,
    function:         60,
    struct:           55,
    interface:        55,
    cloud_service:    55,
    data_flow:        50,
    repository:       65,
    runtime_instance: 55,
  };
  return heights[type] ?? 50;
}

// ---------------------------------------------------------------------------
// Pure async function: applies ELK layout to ReactFlow nodes and edges
// ---------------------------------------------------------------------------

export const applyElkLayout = async (
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  options: {
    direction?: 'TB' | 'LR';
    nodeSep?: number;
    rankSep?: number;
    rankByType?: boolean;
  } = {},
): Promise<{ nodes: ReactFlowNode[]; edges: ReactFlowEdge[] }> => {
  if (nodes.length === 0) {
    return { nodes, edges };
  }

  const nodeIds = new Set(nodes.map((n) => n.id));

  // Map direction to ELK equivalents
  const elkDirection = options.direction === 'LR' ? 'RIGHT' : 'DOWN';

  // Build ELK graph
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'mrtree',
      'elk.direction': elkDirection,
      'elk.spacing.nodeNode': String(options.nodeSep ?? 70),
      'elk.mrtree.spacing.nodeNode': String(options.rankSep ?? 90),
      'elk.padding': '[top=50,left=50,bottom=50,right=50]',
    },
    children: nodes.map((n) => {
      const nodeType = n.data?.type as string;
      return {
        id: n.id,
        width: n.width ?? getNodeWidth(nodeType),
        height: n.height ?? getNodeHeight(nodeType),
      };
    }),
    edges: edges
      .filter(
        (e) =>
          nodeIds.has(e.source) &&
          nodeIds.has(e.target) &&
          e.source !== e.target,
      )
      .map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
  };

  const layoutResult = await elk.layout(elkGraph);

  // Map ELK positions back onto ReactFlow nodes
  const positionMap = new Map<string, { x: number; y: number }>();
  for (const child of layoutResult.children ?? []) {
    positionMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  const layoutedNodes = nodes.map((n) => {
    const pos = positionMap.get(n.id);
    if (!pos) return n;
    return { ...n, position: pos };
  });

  return { nodes: layoutedNodes, edges };
};

// ---------------------------------------------------------------------------
// Tree layout for call-chain mode — positions nodes in a top-down tree
// using depths from CallChainMeta
// ---------------------------------------------------------------------------

export const applyTreeLayout = async (
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  meta: CallChainMeta,
): Promise<{ nodes: ReactFlowNode[]; edges: ReactFlowEdge[] }> => {
  if (nodes.length === 0) return { nodes, edges };

  // Group nodes by depth level
  const depthBuckets = new Map<number, ReactFlowNode[]>();
  let maxDepth = 0;

  // Callers (depth -1) vs callees (depth 0+)
  for (const n of nodes) {
    const depth = meta.depths[n.id] ?? -1; // callers default to -1
    const existing = depthBuckets.get(depth) ?? [];
    existing.push(n);
    depthBuckets.set(depth, existing);
    if (depth > maxDepth) maxDepth = depth;
  }

  const NODE_W = 140;
  const NODE_H = 90;
  const H_GAP = 60;
  const V_GAP = 50;

  // Build ELK graph with layer constraints derived from call-chain depth
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'mrtree',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': String(H_GAP),
      'elk.mrtree.spacing.nodeNode': String(V_GAP),
      'elk.padding': '[top=50,left=50,bottom=50,right=50]',
    },
    children: nodes.map((n) => {
      return {
        id: n.id,
        width: NODE_W,
        height: NODE_H,
      };
    }),
    edges: edges
      .filter(
        (e) =>
          new Set(nodes.map((n) => n.id)).has(e.source) &&
          new Set(nodes.map((n) => n.id)).has(e.target) &&
          e.source !== e.target,
      )
      .map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
  };

  try {
    const layoutResult = await elk.layout(elkGraph);

    const positionMap = new Map<string, { x: number; y: number }>();
    for (const child of layoutResult.children ?? []) {
      positionMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
    }

    const layoutedNodes = nodes.map((n) => {
      const pos = positionMap.get(n.id);
      if (!pos) return n;
      return { ...n, position: pos };
    });

    return { nodes: layoutedNodes, edges };
  } catch {
    // Fallback: manual tree layout if ELK fails with the depth constraints
    const layoutedNodes = nodes.map((n) => {
      const depth = meta.depths[n.id] ?? -1;
      const bucket = depthBuckets.get(depth) ?? [n];
      const idx = bucket.indexOf(n);
      const count = bucket.length;
      const totalWidth = count * NODE_W + (count - 1) * H_GAP;
      const startX = -totalWidth / 2;

      return {
        ...n,
        position: {
          x: startX + idx * (NODE_W + H_GAP),
          y: (depth + 1) * (NODE_H + V_GAP),
        },
      };
    });

    return { nodes: layoutedNodes, edges };
  }
};
