// ---------------------------------------------------------------------------
// components/DeepResearchView.tsx — Full-page Deep Research analysis view
//   Phase 1: Warning splash (5-20 min processing warning)
//   Phase 2: Loading screen with progress polling
//   Phase 3: Results — left report + right diagram canvas with 3-diagram selector
// ---------------------------------------------------------------------------

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type FC,
} from 'react';
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Icon } from '@iconify/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '../api/client';
import type { DiagramSpec, SequenceDiagramSpec, ERDiagramSpec } from '../types/graph';
import ExportDialog from './eraser/ExportDialog';
import {
  resolveIcons,
  buildDiagramFromSpec,
  autoResizeBoundary,
  ArchNodeComponent,
  ArchGroupNodeComponent,
  ArchBoundaryNodeComponent,
} from './AIDiagramView';
import SequenceDiagramRenderer from './SequenceDiagramRenderer';
import ERDiagramRenderer from './ERDiagramRenderer';
import AuroraText from './ui/aurora-text';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = 'warning' | 'loading' | 'results';
type DiagramType = 'architecture' | 'sequence' | 'er';
type PanelMode = 'document' | 'both' | 'canvas';

const DIAGRAM_META: Record<DiagramType, { icon: string; label: string }> = {
  architecture: { icon: 'lucide:network', label: 'Architecture' },
  sequence: { icon: 'lucide:arrow-down-up', label: 'Sequence' },
  er: { icon: 'lucide:database', label: 'Entity-Relationship' },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DeepResearchViewProps {
  repoName: string;
  repoPath: string;
  /** GitHub URL for the repository (required by Deep Research API) */
  githubUrl?: string;
  /** Pre-loaded data when reopening a saved deep research */
  initialData?: {
    report: string;
    sequenceSpec?: unknown;
    erSpec?: unknown;
    archSpec?: unknown;
  };
  onBack: () => void;
  /** Called when a fresh analysis completes to persist it */
  onSaveResearch?: (data: {
    report: string;
    sequenceSpec?: unknown;
    erSpec?: unknown;
    archSpec?: unknown;
    archNodes?: unknown[];
    archEdges?: unknown[];
  }) => void;
  onExportSave?: (tool: string, query: string, nodes: unknown[], edges: unknown[]) => void;
}

// ---------------------------------------------------------------------------
// Inner component (needs ReactFlowProvider context)
// ---------------------------------------------------------------------------

const DeepResearchViewInner: FC<DeepResearchViewProps> = ({
  repoName,
  repoPath,
  githubUrl,
  initialData,
  onBack,
  onSaveResearch,
  onExportSave,
}) => {
  const [phase, setPhase] = useState<Phase>(initialData ? 'results' : 'warning');
  const [panelMode, setPanelMode] = useState<PanelMode>('both');
  const [activeDiagram, setActiveDiagram] = useState<DiagramType>('architecture');
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Initializing analysis…');
  const [report, setReport] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);

  // Diagram specs for each type
  const [diagramSpecs, setDiagramSpecs] = useState<Partial<Record<DiagramType, DiagramSpec>>>({});
  const [sequenceSpec, setSequenceSpec] = useState<SequenceDiagramSpec | null>(null);
  const [erSpec, setErSpec] = useState<ERDiagramSpec | null>(null);
  // Pre-built RF nodes/edges for architecture diagram only
  const [archCache, setArchCache] = useState<{ nodes: RFNode[]; edges: RFEdge[] } | null>(null);
  const [diagramKey, setDiagramKey] = useState(0);

  const [rfNodes, setRfNodes] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  // Resizable divider state
  const [leftPanelPct, setLeftPanelPct] = useState(40);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Edge highlight state (architecture diagram)
  const [highlightEdgeId, setHighlightEdgeId] = useState<string | null>(null);

  // Time tracker
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const nodeTypes = useMemo(
    () => ({
      archNode: ArchNodeComponent,
      archGroup: ArchGroupNodeComponent,
      archBoundary: ArchBoundaryNodeComponent,
    }),
    [],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setRfNodes((prev) => autoResizeBoundary(applyNodeChanges(changes, prev)));
    },
    [setRfNodes],
  );

  // --- Resizable divider handlers ---
  const handleDividerPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleDividerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftPanelPct(Math.min(Math.max(pct, 20), 80));
  }, []);

  const handleDividerPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // --- Edge highlighting (architecture) ---
  const highlightNodeIds = useMemo(() => {
    if (!highlightEdgeId) return null;
    const edge = rfEdges.find((e) => e.id === highlightEdgeId);
    if (!edge) return null;
    return new Set([edge.source, edge.target]);
  }, [highlightEdgeId, rfEdges]);

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

  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: RFEdge) => {
    setHighlightEdgeId((prev) => (prev === edge.id ? null : edge.id));
  }, []);

  // Auto fit-view when diagram switches
  useEffect(() => {
    if (phase === 'results' && rfNodes.length > 0) {
      const timer = setTimeout(
        () => fitView({ padding: 0.15, duration: 500 }),
        200,
      );
      return () => clearTimeout(timer);
    }
  }, [phase, rfNodes.length, fitView, diagramKey]);

  // Switch diagram type → load cached nodes/edges for architecture only
  useEffect(() => {
    if (activeDiagram === 'architecture' && archCache) {
      setRfNodes(archCache.nodes);
      setRfEdges(archCache.edges);
      setDiagramKey((k) => k + 1);
    } else if (activeDiagram === 'architecture') {
      setRfNodes([]);
      setRfEdges([]);
    }
  }, [activeDiagram, archCache, setRfNodes, setRfEdges]);

  // Format elapsed time
  const elapsedStr = useMemo(() => {
    const m = Math.floor(elapsedSecs / 60);
    const s = elapsedSecs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [elapsedSecs]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Restore from saved data when reopening a persisted deep research
  useEffect(() => {
    if (!initialData) return;
    setReport(initialData.report);
    if (initialData.sequenceSpec) setSequenceSpec(initialData.sequenceSpec as SequenceDiagramSpec);
    if (initialData.erSpec) setErSpec(initialData.erSpec as ERDiagramSpec);
    if (initialData.archSpec) {
      const archSpec = initialData.archSpec as DiagramSpec;
      (async () => {
        const resolved = await resolveIcons(archSpec);
        setDiagramSpecs({ architecture: resolved });
        const { rfNodes: nodes, rfEdges: edges } = await buildDiagramFromSpec(resolved);
        setArchCache({ nodes, edges });
      })();
    }
  }, []); // run once on mount

  // ---- Start the deep research pipeline -----------------------------------
  const startResearch = useCallback(async () => {
    setPhase('loading');
    setError(null);
    setElapsedSecs(0);

    // Start elapsed timer
    timerRef.current = setInterval(() => {
      setElapsedSecs((s) => s + 1);
    }, 1000);

    try {
      // Step 1: Start analysis
      setStatusText('Starting deep analysis…');
      if (!githubUrl) throw new Error('Deep Research requires a GitHub repository. Please select a repo that was cloned from GitHub.');
      const startResult = await api.deepResearchStart(githubUrl);
      const analysis_id = startResult?.analysis_id;
      if (!analysis_id) throw new Error('Failed to start analysis — no analysis_id returned from API.');

      // Step 2: Poll status
      setStatusText('Analyzing repository structure…');
      let status = 'processing';
      while (status !== 'completed') {
        await new Promise((r) => setTimeout(r, 5000)); // poll every 5s
        const res = await api.deepResearchStatus(analysis_id);
        status = res.status;
        if (status === 'failed') throw new Error('Analysis failed on the server.');
        if (status === 'completed') break;
        // Update status text based on elapsed time
        const elapsed = Math.floor((Date.now() - Date.now()) / 1000);
        if (elapsed > 120) setStatusText('Deep analysis in progress — processing complex structures…');
        else if (elapsed > 60) setStatusText('Analyzing dependencies and relationships…');
        else setStatusText('Analyzing repository structure…');
      }

      // Step 3: Fetch report
      setStatusText('Fetching analysis report…');
      const { report: fetchedReport } = await api.deepResearchReport(analysis_id);
      setReport(fetchedReport);

      // Step 4: Generate diagrams from the analysis report via Bedrock
      setStatusText('Generating diagrams from analysis…');
      const { diagrams, errors } = await api.deepResearchDiagrams(fetchedReport, repoName);

      // Process architecture diagram (same as before)
      const newSpecs: Partial<Record<DiagramType, DiagramSpec>> = {};
      let builtArchNodes: RFNode[] | undefined;
      let builtArchEdges: RFEdge[] | undefined;
      let rawArchSpec: DiagramSpec | undefined;
      if (diagrams.architecture) {
        rawArchSpec = diagrams.architecture as DiagramSpec;
        const resolved = await resolveIcons(rawArchSpec);
        newSpecs.architecture = resolved;
        const { rfNodes: nodes, rfEdges: edges } = await buildDiagramFromSpec(resolved);
        builtArchNodes = nodes;
        builtArchEdges = edges;
        setArchCache({ nodes, edges });
      }

      // Store sequence diagram spec (rendered by SequenceDiagramRenderer)
      const seqData = diagrams.sequence ? (diagrams.sequence as SequenceDiagramSpec) : null;
      if (seqData) {
        setSequenceSpec(seqData);
      } else if (errors.sequence) {
        console.warn('Deep research sequence diagram error:', errors.sequence);
      }

      // Store E-R diagram spec (rendered by ERDiagramRenderer)
      const erData = diagrams.er ? (diagrams.er as ERDiagramSpec) : null;
      if (erData) {
        setErSpec(erData);
      } else if (errors.er) {
        console.warn('Deep research E-R diagram error:', errors.er);
      }

      setDiagramSpecs(newSpecs);

      // Set initial diagram view
      if (newSpecs.architecture) {
        setActiveDiagram('architecture');
      } else if (diagrams.sequence) {
        setActiveDiagram('sequence');
      } else if (diagrams.er) {
        setActiveDiagram('er');
      }

      // Auto-save to workspace
      onSaveResearch?.({
        report: fetchedReport,
        sequenceSpec: seqData ?? undefined,
        erSpec: erData ?? undefined,
        archSpec: rawArchSpec,
        archNodes: builtArchNodes,
        archEdges: builtArchEdges,
      });

      // Stop timer and go to results
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setPhase('results');
    } catch (err) {
      console.error('Deep research error:', err);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setError(err instanceof Error ? err.message : String(err));
      setPhase('warning');
    }
  }, [githubUrl, repoName, onSaveResearch, setRfNodes, setRfEdges]);

  // ========================================================================
  // PHASE 1 — Warning splash
  // ========================================================================
  if (phase === 'warning') {
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-cyan-600 shadow-md">
              <Icon icon="lucide:scan-search" width={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-gray-100 tracking-wide">
                <AuroraText>Deep Research</AuroraText>
              </h1>
              <span className="text-[11px] text-gray-500">
                {repoName || 'No repository'}
              </span>
            </div>
          </div>
        </div>

        {/* Warning card */}
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="mx-auto w-full max-w-lg rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl p-10 flex flex-col items-center gap-6 animate-fade-in">
            {/* Icon */}
            <div className="relative">
              <div className="absolute -inset-4 rounded-full bg-purple-500/15 blur-2xl animate-deep-research-pulse" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600/15 to-cyan-600/15 backdrop-blur-xl border border-purple-400/20">
                <Icon icon="lucide:scan-search" width={40} className="text-purple-400" />
              </div>
            </div>

            {/* Title */}
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-200">
                <AuroraText>Deep Research</AuroraText>
              </h2>
              <p className="mt-3 max-w-md text-sm text-gray-400 leading-relaxed">
                This will perform an in-depth analysis of{' '}
                <span className="text-purple-300 font-medium">{repoName}</span>,
                generating a comprehensive report and architectural diagrams.
              </p>
            </div>

            {/* Warning banner */}
            <div className="w-full rounded-xl border border-amber-500/20 bg-amber-500/5 backdrop-blur-xl px-4 py-3 flex items-start gap-3">
              <Icon icon="lucide:clock" width={18} className="text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-300">This may take 5–20 minutes</p>
                <p className="text-xs text-amber-400/70 mt-1">
                  Deep analysis processes the entire repository structure, dependencies, and code patterns.
                  You can leave this page open and wait for results.
                </p>
              </div>
            </div>

            {/* No GitHub URL warning */}
            {!githubUrl && (
              <div className="w-full rounded-xl border border-red-500/20 bg-red-500/5 backdrop-blur-xl px-4 py-3 flex items-start gap-3">
                <Icon icon="lucide:alert-triangle" width={18} className="text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-300">GitHub repository required</p>
                  <p className="text-xs text-red-400/70 mt-1">
                    Deep Research only works with repositories cloned from GitHub. This repository was added via a local path.
                  </p>
                </div>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="w-full rounded-lg border border-red-500/30 bg-red-500/10 backdrop-blur-xl px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex w-full gap-3">
              <button
                onClick={onBack}
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl px-6 py-3 text-sm font-medium text-gray-400 transition-all hover:bg-white/[0.08] hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={startResearch}
                disabled={!githubUrl}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border backdrop-blur-xl px-6 py-3 text-sm font-medium transition-all ${
                  githubUrl
                    ? 'bg-purple-600/20 border-purple-500/30 text-purple-300 hover:bg-purple-600/30 hover:text-purple-200 hover:shadow-lg hover:shadow-purple-500/10'
                    : 'bg-white/[0.02] border-white/[0.06] text-gray-600 cursor-not-allowed'
                }`}
              >
                <Icon icon="lucide:scan-search" width={16} />
                Start Analysis
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================================
  // PHASE 2 — Loading screen with progress
  // ========================================================================
  if (phase === 'loading') {
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-cyan-600 shadow-md animate-pulse">
              <Icon icon="lucide:scan-search" width={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-100 tracking-wide">
                <AuroraText>Analyzing…</AuroraText>
              </h1>
              <span className="text-[11px] text-gray-500">
                {repoName}
              </span>
            </div>
          </div>
          <div className="ml-auto">
            <span className="text-xs font-mono text-gray-500">{elapsedStr}</span>
          </div>
        </div>

        {/* Loading animation */}
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="mx-auto w-full max-w-lg rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl p-10 flex flex-col items-center gap-8 shadow-2xl shadow-purple-500/5">
            {/* Pulsing glow */}
            <div className="relative">
              <div className="absolute -inset-8 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 blur-3xl animate-deep-research-pulse" />
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-purple-400/20 bg-white/[0.04] backdrop-blur-2xl shadow-2xl shadow-purple-500/10">
                <Icon
                  icon="lucide:scan-search"
                  width={48}
                  className="text-purple-400 animate-pulse"
                />
              </div>
            </div>

            {/* Status text */}
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-200">
                Deep Research in Progress
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                {statusText}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Elapsed: {elapsedStr} — Estimated: 5–20 minutes
              </p>
            </div>

            {/* Bouncing dots */}
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:300ms]" />
            </div>

            {/* Shimmer bars */}
            <div className="w-full space-y-3">
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-purple-400/40 to-transparent animate-shimmer" />
              </div>
              <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                <div className="h-full w-1/4 rounded-full bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent animate-shimmer [animation-delay:500ms]" />
              </div>
            </div>

            {/* Processing steps indicator */}
            <div className="w-full space-y-2 mt-2">
              {[
                { label: 'Repository analysis', done: elapsedSecs > 10 },
                { label: 'Dependency mapping', done: elapsedSecs > 60 },
                { label: 'Code pattern detection', done: elapsedSecs > 120 },
                { label: 'Report generation', done: elapsedSecs > 180 },
                { label: 'Diagram synthesis', done: false },
              ].map((step) => (
                <div key={step.label} className="flex items-center gap-2 text-xs">
                  {step.done ? (
                    <Icon icon="lucide:check-circle-2" width={14} className="text-emerald-400" />
                  ) : (
                    <Icon icon="lucide:circle-dot" width={14} className="text-gray-600 animate-pulse" />
                  )}
                  <span className={step.done ? 'text-gray-400' : 'text-gray-600'}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================================
  // PHASE 3 — Results (report + diagrams)
  // ========================================================================
  return (
    <div className="flex h-full flex-col bg-transparent">
      {/* ── Top bar ─────────────────────────────────────────── */}
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
            <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-purple-600 to-cyan-600">
              <Icon icon="lucide:scan-search" width={10} className="text-white" />
            </div>
            <span className="text-base font-semibold text-gray-200">
              <AuroraText>Deep Research</AuroraText>
              <span className="ml-2 text-gray-500">— {repoName}</span>
            </span>
          </div>
        </div>

        {/* Center: Panel mode tabs */}
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

        {/* Right */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500">
            {repoName}
          </span>
        </div>
      </div>

      {/* ── Main content area ─────────────────────────────────── */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Report panel (left) */}
        {(panelMode === 'document' || panelMode === 'both') && (
          <div
            className="hide-scrollbar overflow-auto border-r border-white/[0.08]"
            style={{ width: panelMode === 'both' ? `${leftPanelPct}%` : '100%' }}
          >
            <ScrollArea className="h-full">
              <div className="p-6">
                <div className="rounded-2xl border border-purple-500/20 bg-purple-500/[0.04] backdrop-blur-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Icon icon="lucide:file-text" width={18} className="text-purple-400" />
                    <h2 className="text-lg font-semibold text-gray-200">Analysis Report</h2>
                  </div>
                  <div className="prose prose-invert prose-sm max-w-none
                    prose-headings:text-gray-100 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                    prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                    prose-p:text-gray-300 prose-p:leading-relaxed prose-p:my-2
                    prose-strong:text-gray-100
                    prose-li:text-gray-300 prose-li:my-0.5
                    prose-ul:my-2 prose-ol:my-2
                    prose-code:text-purple-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                    prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700 prose-pre:rounded-lg
                    prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                    prose-hr:border-white/[0.08]
                  ">
                    {report ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {report}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-gray-500 italic">No report data available.</p>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Resizable divider */}
        {panelMode === 'both' && (
          <div
            className="relative z-10 flex-shrink-0 cursor-col-resize select-none group"
            style={{ width: 6 }}
            onPointerDown={handleDividerPointerDown}
            onPointerMove={handleDividerPointerMove}
            onPointerUp={handleDividerPointerUp}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/[0.08] group-hover:bg-purple-400/40 group-active:bg-purple-400/60 transition-colors" />
          </div>
        )}

        {/* Canvas panel (right) */}
        {(panelMode === 'canvas' || panelMode === 'both') && (
          <div
            ref={flowRef}
            className="relative flex-1 min-w-0"
          >
            {/* Architecture diagram — uses ReactFlow with arch nodes */}
            {activeDiagram === 'architecture' && rfNodes.length > 0 && (
              <div key={diagramKey} className="h-full w-full" style={{ animation: 'diagramFadeIn 0.5s ease-out' }}>
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
                </ReactFlow>
              </div>
            )}

            {/* Sequence diagram — dedicated renderer */}
            {activeDiagram === 'sequence' && sequenceSpec && (
              <div className="flex h-full w-full flex-col rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
                  <Icon icon="lucide:arrow-down-up" width={14} className="text-purple-400" />
                  <span className="text-sm font-semibold text-gray-200">{sequenceSpec.title || 'Sequence Diagram'}</span>
                </div>
                <div className="flex-1 min-h-0">
                  <ReactFlowProvider>
                    <SequenceDiagramRenderer spec={sequenceSpec} diagramKey={diagramKey} />
                  </ReactFlowProvider>
                </div>
              </div>
            )}

            {/* E-R diagram — dedicated renderer */}
            {activeDiagram === 'er' && erSpec && (
              <div className="flex h-full w-full flex-col rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
                  <Icon icon="lucide:database" width={14} className="text-purple-400" />
                  <span className="text-sm font-semibold text-gray-200">{erSpec.title || 'Entity-Relationship Diagram'}</span>
                </div>
                <div className="flex-1 min-h-0">
                  <ReactFlowProvider>
                    <ERDiagramRenderer spec={erSpec} diagramKey={diagramKey} />
                  </ReactFlowProvider>
                </div>
              </div>
            )}

            {/* Fallback: no diagram */}
            {((activeDiagram === 'architecture' && rfNodes.length === 0) ||
              (activeDiagram === 'sequence' && !sequenceSpec) ||
              (activeDiagram === 'er' && !erSpec)) && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Icon icon="lucide:layout-dashboard" width={32} className="mx-auto text-gray-700 mb-3" />
                  <p className="text-sm text-gray-600">No diagram available for this type.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom bar with diagram selector ───────────────────── */}
      <div className="flex items-center justify-between border-t border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl px-4 py-2">
        {/* Left: Diagram type selector */}
        <div className="flex items-center gap-1">
          {(['architecture', 'sequence', 'er'] as DiagramType[]).map((type) => {
            const meta = DIAGRAM_META[type];
            const isActive = activeDiagram === type;
            const isAvailable =
              (type === 'architecture' && !!archCache) ||
              (type === 'sequence' && !!sequenceSpec) ||
              (type === 'er' && !!erSpec);
            return (
              <button
                key={type}
                onClick={() => isAvailable && setActiveDiagram(type)}
                title={isAvailable ? meta.label : `${meta.label} (not available)`}
                disabled={!isAvailable}
                className={`group relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  !isAvailable
                    ? 'border border-transparent text-gray-700 cursor-not-allowed opacity-50'
                    : isActive
                      ? 'bg-purple-500/15 border border-purple-500/30 text-purple-300 shadow-md shadow-purple-500/10'
                      : 'border border-transparent text-gray-500 hover:bg-white/[0.06] hover:text-gray-300'
                }`}
              >
                <Icon icon={meta.icon} width={14} />
                <span className="hidden sm:inline">{meta.label}</span>
              </button>
            );
          })}
        </div>

        {/* Center: Current diagram title */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">
            {activeDiagram === 'architecture' && diagramSpecs.architecture?.title}
            {activeDiagram === 'sequence' && (sequenceSpec?.title || 'Sequence Diagram')}
            {activeDiagram === 'er' && (erSpec?.title || 'Entity-Relationship Diagram')}
            {!diagramSpecs.architecture?.title && activeDiagram === 'architecture' && DIAGRAM_META[activeDiagram].label}
          </span>
        </div>

        {/* Right: Stats + Export */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500">
            {rfNodes.length} nodes · {rfEdges.length} edges
          </span>
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 backdrop-blur-xl transition-all hover:bg-emerald-500/20 hover:text-emerald-200"
          >
            <Icon icon="lucide:download" width={13} />
            Export
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
        diagramName={`Deep Research — ${DIAGRAM_META[activeDiagram].label}`}
        onClose={() => setExportOpen(false)}
        onSaved={() => {
          setExportOpen(false);
          onExportSave?.(
            'deep-research',
            `Deep Research — ${repoName}`,
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

const DeepResearchView: FC<DeepResearchViewProps> = (props) => (
  <ReactFlowProvider>
    <DeepResearchViewInner {...props} />
  </ReactFlowProvider>
);

export default DeepResearchView;
