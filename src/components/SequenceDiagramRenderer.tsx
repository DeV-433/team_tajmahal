// ---------------------------------------------------------------------------
// SequenceDiagramRenderer.tsx — UML Sequence Diagram using ReactFlow + ELKjs
//   Renders actors as header boxes with vertical lifelines, messages as
//   horizontal arrows between lifelines, with proper UML styling.
// ---------------------------------------------------------------------------

import { useMemo, useState, useCallback, type FC } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Icon } from '@iconify/react';
import type { SequenceDiagramSpec, SeqActor, SeqMessage } from '../types/graph';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTOR_WIDTH = 140;
const ACTOR_HEIGHT = 60;
const ACTOR_SPACING = 180;
const MSG_ROW_HEIGHT = 50;
const TOP_MARGIN = 20;
const LIFELINE_START_Y = ACTOR_HEIGHT + TOP_MARGIN + 10;

// Actor type → icon
const ACTOR_ICON: Record<string, string> = {
  actor: 'lucide:user',
  service: 'lucide:server',
  database: 'lucide:database',
  external: 'lucide:globe',
};

// Actor type → default color
const ACTOR_DEFAULT_COLOR: Record<string, string> = {
  actor: '#8B5CF6',
  service: '#3B82F6',
  database: '#0891B2',
  external: '#D97706',
};

// ---------------------------------------------------------------------------
// Custom Node: Actor Header
// ---------------------------------------------------------------------------

interface ActorNodeData {
  label: string;
  actorType: string;
  color: string;
  lifelineHeight: number;
}

const ActorNode: FC<NodeProps<ActorNodeData>> = ({ data }) => {
  const color = data.color;
  return (
    <div className="flex flex-col items-center" style={{ width: ACTOR_WIDTH }}>
      {/* Actor box */}
      <div
        className="flex flex-col items-center justify-center rounded-xl border backdrop-blur-xl px-3 py-2 shadow-lg"
        style={{
          width: ACTOR_WIDTH,
          height: ACTOR_HEIGHT,
          backgroundColor: color + '18',
          borderColor: color + '50',
        }}
      >
        <Icon
          icon={ACTOR_ICON[data.actorType] || 'lucide:box'}
          width={20}
          style={{ color }}
        />
        <span
          className="mt-1 text-[11px] font-semibold text-center leading-tight"
          style={{ color }}
        >
          {data.label}
        </span>
      </div>

      {/* Lifeline (dashed vertical line) */}
      <div
        style={{
          width: 2,
          height: data.lifelineHeight,
          backgroundImage: `repeating-linear-gradient(to bottom, ${color}50 0, ${color}50 6px, transparent 6px, transparent 12px)`,
        }}
      />

      {/* Hidden handles for edges */}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Custom Node: Message Label (sits on the arrow)
// ---------------------------------------------------------------------------

interface MessageNodeData {
  label: string;
  msgType: string;
  isReply: boolean;
  isSelfCall: boolean;
  fromX: number;
  toX: number;
  color: string;
}

const MessageNode: FC<NodeProps<MessageNodeData>> = ({ data }) => {
  const isReply = data.isReply;
  const isSelfCall = data.isSelfCall;
  const goesLeft = data.toX < data.fromX;
  const arrowWidth = Math.abs(data.toX - data.fromX);
  const minX = Math.min(data.fromX, data.toX);

  if (isSelfCall) {
    // Self-call: loop arrow on the right side
    return (
      <div className="relative" style={{ width: 80, height: MSG_ROW_HEIGHT }}>
        <svg width={80} height={MSG_ROW_HEIGHT} className="absolute top-0 left-0">
          <path
            d={`M 0,${MSG_ROW_HEIGHT / 2 - 10} L 60,${MSG_ROW_HEIGHT / 2 - 10} L 60,${MSG_ROW_HEIGHT / 2 + 10} L 0,${MSG_ROW_HEIGHT / 2 + 10}`}
            fill="none"
            stroke={data.color + '80'}
            strokeWidth={1.5}
            markerEnd="url(#arrowhead)"
          />
        </svg>
        <span
          className="absolute text-[9px] font-medium"
          style={{
            top: 2,
            left: 4,
            color: data.color,
          }}
        >
          {data.label}
        </span>
      </div>
    );
  }

  return (
    <div
      className="relative flex items-center"
      style={{ width: arrowWidth, height: MSG_ROW_HEIGHT }}
    >
      {/* Arrow line */}
      <svg
        width={arrowWidth}
        height={MSG_ROW_HEIGHT}
        className="absolute top-0 left-0"
      >
        <defs>
          <marker
            id="arrowSolid"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill={data.color + 'AA'} />
          </marker>
          <marker
            id="arrowOpen"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polyline
              points="0 0, 8 3, 0 6"
              fill="none"
              stroke={data.color + 'AA'}
              strokeWidth="1.5"
            />
          </marker>
        </defs>
        <line
          x1={goesLeft ? arrowWidth : 0}
          y1={MSG_ROW_HEIGHT / 2}
          x2={goesLeft ? 0 : arrowWidth}
          y2={MSG_ROW_HEIGHT / 2}
          stroke={data.color + '80'}
          strokeWidth={1.5}
          strokeDasharray={isReply ? '6 4' : 'none'}
          markerEnd={isReply ? 'url(#arrowOpen)' : 'url(#arrowSolid)'}
        />
      </svg>

      {/* Label above arrow */}
      <span
        className="absolute text-[9px] font-medium whitespace-nowrap px-1 rounded"
        style={{
          top: MSG_ROW_HEIGHT / 2 - 16,
          left: '50%',
          transform: 'translateX(-50%)',
          color: data.color,
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
        }}
      >
        {data.label}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Build nodes/edges from SequenceDiagramSpec
// ---------------------------------------------------------------------------

function buildSequenceDiagram(spec: SequenceDiagramSpec): {
  nodes: RFNode[];
  edges: RFEdge[];
} {
  const actors = spec.actors || [];
  const messages = (spec.messages || []).sort((a, b) => a.order - b.order);

  // Map actor id → column index (x position)
  const actorIdx = new Map<string, number>();
  actors.forEach((a, i) => actorIdx.set(a.id, i));

  const lifelineHeight = (messages.length + 1) * MSG_ROW_HEIGHT + 40;
  const nodes: RFNode[] = [];
  const edges: RFEdge[] = [];

  // 1. Actor header nodes
  actors.forEach((actor, i) => {
    const color = actor.color || ACTOR_DEFAULT_COLOR[actor.type] || '#8B5CF6';
    nodes.push({
      id: actor.id,
      type: 'seqActor',
      position: { x: i * ACTOR_SPACING, y: TOP_MARGIN },
      data: {
        label: actor.label,
        actorType: actor.type,
        color,
        lifelineHeight,
      },
      draggable: false,
      selectable: false,
    });
  });

  // 2. Message arrow edges (drawn as actual ReactFlow edges between invisible anchor nodes)
  messages.forEach((msg, i) => {
    const fromIdx = actorIdx.get(msg.from);
    const toIdx = actorIdx.get(msg.to);
    if (fromIdx === undefined || toIdx === undefined) return;

    const y = LIFELINE_START_Y + i * MSG_ROW_HEIGHT + MSG_ROW_HEIGHT / 2;
    const fromX = fromIdx * ACTOR_SPACING + ACTOR_WIDTH / 2;
    const toX = toIdx * ACTOR_SPACING + ACTOR_WIDTH / 2;
    const isReply = msg.type === 'reply';
    const isSelfCall = msg.from === msg.to;
    const color = actors[fromIdx]?.color || ACTOR_DEFAULT_COLOR[actors[fromIdx]?.type] || '#8B5CF6';

    // Source anchor
    const srcId = `anchor-src-${i}`;
    nodes.push({
      id: srcId,
      type: 'default',
      position: { x: fromX - 1, y },
      data: { label: '' },
      style: { width: 2, height: 2, opacity: 0, padding: 0, border: 'none', background: 'none' },
      draggable: false,
      selectable: false,
    });

    // Target anchor
    const tgtId = `anchor-tgt-${i}`;
    nodes.push({
      id: tgtId,
      type: 'default',
      position: { x: toX - 1, y },
      data: { label: '' },
      style: { width: 2, height: 2, opacity: 0, padding: 0, border: 'none', background: 'none' },
      draggable: false,
      selectable: false,
    });

    edges.push({
      id: `msg-edge-${i}`,
      source: srcId,
      target: isSelfCall ? srcId : tgtId,
      type: 'straight',
      animated: msg.type === 'async',
      label: msg.label,
      style: {
        stroke: color + '80',
        strokeWidth: 1.5,
        ...(isReply ? { strokeDasharray: '6 4' } : {}),
      },
      labelStyle: {
        fill: '#CBD5E1',
        fontSize: 9,
        fontWeight: 500,
      },
      labelBgStyle: {
        fill: '#0F172A',
        fillOpacity: 0.92,
      },
      labelBgPadding: [4, 3] as [number, number],
      markerEnd: {
        type: isReply ? MarkerType.Arrow : MarkerType.ArrowClosed,
        color: color + 'AA',
        width: 12,
        height: 10,
      },
    });
  });

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Exported Component
// ---------------------------------------------------------------------------

interface SequenceDiagramRendererProps {
  spec: SequenceDiagramSpec;
  diagramKey: number;
}

const nodeTypes = {
  seqActor: ActorNode,
  seqMessage: MessageNode,
};

const SequenceDiagramRenderer: FC<SequenceDiagramRendererProps> = ({
  spec,
  diagramKey,
}) => {
  const { nodes, edges } = useMemo(() => buildSequenceDiagram(spec), [spec]);
  const [highlightEdgeId, setHighlightEdgeId] = useState<string | null>(null);

  const styledNodes = useMemo(() => {
    if (!highlightEdgeId) return nodes;
    const edge = edges.find((e) => e.id === highlightEdgeId);
    if (!edge) return nodes;
    const hl = new Set([edge.source, edge.target]);
    return nodes.map((n) => ({
      ...n,
      style: { ...n.style, opacity: hl.has(n.id) ? 1 : 0.15, transition: 'opacity 0.3s ease' },
    }));
  }, [nodes, edges, highlightEdgeId]);

  const styledEdges = useMemo(() => {
    if (!highlightEdgeId) return edges;
    return edges.map((e) => ({
      ...e,
      style: {
        ...e.style,
        opacity: e.id === highlightEdgeId ? 1 : 0.08,
        strokeWidth: e.id === highlightEdgeId ? 2.5 : 1,
        transition: 'opacity 0.3s ease, stroke-width 0.3s ease',
      },
      labelStyle: {
        ...(e.labelStyle as Record<string, unknown> ?? {}),
        opacity: e.id === highlightEdgeId ? 1 : 0.08,
        transition: 'opacity 0.3s ease',
      },
    }));
  }, [edges, highlightEdgeId]);

  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: RFEdge) => {
    setHighlightEdgeId((prev) => (prev === edge.id ? null : edge.id));
  }, []);

  return (
    <div key={diagramKey} className="h-full w-full relative" style={{ animation: 'diagramFadeIn 0.5s ease-out' }}>
      {highlightEdgeId && (
        <button
          onClick={() => setHighlightEdgeId(null)}
          className="absolute top-3 right-3 z-50 flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-gray-900/80 px-3 py-1.5 text-xs font-medium text-gray-300 backdrop-blur-xl transition-colors hover:bg-gray-800 hover:text-white"
        >
          <Icon icon="lucide:x" width={12} />
          Clear highlight
        </button>
      )}
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onEdgeClick={handleEdgeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background
          color="#1a2236"
          gap={28}
          size={1}
          style={{ backgroundColor: 'transparent' }}
        />
        <Controls
          position="bottom-left"
          className="!flex !flex-row !w-auto !h-auto !border-white/[0.08] !bg-gray-900/80 !backdrop-blur-xl !rounded-xl [&>button]:!border-white/[0.08] [&>button]:!bg-gray-900/80 [&>button]:!text-gray-300 [&>button:hover]:!bg-gray-800 [&>button]:!w-8 [&>button]:!h-8"
        />
      </ReactFlow>
    </div>
  );
};

export { buildSequenceDiagram };
export default SequenceDiagramRenderer;
