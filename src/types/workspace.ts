// ---------------------------------------------------------------------------
// types/workspace.ts — Workspace / repo / diagram persistence types
// ---------------------------------------------------------------------------

/** A scanned repository with its semantic tree ready for querying. */
export interface RepoEntry {
  /** Unique id (uuid v4) */
  id: string;
  /** Display name (e.g. "vyuha-ai") */
  name: string;
  /** Absolute path on the server's filesystem */
  path: string;
  /** ISO timestamp of last scan */
  scannedAt: string;
  /** Whether a context-tree scan has been completed */
  ready: boolean;
  /** Number of symbols indexed (optional, filled after scan) */
  symbolCount?: number;
  /** Original GitHub URL (if cloned from GitHub) */
  githubUrl?: string;
}

/** A saved diagram / query session the user pinned. */
export interface SavedDiagram {
  id: string;
  /** Repo this diagram is associated with */
  repoId: string;
  /** Human-readable label */
  name: string;
  /** The tool used to generate it */
  tool: string;
  /** The query text */
  query: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last edit */
  editedAt: string;
  /** Serialised ReactFlow nodes (persisted for re-opening) */
  nodes?: unknown[];
  /** Serialised ReactFlow edges (persisted for re-opening) */
  edges?: unknown[];
  /** Whether this was generated via Deep Research mode */
  deepResearch?: boolean;
  /** Persisted deep research data for re-opening */
  deepResearchData?: {
    report: string;
    sequenceSpec?: unknown;
    erSpec?: unknown;
    archSpec?: unknown;
  };
}

/** The top-level state stored in localStorage. */
export interface WorkspaceState {
  repos: RepoEntry[];
  diagrams: SavedDiagram[];
  activeRepoId: string | null;
  activeDiagramId: string | null;
}
