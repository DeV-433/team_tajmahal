// ---------------------------------------------------------------------------
// App.tsx — Eraser.io-style two-panel layout
//   Left sidebar : repos + nav
//   Main area    : dashboard (diagrams list) OR diagram editor (QueryBar + canvas)
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState, type FC } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Node as RFNode, Edge as RFEdge } from 'reactflow';

import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import AddRepoDialog, { type AddRepoResult } from './components/AddRepoDialog';
import RepoSelectDialog from './components/RepoSelectDialog';
import ChatCodeView from './components/ChatCodeView';
import EraserEditor from './components/eraser/EraserEditor';
import StatusBar from './components/StatusBar';
import Beams from './components/Beams';
import LandingPage from './components/LandingPage';
import AIDiagramView from './components/AIDiagramView';
import DeepResearchView from './components/DeepResearchView';

import { useWorkspace } from './hooks/useWorkspace';
import { useGraph } from './hooks/useGraph';
import { useSSE } from './hooks/useSSE';
import { api } from './api/client';

// ---------------------------------------------------------------------------
// View mode
// ---------------------------------------------------------------------------

type ViewMode = 'dashboard' | 'editor' | 'chatcode' | 'ai-diagram' | 'deep-research';

// ---------------------------------------------------------------------------
// Root App — combines sidebar + main panel
// ---------------------------------------------------------------------------

const App: FC = () => {
  const workspace = useWorkspace();
  const graph = useGraph();
  const sse = useSSE();

  const [showLanding, setShowLanding] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const [view, setView] = useState<ViewMode>('dashboard');
  const [viewAnim, setViewAnim] = useState<'in' | 'out' | 'idle'>('idle');
  const pendingView = useRef<ViewMode | null>(null);

  const transitionTo = useCallback((next: ViewMode) => {
    if (next === view) return;
    setViewAnim('out');
    pendingView.current = next;
    setTimeout(() => {
      setView(next);
      setViewAnim('in');
      setTimeout(() => setViewAnim('idle'), 350);
    }, 250);
  }, [view]);
  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const [repoSelectOpen, setRepoSelectOpen] = useState(false);
  const [addRepoFromChat, setAddRepoFromChat] = useState(false);
  const [aiDiagramRepoSelectOpen, setAiDiagramRepoSelectOpen] = useState(false);
  const [aiDiagramRepoPath, setAiDiagramRepoPath] = useState('');
  const [aiDiagramRepoName, setAiDiagramRepoName] = useState('');
  const [blankFileRepoSelectOpen, setBlankFileRepoSelectOpen] = useState(false);
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);
  const [deepResearchRepoPath, setDeepResearchRepoPath] = useState('');
  const [deepResearchRepoName, setDeepResearchRepoName] = useState('');
  const [deepResearchGithubUrl, setDeepResearchGithubUrl] = useState('');
  const [savedDeepResearchData, setSavedDeepResearchData] = useState<import('./types/workspace').SavedDiagram['deepResearchData'] | null>(null);  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);

  // Auto-dismiss success notification after 5 seconds
  // (using a ref so the effect doesn't need scanSuccess in deps)
  const successTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);
  if (scanSuccess && !successTimerRef[0]) {
    successTimerRef[0] = setTimeout(() => {
      setScanSuccess(null);
      successTimerRef[0] = null;
    }, 5000);
  }
  if (!scanSuccess && successTimerRef[0]) {
    clearTimeout(successTimerRef[0]);
    successTimerRef[0] = null;
  }

  // ---- Add repo handler (GitHub clone or local path) -----------------------
  const handleAddRepo = useCallback(
    async (result: AddRepoResult) => {
      setIsScanning(true);
      setScanError(null);
      try {
        if (result.source === 'github') {
          // Clone from GitHub → backend handles git clone + scan
          const data = await api.cloneRepo(result.path);
          const entry = workspace.addRepo(data.name || result.name, data.local_path, result.path);
          workspace.markRepoReady(entry.id, data.symbol_count);
          setScanSuccess(`Repository "${data.name || result.name}" cloned & scanned — ${data.symbol_count ?? 0} symbols indexed`);
        } else {
          // Local path → scan only
          const entry = workspace.addRepo(result.name, result.path);
          const data = await api.scanRepo(result.path);
          workspace.markRepoReady(entry.id, data.symbol_count);
          setScanSuccess(`Repository "${result.name}" scanned — ${data.symbol_count ?? 0} symbols indexed`);
        }
        // Auto-navigate to Eraser-style editor after successful clone+scan
        graph.clearAll();
        if (addRepoFromChat) {
          transitionTo('chatcode');
          setAddRepoFromChat(false);
        } else {
          transitionTo('editor');
        }
        setIsScanning(false);
        setAddRepoOpen(false);
      } catch (err) {
        console.error('Add repo error:', err);
        const msg = err instanceof Error ? err.message : String(err);
        setScanError(msg || 'An unknown error occurred. Is the Codrix server running?');
        setIsScanning(false);
        // Do NOT close the dialog — keep it open so user sees the error
      }
    },
    [workspace, graph, transitionTo],
  );

  // ---- Open diagram handler (go to editor view) --------------------------
  const handleOpenDiagram = useCallback(
    (diagramId: string) => {
      const diagram = workspace.diagrams.find((d) => d.id === diagramId);
      if (!diagram) return;

      // Deep Research entries re-open in the DeepResearchView
      if (diagram.deepResearch && diagram.deepResearchData) {
        const repo = workspace.repos.find((r) => r.id === diagram.repoId);
        setDeepResearchRepoPath(repo?.path ?? '');
        setDeepResearchRepoName(repo?.name ?? diagram.name);
        setDeepResearchGithubUrl(repo?.githubUrl ?? '');
        setSavedDeepResearchData(diagram.deepResearchData);
        workspace.setActiveDiagram(diagramId);
        workspace.touchDiagram(diagramId);
        transitionTo('deep-research');
        return;
      }

      if (diagram.nodes && diagram.edges) {
        const nodes = diagram.nodes as RFNode[];
        const edges = diagram.edges as RFEdge[];
        graph.restoreSnapshot(nodes, edges);
      } else {
        graph.clearAll();
      }
      workspace.setActiveDiagram(diagramId);
      workspace.touchDiagram(diagramId);
      transitionTo('editor');
    },
    [workspace, graph, transitionTo],
  );

  // ---- New blank diagram → open repo selector with deep research option ----
  const handleNewBlank = useCallback(() => {
    setDeepResearchEnabled(false);
    setBlankFileRepoSelectOpen(true);
  }, []);

  // ---- Blank file: repo selected (with or without deep research) ----------
  const handleBlankRepoSelected = useCallback(
    (repo: import('./types/workspace').RepoEntry) => {
      setBlankFileRepoSelectOpen(false);
      if (deepResearchEnabled) {
        setDeepResearchRepoPath(repo.path);
        setDeepResearchRepoName(repo.name);
        setDeepResearchGithubUrl(repo.githubUrl || '');
        setSavedDeepResearchData(null);
        transitionTo('deep-research');
      } else {
        graph.clearAll();
        transitionTo('editor');
      }
    },
    [deepResearchEnabled, graph, transitionTo],
  );

  // ---- Blank file: skip repo (no deep research) --------------------------
  const handleBlankSkipRepo = useCallback(() => {
    setBlankFileRepoSelectOpen(false);
    graph.clearAll();
    transitionTo('editor');
  }, [graph, transitionTo]);

  // ---- AI diagram → open repo selector popup ----------------------------
  const handleAIDiagram = useCallback(() => {
    setAiDiagramRepoSelectOpen(true);
  }, []);

  // ---- AI diagram repo selected → go to ai-diagram view ----------------
  const handleAiDiagramRepoSelected = useCallback(
    (repo: import('./types/workspace').RepoEntry) => {
      setAiDiagramRepoPath(repo.path);
      setAiDiagramRepoName(repo.name);
      setAiDiagramRepoSelectOpen(false);
      transitionTo('ai-diagram');
    },
    [transitionTo],
  );

  // ---- AI diagram without repo → go to ai-diagram view -----------------
  const handleAiDiagramSkipRepo = useCallback(() => {
    setAiDiagramRepoPath('');
    setAiDiagramRepoName('');
    setAiDiagramRepoSelectOpen(false);
    transitionTo('ai-diagram');
  }, [transitionTo]);

  // ---- ChatCode → open repo selector popup ------------------------------
  const handleChatCode = useCallback(() => {
    setRepoSelectOpen(true);
  }, []);

  // ---- Repo selected from ChatCode popup → go to chat view --------------
  const handleChatRepoSelected = useCallback(
    (repo: import('./types/workspace').RepoEntry) => {
      workspace.setActiveRepo(repo.id);
      setRepoSelectOpen(false);
      transitionTo('chatcode');
    },
    [workspace, transitionTo],
  );

  // ---- Add repo from ChatCode popup → open AddRepo dialog ---------------
  const handleAddRepoFromChat = useCallback(() => {
    setRepoSelectOpen(false);
    setAddRepoFromChat(true);
    setAddRepoOpen(true);
  }, []);

  // ---- Save diagram from export -----------------------------------------
  const handleExportSave = useCallback(
    (tool: string, query: string, nodes: unknown[], edges: unknown[]) => {
      if (!workspace.activeRepo) return;
      workspace.saveDiagram(
        workspace.activeRepo.id,
        workspace.activeRepo.name,
        tool,
        query,
        nodes,
        edges,
      );
    },
    [workspace],
  );

  // ---- Back to dashboard when clicking a repo in sidebar ----------------
  const handleSelectRepo = useCallback(
    (id: string) => {
      workspace.setActiveRepo(id);
      transitionTo('dashboard');
    },
    [workspace, transitionTo],
  );

  const handleLandingExit = useCallback(() => {
    setShowLanding(false);
    setAppReady(true);
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
        {showLanding && <LandingPage onEnter={handleLandingExit} />}
        <div className={`relative flex h-screen w-screen text-gray-100 overflow-hidden ${appReady ? 'animate-appFadeIn' : showLanding ? 'opacity-0' : ''}`}>
          {/* ── Animated beams background ──────────────── */}
          <div className="pointer-events-none absolute inset-0 z-0">
            <Beams beamWidth={3} beamHeight={30} beamNumber={20} speed={2} noiseIntensity={1.75} scale={0.2} rotation={30} />
            {/* Dim overlay to keep text readable */}
            <div className="absolute inset-0 bg-black/50" />
          </div>
          {/* ── Sidebar ────────────────────────────────────── */}
          <Sidebar
            repos={workspace.repos}
            activeRepoId={workspace.activeRepo?.id ?? null}
            onSelectRepo={handleSelectRepo}
            onRemoveRepo={workspace.removeRepo}
            onAddRepo={() => setAddRepoOpen(true)}
          />

          {/* ── Main area ──────────────────────────────────── */}
          <div className={`relative z-10 flex flex-1 flex-col overflow-hidden transition-opacity duration-250 ${
              viewAnim === 'out' ? 'opacity-0' : viewAnim === 'in' ? 'animate-fade-in' : ''
            }`}>
            {view === 'dashboard' ? (
              <>
                <Dashboard
                  activeRepo={workspace.activeRepo}
                  repos={workspace.repos}
                  diagrams={workspace.diagrams}
                  onNewBlankDiagram={handleNewBlank}
                  onAIDiagram={handleAIDiagram}
                  onChatCode={handleChatCode}
                  onOpenDiagram={handleOpenDiagram}
                  onRemoveDiagram={workspace.removeDiagram}
                  onSelectRepo={handleSelectRepo}
                />
                <StatusBar
                  nodeCount={graph.nodes.length}
                  edgeCount={graph.edges.length}
                  isConnected={sse.isConnected}
                  toolProgress={sse.toolProgress}
                />
              </>
            ) : view === 'editor' ? (
              <EraserEditor
                repoName={workspace.activeRepo?.name ?? 'Untitled'}
                repoPath={workspace.activeRepo?.path ?? ''}
                graph={graph}
                sse={sse}
                onBack={() => transitionTo('dashboard')}
                onExportSave={handleExportSave}
              />
            ) : view === 'chatcode' ? (
              <ChatCodeView
                repoName={workspace.activeRepo?.name ?? 'Untitled'}
                repoPath={workspace.activeRepo?.path ?? ''}
                onBack={() => transitionTo('dashboard')}
              />
            ) : view === 'deep-research' ? (
              <DeepResearchView
                repoName={deepResearchRepoName || 'Repository'}
                repoPath={deepResearchRepoPath}
                githubUrl={deepResearchGithubUrl}
                initialData={savedDeepResearchData ?? undefined}
                onBack={() => transitionTo('dashboard')}
                onSaveResearch={(data) => {
                  const repoId = workspace.repos.find(r => r.path === deepResearchRepoPath)?.id;
                  if (repoId) {
                    workspace.saveDiagram(
                      repoId,
                      `Deep Research — ${deepResearchRepoName || 'Repository'}`,
                      'deep-research',
                      `Deep Research analysis of ${deepResearchRepoName}`,
                      data.archNodes,
                      data.archEdges,
                      true,
                      {
                        report: data.report,
                        sequenceSpec: data.sequenceSpec,
                        erSpec: data.erSpec,
                        archSpec: data.archSpec,
                      },
                    );
                  }
                }}
                onExportSave={(tool, query, nodes, edges) => {
                  const repoId = workspace.repos.find(r => r.path === deepResearchRepoPath)?.id;
                  if (repoId) {
                    workspace.saveDiagram(repoId, deepResearchRepoName || 'Deep Research', tool, query, nodes, edges, true);
                  }
                }}
              />
            ) : (
              <AIDiagramView
                repoName={aiDiagramRepoName || 'No Repository'}
                repoPath={aiDiagramRepoPath}
                onBack={() => transitionTo('dashboard')}
                onExportSave={(tool, query, nodes, edges) => {
                  const repoId = workspace.repos.find(r => r.path === aiDiagramRepoPath)?.id;
                  if (repoId) {
                    workspace.saveDiagram(repoId, aiDiagramRepoName || 'AI Diagram', tool, query, nodes, edges);
                  }
                }}
              />
            )}
          </div>

          {/* ── Success notification ──────────────────────── */}
          {scanSuccess && (
            <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-3 rounded-lg border border-emerald-700 bg-emerald-900/90 px-4 py-3 text-sm text-emerald-200 shadow-2xl backdrop-blur animate-in slide-in-from-bottom-4">
              <span className="text-emerald-400">✓</span>
              <span>{scanSuccess}</span>
              <button
                onClick={() => setScanSuccess(null)}
                className="ml-2 rounded px-1.5 py-0.5 text-emerald-400 hover:bg-emerald-800"
              >
                ✕
              </button>
            </div>
          )}

          {/* ── Add repo dialog ────────────────────────────── */}
          <AddRepoDialog
            open={addRepoOpen}
            onClose={() => { setAddRepoOpen(false); setScanError(null); setAddRepoFromChat(false); }}
            onSubmit={handleAddRepo}
            isScanning={isScanning}
            error={scanError}
            onClearError={() => setScanError(null)}
          />

          {/* ── Repo select dialog for ChatCode ────────────── */}
          <RepoSelectDialog
            open={repoSelectOpen}
            onClose={() => setRepoSelectOpen(false)}
            repos={workspace.repos.filter((r) => r.ready)}
            onSelectRepo={handleChatRepoSelected}
            onAddRepo={handleAddRepoFromChat}
          />

          {/* ── Repo select dialog for AI Diagram ──────────── */}
          <RepoSelectDialog
            open={aiDiagramRepoSelectOpen}
            onClose={() => setAiDiagramRepoSelectOpen(false)}
            repos={workspace.repos.filter((r) => r.ready)}
            onSelectRepo={handleAiDiagramRepoSelected}
            onAddRepo={() => {
              setAiDiagramRepoSelectOpen(false);
              setAddRepoOpen(true);
            }}
            title="AI Diagram — Select Repository"
            description="Pick a repository for context, or generate a diagram without one."
            icon="lucide:sparkles"
            iconColor="text-purple-400"
            onSkipRepo={handleAiDiagramSkipRepo}
            skipLabel="Generate without repository"
          />

          {/* ── Repo select dialog for Blank File (with Deep Research) ── */}
          <RepoSelectDialog
            open={blankFileRepoSelectOpen}
            onClose={() => setBlankFileRepoSelectOpen(false)}
            repos={workspace.repos.filter((r) => r.ready)}
            onSelectRepo={handleBlankRepoSelected}
            onAddRepo={() => {
              setBlankFileRepoSelectOpen(false);
              setAddRepoOpen(true);
            }}
            title="Create a Blank File"
            description="Select a repository for context, or start with a blank canvas."
            icon="lucide:plus"
            iconColor="text-blue-400"
            onSkipRepo={handleBlankSkipRepo}
            skipLabel="Start without repository"
            showDeepResearch
            deepResearchChecked={deepResearchEnabled}
            onDeepResearchChange={setDeepResearchEnabled}
          />
        </div>
    </TooltipProvider>
  );
};

export default App;
