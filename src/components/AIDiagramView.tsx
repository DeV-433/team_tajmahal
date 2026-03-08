// ---------------------------------------------------------------------------
// components/AIDiagramView.tsx — Full-page AI diagram generation view
//   Phase 1: Prompt input with suggestions
//   Phase 2: Loading animation
//   Phase 3: React Flow architecture diagram with ELKjs layout
// ---------------------------------------------------------------------------

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type FC,
  type FormEvent,
} from 'react';
import ReactFlow, {
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  MarkerType,
  applyNodeChanges,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeProps,
  type NodeChange,
  type EdgeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Icon, loadIcon } from '@iconify/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs';
import { api } from '../api/client';
import ExportDialog from './eraser/ExportDialog';
import type {
  DiagramSpec,
  DiagramGroup,
  DiagramNode as DiagNode,
} from '../types/graph';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_WIDTH = 140;
const NODE_HEIGHT = 90;
const GROUP_PAD_TOP = 50;
const GROUP_PAD = 25;
const BOUNDARY_PAD_TOP = 55;
const BOUNDARY_PAD = 35;

// ---------------------------------------------------------------------------
// Fallback icon mapping — keyword → Iconify icon for unavailable icons
// ---------------------------------------------------------------------------

const FALLBACK_ICON_MAP: [RegExp, string][] = [
  [/gateway|api.gate/i, 'mdi:gate'],
  [/lambda|function|serverless/i, 'mdi:lightning-bolt'],
  [/s3|bucket|storage|blob/i, 'mdi:folder-multiple'],
  [/dynamo|dynamodb|nosql/i, 'mdi:database'],
  [/rds|postgres|mysql|sql|aurora/i, 'mdi:database'],
  [/mongo/i, 'mdi:database'],
  [/redis|cache|elasticache/i, 'mdi:cached'],
  [/queue|sqs|rabbit|kafka/i, 'mdi:tray-full'],
  [/sns|notification|alert/i, 'mdi:bell'],
  [/cognito|auth|identity|login|sso/i, 'mdi:shield-lock'],
  [/cloudfront|cdn/i, 'mdi:earth'],
  [/cloudwatch|monitor|metric|observe/i, 'mdi:monitor-eye'],
  [/ec2|compute|instance|vm/i, 'mdi:server'],
  [/ecs|container|docker|fargate/i, 'mdi:docker'],
  [/kubernetes|k8s|eks|aks|gke/i, 'mdi:kubernetes'],
  [/route.?53|dns/i, 'mdi:earth'],
  [/load.?balancer|elb|alb|nlb/i, 'mdi:scale-balance'],
  [/kinesis|stream|firehose/i, 'mdi:waves'],
  [/event.?bridge|event/i, 'mdi:lightning-bolt'],
  [/step.?function|workflow|state.?machine/i, 'mdi:sitemap'],
  [/cloud.?formation|terraform|iac|infra/i, 'mdi:cog'],
  [/codepipeline|cicd|ci.?cd|pipeline|deploy/i, 'mdi:pipe'],
  [/codebuild|build|jenkins/i, 'mdi:wrench'],
  [/elastic.?search|opensearch|search/i, 'mdi:magnify'],
  [/redshift|warehouse|data.?lake/i, 'mdi:database-export'],
  [/glue|etl|transform/i, 'mdi:swap-horizontal'],
  [/sage.?maker|ml|machine.?learn|model|ai/i, 'mdi:robot'],
  [/rag|retriev|vector/i, 'mdi:magnify-scan'],
  [/bedrock|llm|gpt|generat/i, 'mdi:robot'],
  [/rekognition|vision|image/i, 'mdi:eye'],
  [/transcribe|speech|voice/i, 'mdi:microphone'],
  [/translate|language/i, 'mdi:translate'],
  [/comprehend|nlp|text.?anal/i, 'mdi:text-recognition'],
  [/vpc|network|subnet|firewall/i, 'mdi:lan'],
  [/waf|web.?app.?fire/i, 'mdi:shield'],
  [/secret|vault|ssm|parameter/i, 'mdi:lock'],
  [/kms|encrypt|key/i, 'mdi:key'],
  [/cloud.?trail|audit|log/i, 'mdi:file-document-outline'],
  [/x.?ray|trac/i, 'mdi:magnify-scan'],
  [/iot|sensor|device|thing/i, 'mdi:chip'],
  [/mqtt|broker|pub.?sub/i, 'mdi:access-point'],
  [/user|client|customer/i, 'mdi:account-group'],
  [/mobile|ios|android|phone/i, 'mdi:cellphone'],
  [/web|browser|frontend|app/i, 'mdi:web'],
  [/email|ses|mail/i, 'mdi:email'],
  [/notification|push/i, 'mdi:bell-ring'],
  [/chart|dashboard|analytic|report/i, 'mdi:chart-line'],
  [/config|setting/i, 'mdi:cog'],
  [/bucket|file|object/i, 'mdi:folder'],
  [/api|rest|endpoint|graphql/i, 'mdi:api'],
  [/server|host|backend/i, 'mdi:server'],
  [/cloud/i, 'mdi:cloud'],
  [/database|db|data/i, 'mdi:database'],
  [/security|protect/i, 'mdi:shield-lock'],
];

const DEFAULT_FALLBACK_ICON = 'mdi:hexagon-outline';

/** Given a DiagramSpec, resolve any unavailable icons to fallbacks. */
async function resolveIcons(spec: DiagramSpec): Promise<DiagramSpec> {
  const resolved = { ...spec, nodes: [...spec.nodes] };
  await Promise.all(
    resolved.nodes.map(async (node, i) => {
      const icon = node.icon;
      if (!icon) {
        resolved.nodes[i] = { ...node, icon: labelToFallbackIcon(node.label) };
        return;
      }
      try {
        const loaded = await loadIcon(icon);
        if (!loaded) throw new Error('not found');
      } catch {
        // Icon not available — find fallback from label or icon name
        const fallback =
          labelToFallbackIcon(node.label) ||
          labelToFallbackIcon(icon) ||
          DEFAULT_FALLBACK_ICON;
        resolved.nodes[i] = { ...node, icon: fallback };
      }
    }),
  );
  return resolved;
}

function labelToFallbackIcon(text: string): string {
  for (const [re, icon] of FALLBACK_ICON_MAP) {
    if (re.test(text)) return icon;
  }
  return DEFAULT_FALLBACK_ICON;
}

// ---------------------------------------------------------------------------
// Custom React Flow node — architecture icon + label
// ---------------------------------------------------------------------------

interface ArchNodeData {
  label: string;
  icon: string;
}

const ArchNodeComponent: FC<NodeProps<ArchNodeData>> = ({ data }) => {
  const [iconReady, setIconReady] = useState(false);
  const iconName = data.icon || DEFAULT_FALLBACK_ICON;

  // Pre-load icon to guarantee it renders
  useEffect(() => {
    let cancelled = false;
    setIconReady(false);
    loadIcon(iconName)
      .then((result) => {
        if (!cancelled && result) setIconReady(true);
      })
      .catch(() => {
        if (!cancelled) setIconReady(true); // show fallback anyway
      });
    return () => { cancelled = true; };
  }, [iconName]);

  return (
    <div
      className="group relative flex flex-col items-center"
      style={{ width: NODE_WIDTH }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !border-0 !bg-gray-500/60 !-left-1"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="t-top"
        className="!w-2 !h-2 !border-0 !bg-gray-500/60 !-top-3"
      />

      {/* Icon box */}
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] shadow-lg shadow-black/20 transition-all group-hover:bg-white/[0.10] group-hover:shadow-xl">
        {iconReady ? (
          <Icon icon={iconName} width={32} />
        ) : (
          <div className="h-8 w-8 rounded-lg bg-white/[0.08] animate-pulse" />
        )}
      </div>

      {/* Label */}
      <p
        className="mt-2 w-full text-center text-[11px] font-semibold leading-tight text-gray-200"
        style={{ wordBreak: 'break-word' }}
      >
        {data.label}
      </p>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !border-0 !bg-gray-500/60 !-right-1"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="s-bottom"
        className="!w-2 !h-2 !border-0 !bg-gray-500/60 !-bottom-3"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Custom React Flow node — group container
// ---------------------------------------------------------------------------

interface ArchGroupData {
  label: string;
  color: string;
  borderColor: string;
}

const ArchGroupNodeComponent: FC<NodeProps<ArchGroupData>> = ({ data }) => (
  <div
    className="rounded-xl border-2 backdrop-blur-md"
    style={{
      backgroundColor: data.color + '35',
      borderColor: data.borderColor || data.color,
      borderStyle: 'solid',
      width: '100%',
      height: '100%',
    }}
  >
    <div className="flex items-center gap-2 px-3 py-2">
      <div
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: data.borderColor || data.color }}
      />
      <span
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: data.borderColor || '#d1d5db' }}
      >
        {data.label}
      </span>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Custom React Flow node — outer boundary container (dotted border)
// ---------------------------------------------------------------------------

interface ArchBoundaryData {
  label: string;
}

const ArchBoundaryNodeComponent: FC<NodeProps<ArchBoundaryData>> = ({ data }) => (
  <div
    className="rounded-2xl"
    style={{
      border: '2px dashed rgba(148, 163, 184, 0.35)',
      backgroundColor: 'rgba(148, 163, 184, 0.06)',
      backdropFilter: 'blur(8px)',
      width: '100%',
      height: '100%',
    }}
  >
    <div className="flex items-center gap-2 px-4 py-2.5">
      <Icon icon="lucide:layout-dashboard" width={14} className="text-gray-400" />
      <span
        className="text-[12px] font-bold uppercase tracking-wider text-gray-400"
      >
        {data.label}
      </span>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Auto-resize boundary helper — keeps outermost container fitted to children
// ---------------------------------------------------------------------------

function autoResizeBoundary(nodes: RFNode[]): RFNode[] {
  const boundary = nodes.find((n) => n.id === '__boundary__');
  if (!boundary) return nodes;

  const children = nodes.filter((n) => n.parentNode === '__boundary__');
  if (children.length === 0) return nodes;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const child of children) {
    const cx = child.position.x;
    const cy = child.position.y;
    const cw = (child.style?.width as number) || NODE_WIDTH;
    const ch = (child.style?.height as number) || NODE_HEIGHT;
    if (cx < minX) minX = cx;
    if (cy < minY) minY = cy;
    if (cx + cw > maxX) maxX = cx + cw;
    if (cy + ch > maxY) maxY = cy + ch;
  }

  // Compute the ideal bounding box: children should sit at exactly PAD from each side
  const idealLeft = BOUNDARY_PAD;
  const idealTop = BOUNDARY_PAD_TOP;
  const shiftX = idealLeft - minX;   // positive = children moved left of PAD, negative = gap on left side
  const shiftY = idealTop - minY;

  const newWidth = (maxX - minX) + BOUNDARY_PAD + BOUNDARY_PAD;
  const newHeight = (maxY - minY) + BOUNDARY_PAD_TOP + BOUNDARY_PAD;

  const curW = (boundary.style?.width as number) || 0;
  const curH = (boundary.style?.height as number) || 0;
  const posX = (boundary.position.x || 0);
  const posY = (boundary.position.y || 0);

  // If nothing changed, skip update
  if (
    Math.abs(shiftX) < 1 && Math.abs(shiftY) < 1 &&
    Math.abs(curW - newWidth) < 2 && Math.abs(curH - newHeight) < 2
  ) {
    return nodes;
  }

  return nodes.map((n) => {
    if (n.id === '__boundary__') {
      return {
        ...n,
        position: {
          x: posX - shiftX,
          y: posY - shiftY,
        },
        style: { ...n.style, width: newWidth, height: newHeight },
      };
    }
    if (n.parentNode === '__boundary__' && (Math.abs(shiftX) >= 1 || Math.abs(shiftY) >= 1)) {
      return {
        ...n,
        position: {
          x: n.position.x + shiftX,
          y: n.position.y + shiftY,
        },
      };
    }
    return n;
  });
}

// ELK layout builder — converts DiagramSpec → React Flow nodes + edges
// ---------------------------------------------------------------------------

const elk = new ELK();

async function buildDiagramFromSpec(
  spec: DiagramSpec,
): Promise<{ rfNodes: RFNode[]; rfEdges: RFEdge[] }> {
  // --- Sanitize IDs to prevent collisions that cause parentNode cycles ------
  // Reserve "__boundary__" for our wrapper node. Namespace group IDs vs node IDs
  // so the LLM can't accidentally create a node with the same ID as a group.
  const RESERVED = new Set(['__boundary__', 'root']);
  const groupIds = new Set(spec.groups.map((g) => g.id));
  const nodeIds = new Set(spec.nodes.map((n) => n.id));
  const collisions = new Set([...groupIds].filter((gid) => nodeIds.has(gid)));

  // Build ID remap tables: prefix duplicates & reserved names
  const groupIdMap = new Map<string, string>();
  for (const g of spec.groups) {
    let id = g.id;
    if (RESERVED.has(id)) id = `grp_${id}`;
    else if (collisions.has(g.id)) id = `grp_${id}`;
    groupIdMap.set(g.id, id);
  }
  const nodeIdMap = new Map<string, string>();
  const usedNodeIds = new Set<string>();
  for (const n of spec.nodes) {
    let id = n.id;
    if (RESERVED.has(id)) id = `nd_${id}`;
    else if (collisions.has(n.id)) id = `nd_${id}`;
    // Deduplicate — if two nodes share an ID, suffix the second
    while (usedNodeIds.has(id)) id = `${id}_dup`;
    usedNodeIds.add(id);
    nodeIdMap.set(n.id, id);
  }

  // Remap edges
  const remappedEdges = spec.edges.map((e) => ({
    ...e,
    source: nodeIdMap.get(e.source) ?? e.source,
    target: nodeIdMap.get(e.target) ?? e.target,
  }));

  const groupMap = new Map(spec.groups.map((g) => [groupIdMap.get(g.id)!, g]));
  const grouped = new Map<string, DiagNode[]>();
  const ungrouped: DiagNode[] = [];

  for (const n of spec.nodes) {
    const remappedGroup = n.group ? groupIdMap.get(n.group) : undefined;
    if (remappedGroup && groupMap.has(remappedGroup)) {
      const arr = grouped.get(remappedGroup) || [];
      arr.push({ ...n, id: nodeIdMap.get(n.id)!, group: remappedGroup });
      grouped.set(remappedGroup, arr);
    } else {
      ungrouped.push({ ...n, id: nodeIdMap.get(n.id)! });
    }
  }

  // ---- Build ELK graph with compound (hierarchical) nodes ----------------
  // Everything goes inside a single boundary node ("__boundary__")
  const innerChildren: ElkNode[] = [];

  for (const group of spec.groups) {
    const gid = groupIdMap.get(group.id)!;
    const kids = grouped.get(gid) || [];
    if (kids.length === 0) continue;
    innerChildren.push({
      id: gid,
      layoutOptions: {
        'elk.padding': `[top=${GROUP_PAD_TOP},left=${GROUP_PAD},bottom=${GROUP_PAD},right=${GROUP_PAD}]`,
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.spacing.nodeNode': '20',
        'elk.layered.spacing.nodeNodeBetweenLayers': '20',
      },
      children: kids.map((n) => ({
        id: n.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })),
    });
  }

  for (const n of ungrouped) {
    innerChildren.push({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  }

  const allRemappedNodeIds = new Set([...nodeIdMap.values()]);
  const elkEdges = remappedEdges
    .filter(
      (e) =>
        allRemappedNodeIds.has(e.source) &&
        allRemappedNodeIds.has(e.target) &&
        e.source !== e.target,
    )
    .map((e, i) => ({
      id: `elk-e-${i}`,
      sources: [e.source],
      targets: [e.target],
    }));

  // Choose a layout direction that produces a more square aspect ratio.
  // If there are many groups, arrange them in a grid-like fashion (DOWN)
  // so they stack vertically instead of stretching horizontally.
  const groupCount = innerChildren.filter((c) =>
    spec.groups.some((g) => groupIdMap.get(g.id) === c.id),
  ).length;
  const boundaryDirection = groupCount > 3 ? 'DOWN' : 'RIGHT';

  // The boundary node contains all groups and ungrouped nodes
  const boundaryNode: ElkNode = {
    id: '__boundary__',
    layoutOptions: {
      'elk.padding': `[top=${BOUNDARY_PAD_TOP},left=${BOUNDARY_PAD},bottom=${BOUNDARY_PAD},right=${BOUNDARY_PAD}]`,
      'elk.algorithm': 'layered',
      'elk.direction': boundaryDirection,
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '45',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.layered.spacing.edgeNodeBetweenLayers': '35',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '20',
      'elk.aspectRatio': '1.3',
    },
    children: innerChildren,
  };

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': boundaryDirection,
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '45',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.padding': '[top=30,left=30,bottom=30,right=30]',
      'elk.layered.spacing.edgeNodeBetweenLayers': '35',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '20',
      'elk.aspectRatio': '1.3',
    },
    children: [boundaryNode],
    edges: elkEdges,
  };

  const layoutResult = await elk.layout(elkGraph);

  // ---- Map ELK results → React Flow nodes --------------------------------
  const rfNodes: RFNode[] = [];
  // Build a lookup from remapped node ID → original node data
  const nodeMap = new Map<string, DiagNode>();
  for (const n of spec.nodes) {
    nodeMap.set(nodeIdMap.get(n.id)!, n);
  }

  // Find the boundary node in the ELK result
  const elkBoundary = (layoutResult.children ?? []).find(
    (c) => c.id === '__boundary__',
  );

  if (elkBoundary) {
    // Add the outer boundary group node
    rfNodes.push({
      id: '__boundary__',
      type: 'archBoundary',
      position: { x: elkBoundary.x ?? 0, y: elkBoundary.y ?? 0 },
      data: { label: spec.title || 'Architecture Diagram' },
      style: {
        width: elkBoundary.width,
        height: elkBoundary.height,
      },
      draggable: true,
      selectable: false,
    });

    // Process children of the boundary
    for (const elkChild of elkBoundary.children ?? []) {
      const group = groupMap.get(elkChild.id);

      if (group) {
        // Group node — child of boundary (no extent so boundary auto-resizes)
        rfNodes.push({
          id: elkChild.id,
          type: 'archGroup',
          position: { x: elkChild.x ?? 0, y: elkChild.y ?? 0 },
          parentNode: '__boundary__',
          data: {
            label: group.label,
            color: group.color,
            borderColor: group.borderColor || group.color,
          },
          style: {
            width: elkChild.width,
            height: elkChild.height,
          },
          draggable: true,
        });

        // Child nodes (position relative to group)
        for (const elkGrandchild of elkChild.children ?? []) {
          const dn = nodeMap.get(elkGrandchild.id);
          if (!dn) continue;
          rfNodes.push({
            id: elkGrandchild.id,
            type: 'archNode',
            position: { x: elkGrandchild.x ?? 0, y: elkGrandchild.y ?? 0 },
            parentNode: elkChild.id,
            extent: 'parent',
            data: { label: dn.label, icon: dn.icon },
          });
        }
      } else {
        // Standalone node — child of boundary (no extent so boundary auto-resizes)
        const dn = nodeMap.get(elkChild.id);
        if (!dn) continue;
        rfNodes.push({
          id: elkChild.id,
          type: 'archNode',
          position: { x: elkChild.x ?? 0, y: elkChild.y ?? 0 },
          parentNode: '__boundary__',
          data: { label: dn.label, icon: dn.icon },
        });
      }
    }
  }

  // ---- Map edges → React Flow edges --------------------------------------
  const rfEdges: RFEdge[] = remappedEdges
    .filter((e) => allRemappedNodeIds.has(e.source) && allRemappedNodeIds.has(e.target))
    .map((e, i) => ({
      id: `edge-${i}`,
      source: e.source,
      target: e.target,
      label: e.label || undefined,
      type: 'smoothstep',
      animated: e.animated ?? false,
      zIndex: 10,
      style: {
        stroke: '#475569',
        strokeWidth: 1.2,
        ...(e.style === 'dashed' ? { strokeDasharray: '6 4' } : {}),
      },
      labelStyle: {
        fill: '#94A3B8',
        fontSize: 10,
        fontWeight: 600,
      },
      labelBgStyle: {
        fill: '#0F172A',
        fillOpacity: 0.95,
      },
      labelBgPadding: [6, 4] as [number, number],
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#475569',
      },
    }));

  // ---- Safety net: detect & break parentNode cycles -----------------------
  const nodeById = new Map(rfNodes.map((n) => [n.id, n]));
  for (const node of rfNodes) {
    if (!node.parentNode) continue;
    const visited = new Set<string>();
    let cur: string | undefined = node.id;
    while (cur) {
      if (visited.has(cur)) {
        // Cycle detected — break it by removing parentNode from this node
        console.warn(`[buildDiagramFromSpec] Cycle detected at node "${node.id}", removing parentNode`);
        delete node.parentNode;
        delete (node as Record<string, unknown>).extent;
        break;
      }
      visited.add(cur);
      cur = nodeById.get(cur)?.parentNode;
    }
  }

  return { rfNodes, rfEdges };
}

// ---------------------------------------------------------------------------
// Quick prompt suggestions
// ---------------------------------------------------------------------------

const QUICK_PROMPTS = [
  'AWS serverless microservice architecture',
  'E-commerce platform with payment processing',
  'ML pipeline with data ingestion and model serving',
  'Real-time chat application architecture',
  'CI/CD deployment pipeline with monitoring',
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AIDiagramViewProps {
  repoName: string;
  repoPath: string;
  onBack: () => void;
  onExportSave?: (tool: string, query: string, nodes: unknown[], edges: unknown[]) => void;
}

// ---------------------------------------------------------------------------
// Inner component (needs ReactFlowProvider context)
// ---------------------------------------------------------------------------

const AIDiagramViewInner: FC<AIDiagramViewProps> = ({
  repoName,
  repoPath,
  onBack,
  onExportSave,
}) => {
  type PanelMode = 'document' | 'both' | 'canvas';
  const [phase, setPhase] = useState<'prompt' | 'loading' | 'diagram'>(
    'prompt',
  );
  const [panelMode, setPanelMode] = useState<PanelMode>('canvas');
  const [prompt, setPrompt] = useState('');
  const [diagramTitle, setDiagramTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [specCache, setSpecCache] = useState<DiagramSpec | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [diagramKey, setDiagramKey] = useState(0);
  const flowRef = useRef<HTMLDivElement>(null);

  const [rfNodes, setRfNodes] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();
  const [highlightEdgeId, setHighlightEdgeId] = useState<string | null>(null);

  // Derive highlighted node IDs from the selected edge
  const highlightNodeIds = useMemo(() => {
    if (!highlightEdgeId) return null;
    const edge = rfEdges.find((e) => e.id === highlightEdgeId);
    if (!edge) return null;
    return new Set([edge.source, edge.target]);
  }, [highlightEdgeId, rfEdges]);

  // Apply dimming when an edge is selected
  const styledNodes = useMemo(() => {
    if (!highlightNodeIds) return rfNodes;
    return rfNodes.map((n) => ({
      ...n,
      style: { ...n.style, opacity: highlightNodeIds.has(n.id) ? 1 : 0.15, transition: 'opacity 0.3s ease' },
    }));
  }, [rfNodes, highlightNodeIds]);

  const styledEdges = useMemo(() => {
    if (!highlightEdgeId) return rfEdges;
    return rfEdges.map((e) => ({
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
  }, [rfEdges, highlightEdgeId]);

  const handleEdgeClick: EdgeMouseHandler = useCallback((_event, edge) => {
    setHighlightEdgeId((prev) => (prev === edge.id ? null : edge.id));
  }, []);

  // Custom onNodesChange that auto-resizes the boundary container
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setRfNodes((prev) => autoResizeBoundary(applyNodeChanges(changes, prev)));
    },
    [setRfNodes],
  );

  const nodeTypes = useMemo(
    () => ({
      archNode: ArchNodeComponent,
      archGroup: ArchGroupNodeComponent,
      archBoundary: ArchBoundaryNodeComponent,
    }),
    [],
  );

  // Auto fit-view when diagram loads
  useEffect(() => {
    if (phase === 'diagram' && rfNodes.length > 0) {
      const timer = setTimeout(
        () => fitView({ padding: 0.15, duration: 500 }),
        200,
      );
      return () => clearTimeout(timer);
    }
  }, [phase, rfNodes.length, fitView]);

  // ---- Generate handler --------------------------------------------------
  const handleGenerate = useCallback(async () => {
    const text = prompt.trim();
    if (!text) return;

    setPhase('loading');
    setError(null);

    try {
      const rawSpec = await api.generateDiagram(text, repoPath || undefined);
      // Resolve icons — replace unavailable ones with fallbacks
      const spec = await resolveIcons(rawSpec);
      setSpecCache(spec);
      setDiagramTitle(spec.title || 'Architecture Diagram');
      const { rfNodes: nodes, rfEdges: edges } =
        await buildDiagramFromSpec(spec);
      setRfNodes(nodes);
      setRfEdges(edges);
      setDiagramKey((k) => k + 1);
      setPhase('diagram');
    } catch (err) {
      console.error('AI diagram error:', err);
      setError(err instanceof Error ? err.message : String(err));
      setPhase('prompt');
    }
  }, [prompt, repoPath, setRfNodes, setRfEdges]);

  // ---- Reset layout handler ----------------------------------------------
  const handleResetLayout = useCallback(async () => {
    if (!specCache) return;
    try {
      const { rfNodes: nodes, rfEdges: edges } =
        await buildDiagramFromSpec(specCache);
      setRfNodes(nodes);
      setRfEdges(edges);
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 100);
    } catch (err) {
      console.error('Reset layout error:', err);
    }
  }, [specCache, setRfNodes, setRfEdges, fitView]);

  // ---- Edit diagram handler ----------------------------------------------
  const handleEditDiagram = useCallback(async () => {
    const text = editPrompt.trim();
    if (!text || !specCache) return;

    setIsEditing(true);
    setEditError(null);

    try {
      const rawSpec = await api.editDiagram(specCache, text);
      const spec = await resolveIcons(rawSpec);
      setSpecCache(spec);
      setDiagramTitle(spec.title || diagramTitle);
      const { rfNodes: nodes, rfEdges: edges } =
        await buildDiagramFromSpec(spec);
      setRfNodes(nodes);
      setRfEdges(edges);
      setEditPrompt('');
      setEditOpen(false);
      setTimeout(() => fitView({ padding: 0.15, duration: 500 }), 250);
    } catch (err) {
      console.error('Edit diagram error:', err);
      setEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsEditing(false);
    }
  }, [editPrompt, specCache, diagramTitle, setRfNodes, setRfEdges, fitView]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      handleGenerate();
    },
    [handleGenerate],
  );

  // ========================================================================
  // PHASE 1 — Prompt input
  // ========================================================================
  if (phase === 'prompt') {
    return (
      <div className="flex h-full flex-col bg-transparent">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-white/[0.08] px-6 py-3">
          <button
            onClick={onBack}
            className="rounded-lg p-1.5 text-gray-500 backdrop-blur-xl transition-colors hover:bg-white/[0.06] hover:text-gray-300"
          >
            <Icon icon="lucide:arrow-left" width={18} />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-indigo-700 shadow-md">
              <Icon icon="lucide:sparkles" width={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-100 tracking-wide">
                AI Diagram
              </h1>
              <span className="text-[11px] text-gray-500">
                {repoName || 'No repository'}
              </span>
            </div>
          </div>
        </div>

        {/* Centered prompt card */}
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl p-10 flex flex-col items-center gap-6">
            {/* Icon */}
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600/10 to-indigo-700/10 backdrop-blur-xl border border-purple-400/20">
              <Icon
                icon="lucide:sparkles"
                width={32}
                className="text-purple-400"
              />
            </div>

            {/* Title */}
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-200">
                Generate Architecture Diagram
              </h2>
              <p className="mt-1 max-w-md text-sm text-gray-500">
                Describe the system architecture you want to visualize.
                {repoPath && (
                  <>
                    {' '}
                    AI will analyze{' '}
                    <span className="text-purple-400 font-medium">
                      {repoName}
                    </span>{' '}
                    for context.
                  </>
                )}
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="w-full rounded-lg border border-red-500/30 bg-red-500/10 backdrop-blur-xl px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Prompt form */}
            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Design an AWS serverless architecture for a financial gaming platform with monitoring, AI services, and user authentication…"
                rows={4}
                className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-all focus:border-purple-400/30 focus:ring-1 focus:ring-purple-400/20"
                autoFocus
              />

              {/* Quick prompts */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp}
                    type="button"
                    onClick={() => setPrompt(qp)}
                    className="rounded-full border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl px-3 py-1.5 text-[11px] text-gray-400 transition-all duration-200 hover:border-purple-400/30 hover:bg-white/[0.08] hover:text-purple-300 hover:shadow-md hover:shadow-purple-500/5"
                  >
                    {qp}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={!prompt.trim()}
                className="flex items-center justify-center gap-2 rounded-xl bg-purple-600/20 border border-purple-500/30 backdrop-blur-xl px-6 py-3 text-sm font-medium text-purple-300 transition-all hover:bg-purple-600/30 hover:text-purple-200 hover:shadow-lg hover:shadow-purple-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Icon icon="lucide:sparkles" width={16} />
                Generate Diagram
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================================
  // PHASE 2 — Loading animation
  // ========================================================================
  if (phase === 'loading') {
    return (
      <div className="flex h-full flex-col bg-transparent">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-white/[0.08] px-6 py-3">
          <button
            onClick={() => setPhase('prompt')}
            className="rounded-lg p-1.5 text-gray-500 backdrop-blur-xl transition-colors hover:bg-white/[0.06] hover:text-gray-300"
          >
            <Icon icon="lucide:arrow-left" width={18} />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-indigo-700 shadow-md animate-pulse">
              <Icon icon="lucide:sparkles" width={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-100 tracking-wide">
                Generating…
              </h1>
              <span className="text-[11px] text-gray-500">
                AI is analyzing your prompt
              </span>
            </div>
          </div>
        </div>

        {/* Loading animation */}
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-8">
            {/* Pulsing glow */}
            <div className="relative">
              <div className="absolute -inset-6 rounded-full bg-purple-500/20 blur-3xl animate-pulse" />
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-purple-400/20 bg-white/[0.04] backdrop-blur-2xl shadow-2xl shadow-purple-500/10">
                <Icon
                  icon="lucide:sparkles"
                  width={40}
                  className="text-purple-400 animate-pulse"
                />
              </div>
            </div>

            {/* Text */}
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-200">
                Generating your diagram
              </h2>
              <p className="mt-2 max-w-sm text-sm text-gray-500">
                AI is analyzing the architecture and creating nodes, edges, and
                groups…
              </p>
            </div>

            {/* Bouncing dots */}
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:300ms]" />
            </div>

            {/* Shimmer bar */}
            <div className="w-64 h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-purple-400/40 to-transparent animate-shimmer" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================================
  // PHASE 3 — Diagram canvas
  // ========================================================================
  return (
    <div className="flex h-full flex-col bg-transparent">
      {/* ── Top bar with Document | Both | Canvas tabs ─────────────── */}
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl px-4 py-2">
        {/* Left: Back + name */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-300"
          >
            <Icon icon="lucide:chevron-left" width={14} />
            Back
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-purple-600 to-indigo-700">
              <Icon icon="lucide:sparkles" width={10} className="text-white" />
            </div>
            <span className="text-sm font-medium text-gray-200">
              {diagramTitle || 'AI Diagram'}
            </span>
          </div>
        </div>

        {/* Center: Document | Both | Canvas tabs */}
        <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl">
          {(['document', 'both', 'canvas'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setPanelMode(mode)}
              className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                panelMode === mode
                  ? 'bg-gray-700/60 text-gray-100'
                  : 'text-gray-500 hover:text-gray-300'
              } ${mode === 'document' ? 'rounded-l-md' : ''} ${mode === 'canvas' ? 'rounded-r-md' : ''}`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        {/* Right: placeholder */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500">
            {repoName || 'No repo'}
          </span>
        </div>
      </div>

      {/* ── Main content area ─────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Document panel (shown in document & both modes) */}
        {(panelMode === 'document' || panelMode === 'both') && (
          <div
            className="hide-scrollbar overflow-auto border-r border-white/[0.08] bg-white/[0.02]"
            style={{ width: panelMode === 'both' ? '40%' : '100%' }}
          >
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">{diagramTitle}</h2>
              <div className="space-y-3 text-sm text-gray-400 leading-relaxed">
                <p><span className="text-gray-300 font-medium">Prompt:</span> {prompt}</p>
                <p><span className="text-gray-300 font-medium">Nodes:</span> {rfNodes.length}</p>
                <p><span className="text-gray-300 font-medium">Edges:</span> {rfEdges.length}</p>
                {specCache && specCache.groups.length > 0 && (
                  <div>
                    <span className="text-gray-300 font-medium">Groups:</span>
                    <ul className="mt-1 list-disc list-inside">
                      {specCache.groups.map((g) => (
                        <li key={g.id}>{g.label}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Canvas panel (shown in canvas & both modes) */}
        {(panelMode === 'canvas' || panelMode === 'both') && (
          <div
            ref={flowRef}
            className="relative"
            style={{
              width: panelMode === 'both'
                ? (editOpen ? '30%' : '60%')
                : (editOpen ? '65%' : '100%'),
              transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <div key={diagramKey} className="h-full w-full" style={{ animation: 'diagramFadeIn 0.5s ease-out' }}>
              <ReactFlow
                nodes={styledNodes}
                edges={styledEdges}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onEdgeClick={handleEdgeClick}
                nodeTypes={nodeTypes}
                fitView
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
                {highlightEdgeId && (
                  <Panel position="top-left">
                    <button
                      onClick={() => setHighlightEdgeId(null)}
                      className="flex items-center gap-1.5 rounded-lg bg-gray-800/90 backdrop-blur-xl border border-white/10 px-3 py-1.5 text-xs font-medium text-gray-300 shadow-lg hover:bg-gray-700 hover:text-white transition-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      Clear highlight
                    </button>
                  </Panel>
                )}
              </ReactFlow>
            </div>

            {/* Floating Edit button */}
            {!editOpen && (
              <button
                onClick={() => setEditOpen(true)}
                className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/15 backdrop-blur-xl px-3.5 py-2 text-xs font-medium text-purple-300 shadow-lg shadow-purple-500/10 transition-all hover:bg-purple-500/25 hover:text-purple-200 hover:shadow-xl hover:shadow-purple-500/15 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Icon icon="lucide:wand-2" width={14} />
                Edit
              </button>
            )}
          </div>
        )}

        {/* ── Edit Diagram panel (slides in from right) ──────── */}
        {editOpen && (panelMode === 'canvas' || panelMode === 'both') && (
          <div
            className="flex flex-col border-l border-white/[0.08] bg-white/[0.02] backdrop-blur-xl overflow-hidden"
            style={{
              width: panelMode === 'both' ? '30%' : '35%',
              transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {/* Edit panel header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/20">
                  <Icon icon="lucide:wand-2" width={13} className="text-purple-400" />
                </div>
                <span className="text-sm font-semibold text-gray-200">Edit Diagram</span>
              </div>
              <button
                onClick={() => { setEditOpen(false); setEditError(null); }}
                className="rounded-md p-1 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-300"
              >
                <Icon icon="lucide:x" width={14} />
              </button>
            </div>

            {/* Edit prompt area */}
            <div className="flex-1 overflow-auto p-4">
              <p className="mb-3 text-xs text-gray-500">
                Describe how you want to modify the diagram. Existing nodes and connections will be preserved.
              </p>

              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="e.g. Add a caching layer between the API and database…"
                rows={4}
                className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-all focus:border-purple-400/30 focus:ring-1 focus:ring-purple-400/20"
                disabled={isEditing}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleEditDiagram();
                  }
                }}
              />

              {/* Error banner */}
              {editError && (
                <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {editError}
                </div>
              )}

              {/* Pre-built edit prompts */}
              <div className="mt-3 mb-4">
                <span className="text-[10px] font-medium uppercase tracking-wider text-gray-600 mb-2 block">Suggestions</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Enlarge the diagram with more detail',
                    'Increase the number of nodes',
                    'Add more detail to edge labels',
                    'Break down large services into sub-components',
                    'Add monitoring and logging nodes',
                    'Show database tables separately',
                    'Add authentication flow',
                    'Simplify the layout',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setEditPrompt(suggestion)}
                      disabled={isEditing}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-gray-500 transition-all hover:border-purple-400/20 hover:bg-white/[0.06] hover:text-gray-300 disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 border-t border-white/[0.08] px-4 py-3">
              <button
                onClick={() => { setEditOpen(false); setEditPrompt(''); setEditError(null); }}
                disabled={isEditing}
                className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-400 transition-all hover:bg-white/[0.08] hover:text-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditDiagram}
                disabled={isEditing || !editPrompt.trim()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 px-3 py-2 text-xs font-medium text-purple-300 transition-all hover:bg-purple-600/30 hover:text-purple-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isEditing ? (
                  <>
                    <Icon icon="lucide:loader-2" width={13} className="animate-spin" />
                    Editing…
                  </>
                ) : (
                  <>
                    <Icon icon="lucide:wand-2" width={13} />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl px-4 py-2">
        {/* Left: Reset Layout */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleResetLayout}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 backdrop-blur-xl px-3 py-1.5 text-xs font-medium text-rose-300 transition-all hover:bg-rose-500/20 hover:text-rose-200"
          >
            Reset Layout
          </button>
        </div>

        {/* Center: Title */}
        <div className="flex items-center gap-2">
          <Icon
            icon="lucide:arrow-right"
            width={14}
            className="text-gray-600"
          />
          <span className="text-sm font-medium text-gray-300">
            {diagramTitle}
          </span>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500">
            {rfNodes.length} nodes · {rfEdges.length} edges
          </span>
          {/* Export button */}
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 backdrop-blur-xl transition-all hover:bg-emerald-500/20 hover:text-emerald-200"
          >
            <Icon icon="lucide:download" width={13} />
            Export
          </button>
          <button
            onClick={() => {
              setPhase('prompt');
              setRfNodes([]);
              setRfEdges([]);
              setSpecCache(null);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 backdrop-blur-xl px-3 py-1.5 text-xs font-medium text-purple-300 transition-all hover:bg-purple-500/20 hover:text-purple-200"
          >
            <Icon icon="lucide:sparkles" width={13} />
            New Diagram
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/[0.08] hover:text-gray-200"
          >
            <Icon icon="lucide:arrow-left" width={13} />
            Back
          </button>
        </div>
      </div>

      {/* ── Export dialog ──────────────────────────────────────── */}
      <ExportDialog
        open={exportOpen}
        flowElement={flowRef.current?.querySelector('.react-flow') as HTMLElement | null}
        diagramName={diagramTitle || 'AI Diagram'}
        onClose={() => setExportOpen(false)}
        onSaved={() => {
          setExportOpen(false);
          onExportSave?.(
            'ai-diagram',
            prompt || diagramTitle || 'AI Diagram',
            rfNodes,
            rfEdges,
          );
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Exported component — wraps with ReactFlowProvider
// ---------------------------------------------------------------------------

const AIDiagramView: FC<AIDiagramViewProps> = (props) => (
  <ReactFlowProvider>
    <AIDiagramViewInner {...props} />
  </ReactFlowProvider>
);

export default AIDiagramView;

// Shared utilities for use by EraserEditor
export { resolveIcons, buildDiagramFromSpec, autoResizeBoundary, ArchNodeComponent, ArchGroupNodeComponent, ArchBoundaryNodeComponent };
