// ---------------------------------------------------------------------------
// ERDiagramRenderer.tsx — Entity-Relationship Diagram using ReactFlow + ELKjs
//   Renders entities as table-like boxes with attribute rows, connected by
//   relationship edges with cardinality labels. Translucent dark theme.
// ---------------------------------------------------------------------------

import { useMemo, type FC } from 'react';
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
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs';
import { Icon } from '@iconify/react';
import type { ERDiagramSpec, EREntity, ERAttribute } from '../types/graph';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_WIDTH = 220;
const HEADER_HEIGHT = 38;
const ATTR_ROW_HEIGHT = 24;
const MIN_ENTITY_HEIGHT = HEADER_HEIGHT + 30;

function entityHeight(entity: EREntity): number {
  return HEADER_HEIGHT + Math.max(entity.attributes.length, 1) * ATTR_ROW_HEIGHT + 12;
}

// Entity type → icon
const ENTITY_ICON: Record<string, string> = {
  strong: 'lucide:table-2',
  weak: 'lucide:table',
  associative: 'lucide:link',
};

// Default colors per type
const ENTITY_DEFAULT_COLOR: Record<string, string> = {
  strong: '#3B82F6',
  weak: '#6366F1',
  associative: '#0891B2',
};

// Attribute type → short display
const TYPE_DISPLAY: Record<string, string> = {
  string: 'str',
  integer: 'int',
  boolean: 'bool',
  date: 'date',
  float: 'float',
  text: 'text',
  uuid: 'uuid',
  json: 'json',
};

// ---------------------------------------------------------------------------
// Custom Node: Entity Table
// ---------------------------------------------------------------------------

interface EntityNodeData {
  name: string;
  entityType: string;
  color: string;
  attributes: ERAttribute[];
}

const EntityNode: FC<NodeProps<EntityNodeData>> = ({ data }) => {
  const color = data.color;
  const attrs = data.attributes || [];

  return (
    <div
      className="rounded-xl border backdrop-blur-xl shadow-lg overflow-hidden"
      style={{
        width: ENTITY_WIDTH,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        borderColor: color + '45',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{
          backgroundColor: color + '20',
          borderBottomColor: color + '30',
          height: HEADER_HEIGHT,
        }}
      >
        <Icon
          icon={ENTITY_ICON[data.entityType] || 'lucide:table-2'}
          width={16}
          style={{ color }}
        />
        <span className="text-[12px] font-bold tracking-wide" style={{ color }}>
          {data.name}
        </span>
        {data.entityType === 'weak' && (
          <span className="ml-auto text-[9px] text-gray-500 uppercase">weak</span>
        )}
        {data.entityType === 'associative' && (
          <span className="ml-auto text-[9px] text-gray-500 uppercase">assoc</span>
        )}
      </div>

      {/* Attributes */}
      <div className="px-2 py-1.5">
        {attrs.length === 0 ? (
          <div className="text-[10px] text-gray-600 py-1">No attributes</div>
        ) : (
          attrs.map((attr, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 py-0.5 text-[10px]"
              style={{ height: ATTR_ROW_HEIGHT }}
            >
              {/* PK/FK icon */}
              <span className="w-4 flex-shrink-0 text-center">
                {attr.pk ? (
                  <Icon icon="lucide:key-round" width={11} className="text-amber-400" />
                ) : attr.fk ? (
                  <Icon icon="lucide:link" width={11} className="text-cyan-400" />
                ) : (
                  <span className="text-gray-700">·</span>
                )}
              </span>

              {/* Name */}
              <span
                className={`flex-1 truncate ${
                  attr.pk ? 'font-bold text-amber-300' : attr.fk ? 'text-cyan-300' : 'text-gray-400'
                }`}
              >
                {attr.name}
                {attr.nullable && <span className="text-gray-600">?</span>}
              </span>

              {/* Type */}
              <span className="text-gray-600 flex-shrink-0 text-[9px] font-mono">
                {TYPE_DISPLAY[attr.type] || attr.type}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Connection handles */}
      <Handle type="source" position={Position.Right} style={{ opacity: 0, top: '50%' }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0, top: '50%' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0 }} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// ELK layout builder
// ---------------------------------------------------------------------------

const elk = new ELK();

async function buildERDiagram(
  spec: ERDiagramSpec,
): Promise<{ nodes: RFNode[]; edges: RFEdge[] }> {
  const entities = spec.entities || [];
  const relationships = spec.relationships || [];

  // Build ELK graph
  const elkNodes: ElkNode[] = entities.map((e) => ({
    id: e.id,
    width: ENTITY_WIDTH,
    height: entityHeight(e),
  }));

  const entityIds = new Set(entities.map((e) => e.id));
  const elkEdges = relationships
    .filter((r) => entityIds.has(r.from) && entityIds.has(r.to))
    .map((r, i) => ({
      id: `elk-er-${i}`,
      sources: [r.from],
      targets: [r.to],
    }));

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
      'elk.aspectRatio': '1.5',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const layoutResult = await elk.layout(elkGraph);

  // Map ELK results to ReactFlow nodes
  const entityMap = new Map(entities.map((e) => [e.id, e]));
  const nodes: RFNode[] = [];

  for (const elkChild of layoutResult.children ?? []) {
    const entity = entityMap.get(elkChild.id);
    if (!entity) continue;
    const color = entity.color || ENTITY_DEFAULT_COLOR[entity.type] || '#3B82F6';
    nodes.push({
      id: elkChild.id,
      type: 'erEntity',
      position: { x: elkChild.x ?? 0, y: elkChild.y ?? 0 },
      data: {
        name: entity.name,
        entityType: entity.type,
        color,
        attributes: entity.attributes,
      },
    });
  }

  // Map relationships to ReactFlow edges
  const edges: RFEdge[] = relationships
    .filter((r) => entityIds.has(r.from) && entityIds.has(r.to))
    .map((r, i) => {
      const fromEntity = entityMap.get(r.from);
      const color = fromEntity?.color || '#3B82F6';

      // Build cardinality label with decorators
      const cardLabel = r.cardinality || '';
      const edgeLabel = r.label ? `${r.label} (${cardLabel})` : cardLabel;

      return {
        id: `er-edge-${i}`,
        source: r.from,
        target: r.to,
        type: 'smoothstep',
        animated: false,
        label: edgeLabel || undefined,
        style: {
          stroke: color + '60',
          strokeWidth: 1.5,
          ...(r.style === 'dashed' ? { strokeDasharray: '6 4' } : {}),
        },
        labelStyle: {
          fill: '#94A3B8',
          fontSize: 9,
          fontWeight: 600,
        },
        labelBgStyle: {
          fill: '#0F172A',
          fillOpacity: 0.95,
        },
        labelBgPadding: [5, 3] as [number, number],
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: color + '80',
          width: 12,
          height: 10,
        },
      };
    });

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Exported Component
// ---------------------------------------------------------------------------

interface ERDiagramRendererProps {
  spec: ERDiagramSpec;
  diagramKey: number;
}

const nodeTypes = {
  erEntity: EntityNode,
};

const ERDiagramRenderer: FC<ERDiagramRendererProps> = ({ spec, diagramKey }) => {
  // We need async layout, so build in a memo and render when ready
  return <ERDiagramInner spec={spec} diagramKey={diagramKey} />;
};

import { useState, useEffect, useCallback, useMemo as useMemo2 } from 'react';

const ERDiagramInner: FC<ERDiagramRendererProps> = ({ spec, diagramKey }) => {
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);
  const [ready, setReady] = useState(false);
  const [highlightEdgeId, setHighlightEdgeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    buildERDiagram(spec).then(({ nodes, edges }) => {
      if (!cancelled) {
        setNodes(nodes);
        setEdges(edges);
        setReady(true);
      }
    });
    return () => { cancelled = true; };
  }, [spec]);

  const styledNodes = useMemo2(() => {
    if (!highlightEdgeId) return nodes;
    const edge = edges.find((e) => e.id === highlightEdgeId);
    if (!edge) return nodes;
    const hl = new Set([edge.source, edge.target]);
    return nodes.map((n) => ({
      ...n,
      style: { ...n.style, opacity: hl.has(n.id) ? 1 : 0.15, transition: 'opacity 0.3s ease' },
    }));
  }, [nodes, edges, highlightEdgeId]);

  const styledEdges = useMemo2(() => {
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

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Icon icon="lucide:database" width={32} className="text-gray-700 animate-pulse" />
          <span className="text-sm text-gray-600">Laying out entities…</span>
        </div>
      </div>
    );
  }

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
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
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

export { buildERDiagram };
export default ERDiagramRenderer;
