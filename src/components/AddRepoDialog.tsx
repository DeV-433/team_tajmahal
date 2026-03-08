// ---------------------------------------------------------------------------
// components/AddRepoDialog.tsx — Modal to add a repo (GitHub URL or local path)
// ---------------------------------------------------------------------------

import { useCallback, useState, useMemo, type FC, type FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Icon } from '@iconify/react';

/** Matches GitHub HTTPS URLs like https://github.com/owner/repo(.git) */
const GITHUB_URL_RE = /^https?:\/\/github\.com\/[\w.\-]+\/[\w.\-]+(?:\.git)?\/?$/;

/**
 * Result of the "add repo" operation.
 * - For GitHub clone: returns the cloned local_path + derived name + scan info.
 * - For local path: returns path + user-given name (scan happens via existing flow).
 */
export interface AddRepoResult {
  /** 'github' or 'local' */
  source: 'github' | 'local';
  /** Repo display name */
  name: string;
  /** Absolute local path (after cloning or user-supplied) */
  path: string;
  /** Symbol count from scan (if available) */
  symbolCount?: number;
}

interface AddRepoDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called when the repo is ready (cloned + scanned, or local path submitted). */
  onSubmit: (result: AddRepoResult) => void;
  isScanning: boolean;
  /** Error message from last scan attempt (null = no error). */
  error?: string | null;
  /** Clear persisted error (e.g. when user starts editing). */
  onClearError?: () => void;
}

const AddRepoDialog: FC<AddRepoDialogProps> = ({
  open,
  onClose,
  onSubmit,
  isScanning,
  error,
  onClearError,
}) => {
  const [input, setInput] = useState('');
  const [name, setName] = useState('');

  const isGithubUrl = useMemo(() => GITHUB_URL_RE.test(input.trim()), [input]);

  /** Derive display name from URL or path */
  const derivedName = useMemo(() => {
    if (name) return name;
    const trimmed = input.trim();
    if (isGithubUrl) {
      // https://github.com/owner/repo(.git) → repo
      const parts = trimmed.replace(/\.git\/?$/, '').split('/');
      return parts[parts.length - 1] ?? '';
    }
    // Local path → last segment
    const parts = trimmed.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts[parts.length - 1] ?? '';
  }, [input, name, isGithubUrl]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed) return;

      const displayName = derivedName.trim() || 'Untitled';

      if (isGithubUrl) {
        onSubmit({ source: 'github', name: displayName, path: trimmed });
      } else {
        onSubmit({ source: 'local', name: displayName, path: trimmed });
      }
    },
    [input, derivedName, isGithubUrl, onSubmit],
  );

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && !isScanning) {
      setInput('');
      setName('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md border-white/[0.08] bg-gray-950/80 backdrop-blur-2xl text-gray-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-100">
            {isGithubUrl ? (
              <Icon icon="lucide:github" width={18} className="text-purple-400" />
            ) : (
              <Icon icon="lucide:folder-git-2" width={18} className="text-blue-400" />
            )}
            {isGithubUrl ? 'Clone from GitHub' : 'Add Repository'}
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            {isGithubUrl
              ? 'Codrix will clone the repository and build a semantic tree using contextplus.'
              : 'Paste a GitHub URL to clone, or enter a local path. Codrix builds a semantic tree so it\u2019s ready for queries.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="repo-input" className="text-gray-400 text-xs">
              GitHub URL or Local Path
            </Label>
            <Input
              id="repo-input"
              placeholder="https://github.com/owner/repo  or  C:\projects\my-repo"
              value={input}
              onChange={(e) => { setInput(e.target.value); onClearError?.(); }}
              disabled={isScanning}
              className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-600 focus-visible:ring-blue-500"
              autoFocus
            />
            {input.trim() && (
              <span className="text-[10px] text-gray-600">
                {isGithubUrl ? '🔗 GitHub URL detected — will clone' : '📁 Local path'}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="repo-name" className="text-gray-400 text-xs">
              Display Name <span className="text-gray-600">(optional)</span>
            </Label>
            <Input
              id="repo-name"
              placeholder={derivedName || 'my-repo'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isScanning}
              className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-600 focus-visible:ring-blue-500"
            />
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-700 bg-red-900/40 px-3 py-2.5 text-[12px] text-red-300">
              <span className="mt-0.5 shrink-0 text-red-400">⚠</span>
              <div className="min-w-0">
                <div className="font-medium text-red-200">Scan failed</div>
                <div className="mt-0.5 break-words text-red-400">{error}</div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isScanning}
              className="text-gray-400"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!input.trim() || isScanning}
              className={isGithubUrl
                ? 'bg-purple-600 text-white hover:bg-purple-500'
                : 'bg-blue-600 text-white hover:bg-blue-500'}
            >
              {isScanning ? (
                <span className="flex items-center gap-2">
                  <Icon icon="lucide:loader-2" width={14} className="animate-spin" />
                  {isGithubUrl ? 'Cloning…' : 'Scanning…'}
                </span>
              ) : isGithubUrl ? (
                <span className="flex items-center gap-2">
                  <Icon icon="lucide:github" width={14} />
                  Clone & Scan
                </span>
              ) : (
                'Scan Repository'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddRepoDialog;
