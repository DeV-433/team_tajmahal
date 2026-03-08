// ---------------------------------------------------------------------------
// hooks/useWorkspace.ts — Persistent workspace state (repos + diagrams)
// Uses localStorage so data survives page reloads.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import type {
  RepoEntry,
  SavedDiagram,
  WorkspaceState,
} from '../types/workspace';

const STORAGE_KEY = 'vyuha_workspace';

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadState(): WorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as WorkspaceState;
  } catch { /* ignore */ }
  return { repos: [], diagrams: [], activeRepoId: null, activeDiagramId: null };
}

function saveState(state: WorkspaceState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseWorkspaceReturn {
  repos: RepoEntry[];
  diagrams: SavedDiagram[];
  activeRepo: RepoEntry | null;
  activeDiagram: SavedDiagram | null;

  /** Add a new repo and set it active. Returns the new entry. */
  addRepo: (name: string, path: string, githubUrl?: string) => RepoEntry;

  /** Mark a repo scan as complete. */
  markRepoReady: (repoId: string, symbolCount?: number) => void;

  /** Remove a repo and its diagrams. */
  removeRepo: (repoId: string) => void;

  /** Set the currently active repo. */
  setActiveRepo: (repoId: string | null) => void;

  /** Save a diagram entry. */
  saveDiagram: (repoId: string, name: string, tool: string, query: string, nodes?: unknown[], edges?: unknown[], deepResearch?: boolean, deepResearchData?: SavedDiagram['deepResearchData']) => SavedDiagram;

  /** Remove a diagram. */
  removeDiagram: (diagramId: string) => void;

  /** Set the active diagram. */
  setActiveDiagram: (diagramId: string | null) => void;

  /** Rename a diagram. */
  renameDiagram: (diagramId: string, newName: string) => void;

  /** Touch a diagram — update its editedAt timestamp. */
  touchDiagram: (diagramId: string) => void;
}

export function useWorkspace(): UseWorkspaceReturn {
  const [state, setState] = useState<WorkspaceState>(loadState);

  // Persist on every change
  useEffect(() => {
    saveState(state);
  }, [state]);

  // ---- Repos ---------------------------------------------------------------

  const addRepo = useCallback((name: string, path: string, githubUrl?: string): RepoEntry => {
    const entry: RepoEntry = {
      id: generateId(),
      name,
      path,
      scannedAt: new Date().toISOString(),
      ready: false,
      githubUrl,
    };
    setState((prev) => ({
      ...prev,
      repos: [...prev.repos, entry],
      activeRepoId: entry.id,
      activeDiagramId: null,
    }));
    return entry;
  }, []);

  const markRepoReady = useCallback((repoId: string, symbolCount?: number) => {
    setState((prev) => ({
      ...prev,
      repos: prev.repos.map((r) =>
        r.id === repoId
          ? { ...r, ready: true, symbolCount, scannedAt: new Date().toISOString() }
          : r,
      ),
    }));
  }, []);

  const removeRepo = useCallback((repoId: string) => {
    setState((prev) => ({
      ...prev,
      repos: prev.repos.filter((r) => r.id !== repoId),
      diagrams: prev.diagrams.filter((d) => d.repoId !== repoId),
      activeRepoId: prev.activeRepoId === repoId ? null : prev.activeRepoId,
      activeDiagramId:
        prev.diagrams.find((d) => d.id === prev.activeDiagramId)?.repoId === repoId
          ? null
          : prev.activeDiagramId,
    }));
  }, []);

  const setActiveRepo = useCallback((repoId: string | null) => {
    setState((prev) => ({
      ...prev,
      activeRepoId: repoId,
      activeDiagramId: null,
    }));
  }, []);

  // ---- Diagrams ------------------------------------------------------------

  const saveDiagram = useCallback(
    (repoId: string, name: string, tool: string, query: string, nodes?: unknown[], edges?: unknown[], deepResearch?: boolean, deepResearchData?: SavedDiagram['deepResearchData']): SavedDiagram => {
      const entry: SavedDiagram = {
        id: generateId(),
        repoId,
        name,
        tool,
        query,
        createdAt: new Date().toISOString(),
        editedAt: new Date().toISOString(),
        nodes,
        edges,
        deepResearch,
        deepResearchData,
      };
      setState((prev) => ({
        ...prev,
        diagrams: [...prev.diagrams, entry],
        activeDiagramId: entry.id,
      }));
      return entry;
    },
    [],
  );

  const removeDiagram = useCallback((diagramId: string) => {
    setState((prev) => ({
      ...prev,
      diagrams: prev.diagrams.filter((d) => d.id !== diagramId),
      activeDiagramId: prev.activeDiagramId === diagramId ? null : prev.activeDiagramId,
    }));
  }, []);

  const setActiveDiagram = useCallback((diagramId: string | null) => {
    setState((prev) => ({ ...prev, activeDiagramId: diagramId }));
  }, []);

  const renameDiagram = useCallback((diagramId: string, newName: string) => {
    setState((prev) => ({
      ...prev,
      diagrams: prev.diagrams.map((d) =>
        d.id === diagramId ? { ...d, name: newName, editedAt: new Date().toISOString() } : d,
      ),
    }));
  }, []);

  const touchDiagram = useCallback((diagramId: string) => {
    setState((prev) => ({
      ...prev,
      diagrams: prev.diagrams.map((d) =>
        d.id === diagramId ? { ...d, editedAt: new Date().toISOString() } : d,
      ),
    }));
  }, []);

  // ---- Derived values ------------------------------------------------------

  const activeRepo = state.repos.find((r) => r.id === state.activeRepoId) ?? null;
  const activeDiagram = state.diagrams.find((d) => d.id === state.activeDiagramId) ?? null;

  return {
    repos: state.repos,
    diagrams: state.diagrams,
    activeRepo,
    activeDiagram,
    addRepo,
    markRepoReady,
    removeRepo,
    setActiveRepo,
    saveDiagram,
    removeDiagram,
    setActiveDiagram,
    renameDiagram,
    touchDiagram,
  };
}
