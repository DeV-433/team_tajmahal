// ---------------------------------------------------------------------------
// eraser/EraserEditor.tsx — Eraser.io-style split editor page
//   Top:   File name + "Document | Both | Canvas" tabs + share actions
//   Left:  Document panel (markdown notes + AI answer)
//   Right: Canvas (React Flow diagram + toolbar + AI Diagram card)
// ---------------------------------------------------------------------------

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from 'react';
import { Icon } from '@iconify/react';
import ReactFlow, {
  Background,
  Controls,
  Panel,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  applyNodeChanges,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
  type EdgeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';

import GraphCanvas from '../GraphCanvas';
import DocumentPanel from './DocumentPanel';
import CanvasToolbar, { type CanvasTool } from './CanvasToolbar';
import AIDiagramCard from './AIDiagramCard';
import DrawingOverlay from './DrawingOverlay';
import ExportDialog from './ExportDialog';
import QueryBar, { type QueryResult } from '../panels/QueryBar';
import { api } from '../../api/client';
import {
  resolveIcons,
  buildDiagramFromSpec,
  autoResizeBoundary,
  ArchNodeComponent,
  ArchGroupNodeComponent,
  ArchBoundaryNodeComponent,
} from '../AIDiagramView';

import type { UseGraphReturn } from '../../hooks/useGraph';
import type { UseSSEReturn } from '../../hooks/useSSE';
import type { DiagramSpec } from '../../types/graph';

// ---------------------------------------------------------------------------
// Panel mode
// ---------------------------------------------------------------------------

type PanelMode = 'document' | 'both' | 'canvas';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EraserEditorProps {
  repoName: string;
  repoPath: string;
  graph: UseGraphReturn;
  sse: UseSSEReturn;
  onBack: () => void;
  onExportSave?: (tool: string, query: string, nodes: unknown[], edges: unknown[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EraserEditor: FC<EraserEditorProps> = ({ repoName, repoPath, graph, sse, onBack, onExportSave }) => {
  const [panelMode, setPanelMode] = useState<PanelMode>('both');
  const [docContent, setDocContent] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('pointer');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showQueryBar, setShowQueryBar] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [exportOpen, setExportOpen] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);

  // ---- AI Diagram (LLM + ELKjs) state ────────────────────────────
  const [diagramRfNodes, setDiagramRfNodes] = useState<RFNode[]>([]);
  const [diagramRfEdges, setDiagramRfEdges] = useState<RFEdge[]>([]);
  const [currentSpec, setCurrentSpec] = useState<DiagramSpec | null>(null);
  const [diagramKey, setDiagramKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditingDiagram, setIsEditingDiagram] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const archNodeTypes = useMemo(
    () => ({
      archNode: ArchNodeComponent,
      archGroup: ArchGroupNodeComponent,
      archBoundary: ArchBoundaryNodeComponent,
    }),
    [],
  );

  // ---- AI Architecture from Context Tree state ───────────────────
  const [showArchPrompt, setShowArchPrompt] = useState(false);
  const [archPrompt, setArchPrompt] = useState('');
  const [archGenerating, setArchGenerating] = useState(false);
  const [archError, setArchError] = useState<string | null>(null);

  // ---- Resizable splitter state ──────────────────────────────────
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(80, Math.max(20, pct)));
    };
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // ---- AI Diagram generation (Groq LLM + ELKjs, in-place) ───────
  const handleAIDiagramGenerate = useCallback(
    async (prompt: string) => {
      setIsGenerating(true);
      setAiAnswer(null);
      setDiagramRfNodes([]);
      setDiagramRfEdges([]);
      setPanelMode('both');
      try {
        // Fire RAG overview in the background (don't block diagram)
        const ragPromise = api
          .ragQuery(
            `Based on analyzing this codebase, ${prompt}. Provide a structured analysis listing the main components, their relationships, and data flow. Format your response with clear sections.`,
            repoPath || undefined,
          )
          .then((result) => {
            setAiAnswer(result.answer);
            setDocContent(result.answer);
          })
          .catch((err) => {
            console.warn('RAG query failed (non-blocking):', err);
            setAiAnswer('(RAG overview unavailable — diagram generated successfully)');
          });

        // Generate diagram spec (this is the critical path)
        const rawSpec = await api.generateDiagram(prompt, repoPath || undefined);

        // Resolve icons + ELKjs layout → React Flow nodes/edges
        const resolvedSpec = await resolveIcons(rawSpec);
        setCurrentSpec(resolvedSpec);
        const { rfNodes, rfEdges } = await buildDiagramFromSpec(resolvedSpec);
        setDiagramRfNodes(rfNodes);
        setDiagramRfEdges(rfEdges);
        setDiagramKey((k) => k + 1);

        // Wait briefly for RAG to complete, but don't block forever
        await Promise.race([ragPromise, new Promise((r) => setTimeout(r, 5000))]);
      } catch (err) {
        console.error('AI diagram error:', err);
        setAiAnswer(
          `Error generating diagram: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [repoPath],
  );

  // ---- Edit diagram handler (modifies existing, does NOT regenerate) ────
  const handleEditDiagram = useCallback(async () => {
    const text = editPrompt.trim();
    if (!text || !currentSpec) return;

    setIsEditingDiagram(true);
    setEditError(null);

    try {
      const rawSpec = await api.editDiagram(currentSpec, text);
      const resolvedSpec = await resolveIcons(rawSpec);
      setCurrentSpec(resolvedSpec);
      const { rfNodes, rfEdges } = await buildDiagramFromSpec(resolvedSpec);
      setDiagramRfNodes(rfNodes);
      setDiagramRfEdges(rfEdges);
      setDiagramKey((k) => k + 1);
      setEditPrompt('');
      setEditOpen(false);
    } catch (err) {
      console.error('Edit diagram error:', err);
      setEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsEditingDiagram(false);
    }
  }, [editPrompt, currentSpec]);

  // ---- Handle query bar results ──────────────────────────────────
  const handleQueryResult = useCallback(
    (result: QueryResult) => {
      switch (result.kind) {
        case 'call_chain': {
          const { nodes, edges, call_chain_meta } = result.data;
          graph.setCallChainFromResponse(nodes, edges, call_chain_meta);
          break;
        }
        case 'text': {
          graph.setTextResult(result.tool, result.data.result);
          break;
        }
        case 'rag_answer': {
          setAiAnswer(result.data.answer);
          break;
        }
      }
    },
    [graph],
  );

  // ---- Generate outline shortcut ─────────────────────────────────
  const handleGenerateOutline = useCallback(async () => {
    setIsGenerating(true);
    try {
      const result = await api.ragQuery(
        'Generate a concise architectural outline of this codebase. List the main modules, their responsibilities, and key entry points.',
        repoPath || undefined,
      );
      setAiAnswer(result.answer);
      setDocContent(result.answer);
    } catch (err) {
      console.error('Outline error:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [repoPath]);

  // ---- AI Architecture from Context Tree ─────────────────────────
  const handleArchFromContextTree = useCallback(async () => {
    const text = archPrompt.trim();
    if (!text) return;
    setArchGenerating(true);
    setArchError(null);
    try {
      const spec = await api.contextTreeArchitecture(text, repoPath || undefined);
      // Switch to AI Diagram view mode using the graph's diagram spec
      // Convert DiagramSpec nodes/edges into the call chain format for GraphCanvas
      const nodes = spec.nodes.map((n, i) => ({
        id: n.id,
        name: n.label,
        file_path: '',
        _diagramIcon: n.icon,
        _diagramGroup: n.group ?? undefined,
      }));
      const edges = spec.edges.map((e, i) => ({
        id: `edge-${i}`,
        source_id: e.source,
        target_id: e.target,
        _label: e.label,
      }));
      const meta = {
        root_id: nodes[0]?.id ?? '',
        depths: Object.fromEntries(nodes.map((n, i) => [n.id, i < 3 ? 0 : 1])),
        annotations: {} as Record<string, string[]>,
        node_roles: {} as Record<string, string>,
        stats: { total_hops: 1, leaf_count: 0, external_count: 0, max_depth: 1 },
      };
      graph.setCallChainFromResponse(nodes, edges, meta);
      setAiAnswer(`**AI Architecture: ${spec.title}**\n\nGenerated ${spec.nodes.length} components across ${spec.groups.length} groups from the context tree.`);
      setShowArchPrompt(false);
      setArchPrompt('');
    } catch (err) {
      console.error('Context tree architecture error:', err);
      setArchError(err instanceof Error ? err.message : String(err));
    } finally {
      setArchGenerating(false);
    }
  }, [archPrompt, repoPath, graph]);

  const showDocument = panelMode === 'document' || panelMode === 'both';
  const showCanvas = panelMode === 'canvas' || panelMode === 'both';
  const hasDiagram = diagramRfNodes.length > 0;
  const hasContent = graph.nodes.length > 0 || (graph.canvasMode === 'text_result' && graph.textResult) || hasDiagram;

  return (
    <div className="flex h-full flex-col bg-transparent">
      {/* ── Top bar ────────────────────────────────────────────── */}
      <div className="flex h-11 items-center justify-between rounded-tr-2xl border-b border-white/[0.08] px-4">
        {/* Left: back + file name */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <Icon icon="lucide:chevron-left" width={14} />
            Back
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-red-500 to-blue-500">
              <span className="text-[9px] font-bold text-white">V</span>
            </div>
            <span className="text-sm font-medium text-gray-200">
              {repoName || 'Untitled File'}
            </span>
            <span className="text-gray-600">···</span>
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

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <kbd className="rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-[10px] text-gray-500">
            Ctrl K
          </kbd>
        </div>
      </div>

      {/* ── Main content area ──────────────────────────────────── */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Document panel */}
        {showDocument && (
          <div
            className="hide-scrollbar overflow-auto"
            style={{ width: showCanvas ? `${splitPercent}%` : '100%' }}
          >
            <DocumentPanel
              title={repoName}
              content={docContent}
              onContentChange={setDocContent}
              aiAnswer={aiAnswer}
            />

            {/* Generate Outline button (shown when no AI answer yet) */}
            {!aiAnswer && !isGenerating && (
              <div className="flex justify-center pb-8">
                <button
                  onClick={handleGenerateOutline}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl px-4 py-2 text-sm text-gray-300 transition-all hover:border-white/[0.15] hover:bg-white/[0.08] hover:text-gray-100"
                >
                  <Icon icon="lucide:sparkles" width={14} className="text-purple-400" />
                  Generate Outline
                  <kbd className="ml-2 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[9px] text-gray-500">
                    Ctrl⇧ J
                  </kbd>
                </button>
              </div>
            )}
            {isGenerating && (
              <div className="flex justify-center pb-8">
                <div className="flex items-center gap-2 text-sm text-purple-400">
                  <Icon icon="lucide:loader-2" width={14} className="animate-spin" />
                  Generating…
                </div>
              </div>
            )}
          </div>
        )}

        {/* Resizable splitter handle */}
        {showDocument && showCanvas && (
          <div
            onMouseDown={handleSplitterMouseDown}
            className="group relative z-20 w-px shrink-0 cursor-col-resize bg-white/[0.06]"
          >
            {/* Wide hit-zone overlapping both panels */}
            <div className="absolute inset-y-0 -left-1.5 flex w-3 items-center justify-center transition-colors hover:bg-blue-500/10 active:bg-blue-500/20">
              <div className="h-8 w-0.5 rounded-full bg-white/[0.15] transition-colors group-hover:bg-blue-400/60 group-active:bg-blue-400" />
            </div>
          </div>
        )}

        {/* Canvas panel */}
        {showCanvas && (
          <div
            className="relative flex"
            style={{ width: showDocument ? `${100 - splitPercent}%` : '100%' }}
          >
            {/* Canvas content area */}
            <div
              className="relative h-full"
              style={{
                width: editOpen && hasDiagram ? '65%' : '100%',
                transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
            {/* Query bar toggle */}
            {showQueryBar && (
              <div className="absolute inset-x-0 top-0 z-20">
                <QueryBar onResult={handleQueryResult} repoPath={repoPath} />
              </div>
            )}

            {/* Canvas content */}
            <div className="h-full w-full">
              {hasContent ? (
                /* Show graph or text result */
                graph.canvasMode === 'text_result' && graph.textResult ? (
                  <div className="flex h-full flex-col bg-black/30 backdrop-blur-xl">
                    <div className="flex items-center justify-between border-b border-gray-700 px-4 py-2">
                      <span className="text-sm font-semibold text-gray-300">
                        {(graph.textTool ?? '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Result
                      </span>
                      <div className="flex items-center gap-2">
                        {/* AI Architecture button — shown only for context-tree results */}
                        {graph.textTool === 'context-tree' && (
                          <button
                            onClick={() => { setShowArchPrompt(true); setArchError(null); }}
                            className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-300 backdrop-blur-xl transition-all hover:bg-purple-500/20 hover:text-purple-200"
                          >
                            <Icon icon="lucide:sparkles" width={13} />
                            AI Architecture
                          </button>
                        )}
                        <button
                          onClick={graph.clearAll}
                          className="text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* AI Architecture prompt overlay */}
                    {showArchPrompt && graph.textTool === 'context-tree' && (
                      <div className="border-b border-purple-500/20 bg-purple-950/30 backdrop-blur-xl px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Icon icon="lucide:sparkles" width={14} className="text-purple-400" />
                          <span className="text-xs font-semibold text-purple-300">Generate Architecture from Context Tree</span>
                          <button
                            onClick={() => { setShowArchPrompt(false); setArchError(null); }}
                            className="ml-auto text-gray-500 hover:text-gray-300 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                        <form
                          onSubmit={(e) => { e.preventDefault(); handleArchFromContextTree(); }}
                          className="flex gap-2"
                        >
                          <input
                            value={archPrompt}
                            onChange={(e) => setArchPrompt(e.target.value)}
                            placeholder="Describe the architecture you want to generate…"
                            className="flex-1 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-xs text-gray-200 placeholder:text-gray-600 outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20"
                            disabled={archGenerating}
                            autoFocus
                          />
                          <button
                            type="submit"
                            disabled={archGenerating || !archPrompt.trim()}
                            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-medium text-white transition-all hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {archGenerating ? (
                              <>
                                <Icon icon="lucide:loader-2" width={13} className="animate-spin" />
                                Generating…
                              </>
                            ) : (
                              <>
                                <Icon icon="lucide:wand-2" width={13} />
                                Generate
                              </>
                            )}
                          </button>
                        </form>
                        {archError && (
                          <p className="mt-2 text-xs text-red-400">{archError}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {['Show the overall system architecture', 'Map the API layer and data flow', 'Visualize microservice boundaries'].map((suggestion) => (
                            <button
                              key={suggestion}
                              onClick={() => setArchPrompt(suggestion)}
                              className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-300"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs text-gray-300 leading-relaxed">
                      {graph.textResult}
                    </pre>
                  </div>
                ) : hasDiagram ? (
                  <div ref={flowRef} className="h-full w-full" key={diagramKey} style={{ animation: 'diagramFadeIn 0.5s ease-out' }}>
                    <ReactFlowProvider>
                      <ArchDiagramCanvas
                        rfNodes={diagramRfNodes}
                        rfEdges={diagramRfEdges}
                        nodeTypes={archNodeTypes}
                      />
                    </ReactFlowProvider>
                  </div>
                ) : (
                  <div ref={flowRef} className="h-full w-full">
                    <ReactFlowProvider>
                      <GraphCanvas graph={graph} sse={sse} />
                    </ReactFlowProvider>
                  </div>
                )
              ) : (
                /* Empty canvas: show AI Diagram card */
                <div className="flex h-full w-full items-center justify-center bg-transparent pl-12 pr-20">
                  <AIDiagramCard
                    onGenerate={handleAIDiagramGenerate}
                    isGenerating={isGenerating}
                  />
                </div>
              )}
            </div>

            {/* Floating Edit button — shown when AI diagram is rendered */}
            {hasDiagram && !editOpen && (
              <button
                onClick={() => setEditOpen(true)}
                className="absolute top-3 right-3 z-30 flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/15 backdrop-blur-xl px-3.5 py-2 text-xs font-medium text-purple-300 shadow-lg shadow-purple-500/10 transition-all hover:bg-purple-500/25 hover:text-purple-200 hover:shadow-xl hover:shadow-purple-500/15 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Icon icon="lucide:wand-2" width={14} />
                Edit
              </button>
            )}

            {/* Drawing overlay — active when a shape tool is selected */}
            <DrawingOverlay
              activeTool={canvasTool}
              onToolReset={() => setCanvasTool('pointer')}
            />

            {/* Canvas toolbar */}
            <CanvasToolbar
              activeTool={canvasTool}
              onToolChange={setCanvasTool}
              onAdd={() => setShowQueryBar((p) => !p)}
              onAI={() => {
                graph.clearAll();
                setAiAnswer(null);
                setDiagramRfNodes([]);
                setDiagramRfEdges([]);
                setCurrentSpec(null);
                setEditOpen(false);
              }}
              disabled={!hasContent}
            />

            {/* Bottom bar: size + Create Figure */}
            <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between rounded-br-2xl border-t border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl px-4 py-1.5">
              <span className="text-[11px] text-gray-500">
                {hasDiagram
                  ? `${diagramRfNodes.length} nodes · ${diagramRfEdges.length} edges`
                  : graph.nodes.length > 0
                  ? `${graph.nodes.length} nodes · ${graph.edges.length} edges`
                  : 'Empty canvas'}
              </span>
              <div className="flex items-center gap-2">
                {/* Export button — shown when diagram has graph nodes or AI diagram */}
                {(hasContent && graph.nodes.length > 0) || hasDiagram ? (
                  <button
                    onClick={() => setExportOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 backdrop-blur-xl transition-all hover:bg-emerald-500/20 hover:text-emerald-200"
                  >
                    <Icon icon="lucide:download" width={13} />
                    Export
                  </button>
                ) : null}

                <button className="flex items-center gap-1.5 rounded-lg border border-gray-700/50 bg-gray-800 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-700">
                  <svg width="14" height="14" viewBox="0 0 16 16" className="text-gray-400">
                    <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    <line x1="8" y1="5" x2="8" y2="11" stroke="currentColor" strokeWidth="1.2" />
                    <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  Create Figure
                  <kbd className="rounded border border-gray-700 bg-gray-800/80 px-1 text-[9px] text-gray-600">⇧ F</kbd>
                </button>
              </div>
            </div>
            </div>

            {/* ── Edit Diagram panel (slides in from right) ──────── */}
            {editOpen && hasDiagram && (
              <div
                className="flex flex-col border-l border-white/[0.08] bg-white/[0.02] backdrop-blur-xl overflow-hidden"
                style={{
                  width: '35%',
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
                    disabled={isEditingDiagram}
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
                          disabled={isEditingDiagram}
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
                    disabled={isEditingDiagram}
                    className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-400 transition-all hover:bg-white/[0.08] hover:text-gray-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditDiagram}
                    disabled={isEditingDiagram || !editPrompt.trim()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 px-3 py-2 text-xs font-medium text-purple-300 transition-all hover:bg-purple-600/30 hover:text-purple-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isEditingDiagram ? (
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
        )}
      </div>

      {/* ── Export dialog ──────────────────────────────────────── */}
      <ExportDialog
        open={exportOpen}
        flowElement={flowRef.current?.querySelector('.react-flow') as HTMLElement | null}
        diagramName={repoName}
        onClose={() => setExportOpen(false)}
        onSaved={() => {
          setExportOpen(false);
          if (hasDiagram) {
            onExportSave?.(
              'ai-diagram',
              aiAnswer ?? 'AI Architecture Diagram',
              diagramRfNodes,
              diagramRfEdges,
            );
          } else {
            onExportSave?.(
              graph.canvasMode,
              aiAnswer ?? 'Exported diagram',
              graph.nodes,
              graph.edges,
            );
          }
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Parse context-tree text output into architecture diagram nodes
// ---------------------------------------------------------------------------

import type { FlatNode, FlatEdge, CallChainMeta } from '../../types/graph';

interface ArchResult {
  nodes: FlatNode[];
  edges: FlatEdge[];
  meta: CallChainMeta;
}

function parseTreeToArchitectureNodes(treeText: string): ArchResult {
  const lines = treeText.split('\n').filter((l) => l.trim().length > 0);
  const nodes: FlatNode[] = [];
  const edges: FlatEdge[] = [];
  const depths: Record<string, number> = {};
  const annotations: Record<string, string[]> = {};
  const nodeRoles: Record<string, string> = {};

  // Parse indented tree structure into flat nodes
  // Format typically: "  src/api/handlers.go" or "    func handleCallChain()"
  let rootId = '';
  const stack: { id: string; indent: number }[] = [];

  for (const line of lines) {
    const trimmed = line.replace(/^[│├└─\s]+/, '');
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---')) continue;

    const indent = line.length - line.trimStart().length;

    // Determine type
    let type: 'file' | 'function' | 'package' = 'file';
    let name = trimmed;

    if (/\.(ts|js|go|py|rs|java|tsx|jsx|css|html|md)$/.test(trimmed)) {
      type = 'file';
    } else if (/^(func|function|def|class|interface|type|struct|export)\s/.test(trimmed)) {
      type = 'function';
      name = trimmed.replace(/^(func|function|def|class|interface|type|struct|export)\s+/, '').split('(')[0].trim();
    } else if (trimmed.endsWith('/') || /^[a-z]/.test(trimmed) && !trimmed.includes('.')) {
      type = 'package';
    }

    const id = `arch:${type}:${name}:${nodes.length}`;

    if (nodes.length === 0) rootId = id;

    nodes.push({
      id,
      name,
      file_path: type === 'file' ? trimmed : '',
    });

    // Determine depth for tree layout
    const depth = Math.floor(indent / 2);
    depths[id] = depth;
    annotations[id] = [type];
    nodeRoles[id] = depth === 0 ? 'target' : 'callee';

    // Connect to parent based on indentation
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    if (stack.length > 0) {
      const parentId = stack[stack.length - 1].id;
      edges.push({
        id: `${parentId}->${id}`,
        source_id: parentId,
        target_id: id,
      });
    }
    stack.push({ id, indent });

    // Limit to avoid overwhelming canvas
    if (nodes.length >= 50) break;
  }

  // Compute stats
  let maxDepth = 0;
  for (const d of Object.values(depths)) {
    if (d > maxDepth) maxDepth = d;
  }

  return {
    nodes,
    edges,
    meta: {
      root_id: rootId,
      depths,
      annotations,
      node_roles: nodeRoles,
      stats: {
        total_hops: maxDepth,
        leaf_count: nodes.filter((n) => !edges.some((e) => e.source_id === n.id)).length,
        external_count: 0,
        max_depth: maxDepth,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Lightweight ReactFlow wrapper for architecture diagrams (LLM + ELKjs)
// ---------------------------------------------------------------------------

interface ArchDiagramCanvasProps {
  rfNodes: RFNode[];
  rfEdges: RFEdge[];
  nodeTypes: Record<string, FC<any>>;
}

const ArchDiagramCanvas: FC<ArchDiagramCanvasProps> = ({ rfNodes: initial, rfEdges: initialEdges, nodeTypes }) => {
  const { fitView } = useReactFlow();
  const [nodes, setNodes] = useNodesState(initial);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [highlightEdgeId, setHighlightEdgeId] = useState<string | null>(null);

  // Custom onNodesChange that auto-resizes the boundary container
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => autoResizeBoundary(applyNodeChanges(changes, prev)));
    },
    [setNodes],
  );

  useEffect(() => {
    setNodes(initial);
    setEdges(initialEdges);
    setHighlightEdgeId(null);
  }, [initial, initialEdges, setNodes, setEdges]);

  useEffect(() => {
    if (nodes.length > 0) {
      const t = setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 120);
      return () => clearTimeout(t);
    }
  }, [nodes.length, fitView]);

  // Derive the set of highlighted node IDs from the selected edge
  const highlightNodeIds = useMemo(() => {
    if (!highlightEdgeId) return null;
    const edge = edges.find((e) => e.id === highlightEdgeId);
    if (!edge) return null;
    return new Set([edge.source, edge.target]);
  }, [highlightEdgeId, edges]);

  // Apply dimming styles to nodes and edges when an edge is selected
  const styledNodes = useMemo(() => {
    if (!highlightNodeIds) return nodes;
    return nodes.map((n) => ({
      ...n,
      style: {
        ...n.style,
        opacity: highlightNodeIds.has(n.id) ? 1 : 0.15,
        transition: 'opacity 0.3s ease',
      },
    }));
  }, [nodes, highlightNodeIds]);

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

  const handleEdgeClick: EdgeMouseHandler = useCallback((_event, edge) => {
    setHighlightEdgeId((prev) => (prev === edge.id ? null : edge.id));
  }, []);

  return (
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
    >
      <Background color="#1a2236" gap={28} size={1} style={{ backgroundColor: 'transparent' }} />
      <Controls position="bottom-left" className="!flex !flex-row !w-auto !h-auto !bg-gray-800 !border-gray-700 !rounded-xl [&>button]:!bg-gray-800 [&>button]:!border-gray-700 [&>button]:!text-gray-400 [&>button]:hover:!bg-gray-700 [&>button]:hover:!text-gray-200 [&>button]:!w-8 [&>button]:!h-8" />
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
  );
};

export default memo(EraserEditor);
