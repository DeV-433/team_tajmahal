// ---------------------------------------------------------------------------
// components/RepoSelectDialog.tsx — Popup to select a scanned repo or add new
// ---------------------------------------------------------------------------

import { useState, useMemo, type FC, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Icon } from '@iconify/react';
import type { RepoEntry } from '../types/workspace';
import AuroraText from './ui/aurora-text';

interface RepoSelectDialogProps {
  open: boolean;
  onClose: () => void;
  repos: RepoEntry[];
  onSelectRepo: (repo: RepoEntry) => void;
  onAddRepo: () => void;
  title?: string;
  description?: string;
  icon?: string;
  iconColor?: string;
  onSkipRepo?: () => void;
  skipLabel?: string;
  /** Show a Deep Research toggle checkbox */
  showDeepResearch?: boolean;
  deepResearchChecked?: boolean;
  onDeepResearchChange?: (checked: boolean) => void;
}

const RepoSelectDialog: FC<RepoSelectDialogProps> = ({
  open,
  onClose,
  repos,
  onSelectRepo,
  onAddRepo,
  title,
  description,
  icon,
  iconColor,
  onSkipRepo,
  skipLabel,
  showDeepResearch,
  deepResearchChecked,
  onDeepResearchChange,
}) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return repos;
    const q = search.toLowerCase();
    return repos.filter(
      (r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q),
    );
  }, [repos, search]);

  const handleSelect = useCallback(
    (repo: RepoEntry) => {
      setSearch('');
      onSelectRepo(repo);
    },
    [onSelectRepo],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md border-white/[0.08] bg-gray-950/80 backdrop-blur-2xl text-gray-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-100">
            <Icon icon={icon || "lucide:message-square-code"} width={20} className={iconColor || "text-violet-400"} />
            {title || 'ChatCode — Select Repository'}
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            {description || 'Pick a scanned repository to chat with, or add a new one.'}
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Icon
            icon="lucide:search"
            width={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter repositories…"
            className="bg-white/[0.04] backdrop-blur-xl border-white/[0.08] pl-9 text-gray-100 placeholder:text-gray-600 focus-visible:ring-violet-500"
            autoFocus
          />
        </div>

        {/* Repo list */}
        <ScrollArea className="max-h-64">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-sm text-gray-500">
              {repos.length === 0
                ? 'No repositories scanned yet.'
                : 'No matching repositories.'}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => handleSelect(repo)}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left backdrop-blur-xl transition-all duration-150 hover:bg-white/[0.06] hover:shadow-md hover:shadow-violet-500/5"
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      repo.ready ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-200 group-hover:text-violet-300">
                      {repo.name}
                    </div>
                    <div className="truncate text-[11px] text-gray-600">{repo.path}</div>
                  </div>
                  {repo.ready && repo.symbolCount != null && (
                    <span className="shrink-0 text-[10px] text-gray-600">
                      {repo.symbolCount} symbols
                    </span>
                  )}
                  <Icon
                    icon="lucide:chevron-right"
                    width={14}
                    className="shrink-0 text-gray-700 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-400"
                  />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Deep Research toggle + Skip repo / Add new repo buttons */}
        <div className="border-t border-gray-800 pt-3 flex flex-col gap-1">
          {showDeepResearch && (
            <button
              type="button"
              onClick={() => onDeepResearchChange?.(!deepResearchChecked)}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200 ${
                deepResearchChecked
                  ? 'border border-purple-500/30 bg-purple-500/10 shadow-md shadow-purple-500/10'
                  : 'border border-transparent hover:bg-white/[0.04]'
              }`}
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
                  deepResearchChecked
                    ? 'border-purple-400 bg-purple-500/30'
                    : 'border-gray-600 bg-white/[0.04]'
                }`}
              >
                {deepResearchChecked && (
                  <Icon icon="lucide:check" width={12} className="text-purple-300" />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Icon icon="lucide:scan-search" width={16} className="text-purple-400" />
                <AuroraText className="text-base font-bold">Deep Research</AuroraText>
              </div>
              <span className="ml-auto text-[10px] text-gray-600">5–20 min</span>
            </button>
          )}
          {onSkipRepo && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('');
                onSkipRepo();
              }}
              className="w-full justify-start gap-2 text-gray-400 hover:text-purple-300 hover:bg-purple-500/10"
            >
              <Icon icon="lucide:zap" width={16} />
              {skipLabel || 'Continue without repository'}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              onAddRepo();
            }}
            className="w-full justify-start gap-2 text-gray-400 hover:text-violet-300 hover:bg-violet-500/10"
          >
            <Icon icon="lucide:plus-circle" width={16} />
            Add a new repository
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RepoSelectDialog;
