// ---------------------------------------------------------------------------
// components/Dashboard.tsx — Main panel: action cards + saved diagrams table
// Mirrors the eraser.io dashboard style.
// ---------------------------------------------------------------------------

import { memo, useState, useMemo, useRef, useEffect, useCallback, type FC } from 'react';
import { Icon } from '@iconify/react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { RepoEntry, SavedDiagram } from '../types/workspace';

// ---------------------------------------------------------------------------
// Action cards shown at the top
// ---------------------------------------------------------------------------

interface ActionCardProps {
  icon: string;
  label: string;
  onClick: () => void;
}

const ActionCard: FC<ActionCardProps> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="group flex flex-1 flex-col items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl px-6 py-6 text-sm text-gray-300 transition-all duration-200 ease-out hover:border-violet-400/30 hover:bg-white/[0.08] hover:text-gray-100 hover:shadow-xl hover:shadow-violet-500/5 hover:-translate-y-0.5 active:scale-[0.97] active:shadow-inner"
  >
    <Icon
      icon={icon}
      width={28}
      className="text-gray-500 transition-all duration-200 group-hover:text-blue-400 group-hover:scale-110"
    />
    <span className="font-medium">{label}</span>
  </button>
);

// ---------------------------------------------------------------------------
// Column header for the diagram table
// ---------------------------------------------------------------------------

const COLUMNS = [
  { key: 'name',      label: 'NAME',      flex: '2' },
  { key: 'tool',      label: 'TOOL',      flex: '1' },
  { key: 'created',   label: 'CREATED',   flex: '1' },
  { key: 'edited',    label: 'EDITED',    flex: '1' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toolLabel(tool: string): string {
  return tool
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DashboardProps {
  activeRepo: RepoEntry | null;
  repos: RepoEntry[];
  diagrams: SavedDiagram[];
  onNewBlankDiagram: () => void;
  onAIDiagram: () => void;
  onChatCode: () => void;
  onOpenDiagram: (id: string) => void;
  onRemoveDiagram: (id: string) => void;
  onSelectRepo: (id: string) => void;
}

const Dashboard: FC<DashboardProps> = ({
  activeRepo,
  repos,
  diagrams,
  onNewBlankDiagram,
  onAIDiagram,
  onChatCode,
  onOpenDiagram,
  onRemoveDiagram,
  onSelectRepo,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchClosing, setSearchClosing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Right-click context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; diagramId: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [ctxMenu]);

  const closeSearch = useCallback(() => {
    setSearchClosing(true);
    setTimeout(() => { setSearchOpen(false); setSearchClosing(false); }, 200);
  }, []);

  // Filter repos by search query
  const filteredRepos = useMemo(
    () =>
      repos.filter((r) =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [repos, searchQuery],
  );

  // Focus input when popup opens
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Close on Escape
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen, closeSearch]);
  // Only diagrams for the active repo
  const repoDiagrams = activeRepo
    ? diagrams.filter((d) => d.repoId === activeRepo.id)
    : [];

  return (
    <div className="flex h-full flex-col bg-transparent">
      {/* ── Top bar (tabs / search) ──────────────────────────── */}
      <div className="flex items-center gap-6 rounded-tr-2xl border-b border-white/[0.08] px-6 py-3">
        <span className="text-sm font-semibold text-gray-200">All</span>
        <span className="text-sm text-gray-500 hover:text-gray-300 cursor-pointer">Recents</span>
        <span className="text-sm text-gray-500 hover:text-gray-300 cursor-pointer">Created by Me</span>
        <span className="text-sm text-gray-500 hover:text-gray-300 cursor-pointer">Unsorted</span>
        <div className="flex-1" />
        <button
          onClick={() => { setSearchOpen(true); setSearchQuery(''); }}
          className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-white/[0.08] hover:text-gray-300"
        >
          <Icon icon="lucide:search" width={14} />
          <span>Search</span>
          <kbd className="ml-4 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500">
            /
          </kbd>
        </button>
      </div>

      {/* ── Search popup overlay ──────────────────────────────── */}
      {searchOpen && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${searchClosing ? 'opacity-0' : 'opacity-100'}`} onClick={closeSearch}>
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-lg rounded-xl border-2 border-dashed border-white/[0.15] bg-black/60 backdrop-blur-2xl p-4 shadow-2xl shadow-black/40 transition-all duration-200 ${searchClosing ? 'scale-95 opacity-0' : 'animate-in fade-in zoom-in-95'}`}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-white/[0.08] pb-3">
              <Icon icon="lucide:search" width={16} className="text-gray-500" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search repositories…"
                className="flex-1 bg-transparent text-sm text-gray-100 placeholder:text-gray-600 outline-none"
              />
              <button
                onClick={closeSearch}
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-gray-400 transition-colors hover:bg-white/[0.08] hover:text-gray-200"
              >
                Cancel
              </button>
            </div>

            {/* Results */}
            <div className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto">
              {filteredRepos.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-600">
                  {repos.length === 0 ? 'No repositories scanned yet.' : 'No matching repositories.'}
                </p>
              ) : (
                filteredRepos.map((repo) => (
                  <button
                    key={repo.id}
                    onClick={() => { onSelectRepo(repo.id); closeSearch(); }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06] ${
                      repo.id === activeRepo?.id ? 'bg-white/[0.04]' : ''
                    }`}
                  >
                    <Icon icon="lucide:folder-git-2" width={16} className={repo.id === activeRepo?.id ? 'text-blue-400' : 'text-gray-500'} />
                    <div className="flex-1 min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-200">{repo.name}</span>
                      <span className="block truncate text-[11px] text-gray-600">{repo.path}</span>
                    </div>
                    {repo.id === activeRepo?.id && (
                      <span className="text-[10px] text-blue-400">Active</span>
                    )}
                    <span className={`h-2 w-2 rounded-full ${repo.ready ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Action cards ─────────────────────────────────────── */}
      <div className="flex gap-4 px-6 py-6 w-full">
        <ActionCard icon="lucide:plus" label="Create a Blank File" onClick={onNewBlankDiagram} />
        <ActionCard icon="lucide:sparkles" label="Generate an AI Diagram" onClick={onAIDiagram} />
        <ActionCard icon="lucide:message-square-code" label="ChatCode" onClick={onChatCode} />
      </div>

      {/* ── Active repo indicator ────────────────────────────── */}
      {activeRepo && (
        <div className="mx-6 mb-3 flex items-center gap-2 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.04] backdrop-blur-xl px-4 py-2">
          <span className={`h-2 w-2 rounded-full ${activeRepo.ready ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
          <span className="text-[13px] font-medium text-gray-300">{activeRepo.name}</span>
          <span className="text-[11px] text-gray-600">{activeRepo.path}</span>
          {activeRepo.ready && activeRepo.symbolCount != null && (
            <span className="ml-auto text-[11px] text-gray-500">
              {activeRepo.symbolCount} symbols indexed
            </span>
          )}
          {!activeRepo.ready && (
            <span className="ml-auto text-[11px] text-amber-400 animate-pulse">
              Scanning…
            </span>
          )}
        </div>
      )}

      {/* ── Diagram table ────────────────────────────────────── */}
      <div className="mx-6 mb-3 flex flex-1 flex-col overflow-hidden rounded-xl border border-dashed border-white/[0.12]">
        <div className="flex items-center gap-4 px-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {COLUMNS.map((col) => (
            <span key={col.key} style={{ flex: col.flex }}>
              {col.label}
            </span>
          ))}
          <span className="w-8" /> {/* actions col */}
        </div>

        <ScrollArea className="flex-1 px-6">
        {repoDiagrams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-xl border-2 border-dashed border-white/[0.12] bg-white/[0.04] backdrop-blur-xl px-8 py-3">
              <p className="text-sm text-gray-500">
                {activeRepo
                  ? 'No diagrams yet — create one above.'
                  : 'Select a repository from the sidebar to get started.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {repoDiagrams.map((d) => (
              <div
                key={d.id}
                onClick={() => onOpenDiagram(d.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, diagramId: d.id });
                }}
                className="group flex cursor-pointer items-center gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-gray-800/40"
              >
                {/* Name */}
                <span className="flex-[2] truncate text-[13px] font-medium text-gray-200 flex items-center gap-2">
                  {d.deepResearch && (
                    <span title="Deep Research">
                      <Icon icon="lucide:scan-search" width={14} className="shrink-0 text-purple-400" />
                    </span>
                  )}
                  {d.name}
                </span>
                {/* Tool */}
                <span className="flex-[1] truncate text-[12px] text-gray-500">
                  {toolLabel(d.tool)}
                </span>
                {/* Created */}
                <span className="flex-[1] text-[12px] text-gray-600">
                  {formatDateTime(d.createdAt)}
                </span>
                {/* Edited */}
                <span className="flex-[1] text-[12px] text-gray-600">
                  {formatDateTime(d.editedAt)}
                </span>
                {/* Actions */}
                <div className="flex w-8 items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button className="rounded p-1 text-gray-600 hover:bg-gray-700 hover:text-gray-300">
                    <Icon icon="lucide:more-horizontal" width={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      </div>

      {/* ── Right-click context menu ──────────────────────────── */}
      {ctxMenu && (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg border border-white/[0.1] bg-gray-900/95 backdrop-blur-xl py-1 shadow-xl shadow-black/40"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDeleteId(ctxMenu.diagramId);
              setCtxMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-red-400 transition-colors hover:bg-red-500/10"
          >
            <Icon icon="lucide:trash-2" width={14} />
            Delete
          </button>
        </div>
      )}

      {/* ── Delete confirmation dialog ───────────────────────── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-xl border border-white/[0.1] bg-gray-900/95 backdrop-blur-2xl p-5 shadow-2xl shadow-black/40">
            <p className="text-sm text-gray-200 mb-4">Delete this diagram? This cannot be undone.</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-white/[0.08]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onRemoveDiagram(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(Dashboard);
