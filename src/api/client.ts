// ---------------------------------------------------------------------------
// api/client.ts — Typed API client for the contextplus-backed backend
// ---------------------------------------------------------------------------

import type { CallChainResponse, DiagramSpec, SequenceDiagramSpec, ERDiagramSpec, TextResult } from '../types/graph';

const BASE = import.meta.env.VITE_API_URL || '';

async function requestRaw<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Try to extract a structured error message from JSON body
    let message = '';
    if (body) {
      try {
        const parsed = JSON.parse(body);
        message = parsed?.error?.message || parsed?.message || body;
      } catch {
        message = body;
      }
    }
    throw new Error(message || `API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const json = await requestRaw<{ data: T }>(path, init);
  return json.data;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const api = {
  /** Get call chain for a symbol → structured nodes/edges/meta. */
  callChain(symbolName: string, filePath?: string, maxDepth?: number): Promise<CallChainResponse> {
    return post<CallChainResponse>('/call-chain', {
      symbol_name: symbolName,
      file_path: filePath,
      max_depth: maxDepth ?? 5,
    });
  },

  /** Semantic code search → text result. */
  search(query: string, topK?: number): Promise<TextResult> {
    return post<TextResult>('/search', { query, top_k: topK });
  },

  /** Get context tree for the codebase or a specific path. */
  contextTree(targetPath?: string): Promise<TextResult> {
    return post<TextResult>('/context-tree', { target_path: targetPath });
  },

  /** Get file skeleton (signatures, structure). */
  skeleton(filePath: string): Promise<TextResult> {
    return post<TextResult>('/skeleton', { file_path: filePath });
  },

  /** Get blast radius for a symbol. */
  blastRadius(symbolName: string, fileContext?: string): Promise<TextResult> {
    return post<TextResult>('/blast-radius', { symbol_name: symbolName, file_context: fileContext });
  },

  /** Search identifiers (function/class/variable names). */
  identifierSearch(query: string, topK?: number): Promise<TextResult> {
    return post<TextResult>('/identifier-search', { query, top_k: topK });
  },

  /** Run static analysis on a path. */
  staticAnalysis(targetPath?: string): Promise<TextResult> {
    return post<TextResult>('/static-analysis', { target_path: targetPath });
  },

  /** Scan a repository — builds the semantic tree via contextplus. */
  scanRepo(repoPath: string): Promise<{ tree: string; symbol_count: number; ready: boolean }> {
    return post<{ tree: string; symbol_count: number; ready: boolean }>('/scan-repo', {
      repo_path: repoPath,
    });
  },

  /** Clone a GitHub repo, then build semantic tree. */
  cloneRepo(githubUrl: string): Promise<{
    name: string;
    local_path: string;
    tree: string;
    symbol_count: number;
    ready: boolean;
  }> {
    return post('/clone-repo', { github_url: githubUrl });
  },

  /** Agentic RAG — ask a natural-language question about the codebase.
   *  When repoPath is provided, the RAG session targets that specific repo
   *  directory so tools only access the already-built context tree / index. */
  ragQuery(question: string, repoPath?: string): Promise<{ answer: string }> {
    return post('/rag-query', { question, repo_path: repoPath });
  },

  /** Generate an AI architecture diagram from a natural language prompt. */
  generateDiagram(prompt: string, repoPath?: string): Promise<DiagramSpec> {
    return post<DiagramSpec>('/generate-diagram', { prompt, repo_path: repoPath });
  },

  /** Generate architecture diagram from context tree + user prompt (AI Layer). */
  contextTreeArchitecture(prompt: string, targetPath?: string): Promise<DiagramSpec> {
    return post<DiagramSpec>('/context-tree-architecture', { prompt, target_path: targetPath });
  },

  /** Edit an existing diagram — modifies in-place without regenerating from scratch. */
  editDiagram(existingSpec: DiagramSpec, editPrompt: string): Promise<DiagramSpec> {
    return post<DiagramSpec>('/edit-diagram', { existing_spec: existingSpec, edit_prompt: editPrompt });
  },

  // ---- Deep Research API ------------------------------------------------

  /** Start a deep research analysis for a repository. */
  deepResearchStart(repositoryUrl: string): Promise<{ analysis_id: string }> {
    return post<{ analysis_id: string }>('/deep-research/start', { repository_url: repositoryUrl });
  },

  /** Poll the status of a deep research analysis. */
  deepResearchStatus(analysisId: string): Promise<{ status: string }> {
    return request<{ status: string }>(`/deep-research/status/${analysisId}`);
  },

  /** Fetch the completed deep research report. */
  deepResearchReport(analysisId: string): Promise<{ report: string }> {
    return request<{ report: string }>(`/deep-research/report/${analysisId}`);
  },

  /** Generate 3 diagrams from a deep research report (architecture, sequence, ER). */
  deepResearchDiagrams(report: string, repoName: string): Promise<{
    diagrams: { architecture?: DiagramSpec; sequence?: SequenceDiagramSpec; er?: ERDiagramSpec };
    errors: Record<string, string>;
  }> {
    return post('/deep-research/generate-diagrams', { report, repo_name: repoName });
  },
};
