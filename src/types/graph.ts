// ---------------------------------------------------------------------------
// types/graph.ts — TypeScript types for the contextplus-backed backend
// ---------------------------------------------------------------------------

// ---- Canvas Mode ----------------------------------------------------------

export type CanvasMode = 'call_chain' | 'text_result';

// ---- Graph Node (full node returned from API) -----------------------------

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  parent_id?: string;
  runtime_status?: string;
  error_count: number;
  file_path?: string;
  line_start: number;
  line_end: number;
  is_exported?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

// ---- Call Chain types (match Go bridge.FlatNode / FlatEdge) ---------------

export interface FlatNode {
  id: string;
  name: string;
  type?: string;
  file_path: string;
  line?: number;
  end_line?: number;
  signature?: string;
  annotations?: string[];
  metadata?: Record<string, string>;
}

export interface FlatEdge {
  id: string;
  source_id: string;
  target_id: string;
  type?: string;
}

export interface ChainStats {
  total_hops: number;
  leaf_count: number;
  external_count: number;
  max_depth: number;
}

export interface CallChainMeta {
  root_id: string;
  depths: Record<string, number>;
  annotations: Record<string, string[]>;
  node_roles: Record<string, string>;
  stats: ChainStats;
}

export interface CallChainResponse {
  nodes: FlatNode[];
  edges: FlatEdge[];
  call_chain_meta: CallChainMeta;
  stats: ChainStats;
}

// ---- Text result (search, skeleton, blast-radius, etc.) -------------------

export interface TextResult {
  result: string;
}

// ---- SSE ------------------------------------------------------------------

export interface SSEEvent {
  event: string;
  data: unknown;
}

// ---- Tool types for the tool selector ------------------------------------

export type ToolType =
  | 'call-chain'
  | 'search'
  | 'context-tree'
  | 'skeleton'
  | 'blast-radius'
  | 'identifier-search'
  | 'static-analysis'
  | 'ask-ai';

export interface ToolInfo {
  key: ToolType;
  label: string;
  placeholder: string;
  requiresInput: boolean;
}

// ---- AI Diagram types ---------------------------------------------------

export interface DiagramGroup {
  id: string;
  label: string;
  color: string;
  borderColor?: string;
}

export interface DiagramNode {
  id: string;
  label: string;
  icon: string;
  group?: string | null;
}

export interface DiagramEdge {
  source: string;
  target: string;
  label?: string;
  style?: string;
  animated?: boolean;
}

export interface DiagramSpec {
  title: string;
  groups: DiagramGroup[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

// ---- Sequence Diagram types ---------------------------------------------

export interface SeqActor {
  id: string;
  label: string;
  type: 'actor' | 'service' | 'database' | 'external';
  color?: string;
}

export interface SeqMessage {
  id: string;
  from: string;
  to: string;
  label: string;
  type: 'sync' | 'async' | 'reply' | 'create' | 'destroy';
  order: number;
}

export interface SeqFragment {
  id: string;
  type: 'alt' | 'opt' | 'loop' | 'par';
  label: string;
  startOrder: number;
  endOrder: number;
}

export interface SequenceDiagramSpec {
  title: string;
  actors: SeqActor[];
  messages: SeqMessage[];
  fragments?: SeqFragment[];
}

// ---- Entity-Relationship Diagram types ----------------------------------

export interface ERAttribute {
  name: string;
  type: string;
  pk?: boolean;
  fk?: boolean;
  nullable?: boolean;
}

export interface EREntity {
  id: string;
  name: string;
  type: 'strong' | 'weak' | 'associative';
  color?: string;
  attributes: ERAttribute[];
}

export interface ERRelationship {
  id: string;
  from: string;
  to: string;
  label: string;
  cardinality: '1:1' | '1:N' | 'N:1' | 'M:N';
  style?: 'solid' | 'dashed';
}

export interface ERDiagramSpec {
  title: string;
  entities: EREntity[];
  relationships: ERRelationship[];
}

export const TOOLS: ToolInfo[] = [
  { key: 'ask-ai',            label: '✦ Ask AI',        placeholder: 'Ask anything about the codebase…',   requiresInput: true  },
  { key: 'call-chain',        label: 'Call Chain',       placeholder: 'Symbol name (e.g. handleRequest)',  requiresInput: true  },
  { key: 'search',            label: 'Search',           placeholder: 'Search query…',                     requiresInput: true  },
  { key: 'blast-radius',      label: 'Blast Radius',     placeholder: 'Symbol name…',                      requiresInput: true  },
  { key: 'identifier-search', label: 'Identifiers',      placeholder: 'Identifier query…',                 requiresInput: true  },
  { key: 'skeleton',          label: 'File Skeleton',    placeholder: 'File path…',                        requiresInput: true  },
  { key: 'context-tree',      label: 'Context Tree',     placeholder: 'Path (optional)…',                  requiresInput: false },
  { key: 'static-analysis',   label: 'Static Analysis',  placeholder: 'Path (optional)…',                  requiresInput: false },
];
