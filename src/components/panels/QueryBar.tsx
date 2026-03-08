// ---------------------------------------------------------------------------
// panels/QueryBar.tsx — Tool-selector bar + input for contextplus tools
// Smart routing: Ask AI uses RAG, call-chain renders diagrams, others → text
// ---------------------------------------------------------------------------

import { useCallback, useState, type FC, type FormEvent } from 'react';
import { Icon } from '@iconify/react';
import { api } from '../../api/client';
import { TOOLS, type ToolType, type CallChainResponse, type TextResult } from '../../types/graph';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type QueryResult =
  | { kind: 'call_chain'; data: CallChainResponse }
  | { kind: 'text'; tool: ToolType; data: TextResult }
  | { kind: 'rag_answer'; data: { answer: string } };

interface QueryBarProps {
  onResult: (result: QueryResult) => void;
  isRunning?: boolean;
  /** Absolute path of the active repo — scopes tools to this directory. */
  repoPath?: string;
}

const QueryBar: FC<QueryBarProps> = ({ onResult, isRunning, repoPath }) => {
  const [input, setInput] = useState('');
  const [activeTool, setActiveTool] = useState<ToolType>('ask-ai');
  const [submitting, setSubmitting] = useState(false);

  const currentTool = TOOLS.find((t) => t.key === activeTool) ?? TOOLS[0];

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const q = input.trim();
      if (currentTool.requiresInput && !q) return;
      if (submitting) return;

      setSubmitting(true);
      try {
        switch (activeTool) {
          case 'ask-ai': {
            const data = await api.ragQuery(q, repoPath);
            onResult({ kind: 'rag_answer', data });
            break;
          }
          case 'call-chain': {
            const data = await api.callChain(q);
            onResult({ kind: 'call_chain', data });
            break;
          }
          case 'search': {
            const data = await api.search(q);
            onResult({ kind: 'text', tool: 'search', data });
            break;
          }
          case 'context-tree': {
            const data = await api.contextTree(q || repoPath || undefined);
            onResult({ kind: 'text', tool: 'context-tree', data });
            break;
          }
          case 'skeleton': {
            const data = await api.skeleton(q);
            onResult({ kind: 'text', tool: 'skeleton', data });
            break;
          }
          case 'blast-radius': {
            const data = await api.blastRadius(q);
            onResult({ kind: 'text', tool: 'blast-radius', data });
            break;
          }
          case 'identifier-search': {
            const data = await api.identifierSearch(q);
            onResult({ kind: 'text', tool: 'identifier-search', data });
            break;
          }
          case 'static-analysis': {
            const data = await api.staticAnalysis(q || repoPath || undefined);
            onResult({ kind: 'text', tool: 'static-analysis', data });
            break;
          }
        }
      } catch (err) {
        console.error('Tool error:', err);
      } finally {
        setSubmitting(false);
      }
    },
    [input, activeTool, submitting, onResult, currentTool.requiresInput, repoPath],
  );

  const busy = submitting || !!isRunning;

  return (
    <div className="border-b border-white/[0.08] bg-black/30 backdrop-blur-xl px-4 py-2">
      {/* Tool selector chips */}
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {TOOLS.map((t) => (
          <Badge
            key={t.key}
            variant={activeTool === t.key ? 'default' : 'outline'}
            className={`cursor-pointer text-[11px] transition-colors ${
              activeTool === t.key
                ? t.key === 'ask-ai'
                  ? 'bg-purple-600 text-white hover:bg-purple-500'
                  : 'bg-blue-600 text-white hover:bg-blue-500'
                : 'text-gray-400 hover:border-blue-500 hover:text-blue-300'
            }`}
            onClick={() => setActiveTool(t.key)}
          >
            {t.key === 'ask-ai' && <Icon icon="lucide:sparkles" className="mr-1 h-3 w-3" />}
            {t.label}
          </Badge>
        ))}
      </div>

      {/* Input + submit */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Input
          id="vyuha-query-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={currentTool.placeholder}
          className="flex-1 bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus-visible:ring-blue-500"
          disabled={busy}
        />
        <Button
          type="submit"
          disabled={busy || (currentTool.requiresInput && !input.trim())}
          size="sm"
          className={activeTool === 'ask-ai' ? 'bg-purple-600 hover:bg-purple-500' : undefined}
        >
          {busy ? (
            <span className="flex items-center gap-1">
              <Icon icon="lucide:loader-2" className="h-3 w-3 animate-spin" />
              {activeTool === 'ask-ai' ? 'Thinking…' : 'Running…'}
            </span>
          ) : activeTool === 'ask-ai' ? (
            <span className="flex items-center gap-1">
              <Icon icon="lucide:sparkles" className="h-3 w-3" />
              Ask
            </span>
          ) : (
            'Run'
          )}
        </Button>
      </form>
    </div>
  );
};

export default QueryBar;
