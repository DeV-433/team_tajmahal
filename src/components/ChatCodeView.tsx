// ---------------------------------------------------------------------------
// components/ChatCodeView.tsx — Full-page chat interface powered by RAG
// ---------------------------------------------------------------------------

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FC,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Icon } from '@iconify/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatCodeViewProps {
  repoName: string;
  repoPath: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Animated dot loader for "thinking"
// ---------------------------------------------------------------------------

const ThinkingDots: FC = () => (
  <div className="flex items-center gap-1 py-2">
    <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
    <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
    <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
  </div>
);

// ---------------------------------------------------------------------------
// Single chat bubble
// ---------------------------------------------------------------------------

interface BubbleProps {
  msg: ChatMessage;
  isNew: boolean;
}

const ChatBubble: FC<BubbleProps> = ({ msg, isNew }) => {
  const isUser = msg.role === 'user';

  return (
    <div
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} ${
        isNew ? 'animate-in fade-in slide-in-from-bottom-3 duration-400' : ''
      }`}
    >
      {/* AI avatar — left side */}
      {!isUser && (
        <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 shadow-lg shadow-violet-500/20">
            <Icon icon="lucide:bot" width={16} className="text-white" />
          </div>
          <span className="text-[9px] text-gray-600 font-medium">AI</span>
        </div>
      )}

      {/* Bubble */}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed backdrop-blur-xl transition-all ${
          isUser
            ? 'bg-violet-500/25 text-white rounded-br-md border border-violet-400/20 shadow-lg shadow-violet-500/10 whitespace-pre-wrap'
            : 'bg-white/[0.10] text-gray-200 rounded-bl-md border border-white/[0.10] shadow-lg shadow-black/10'
        }`}
      >
        {isUser ? msg.content : (
          <div className="prose prose-invert prose-sm max-w-none
            prose-p:text-gray-200 prose-p:leading-relaxed prose-p:my-1.5
            prose-strong:text-gray-100
            prose-li:text-gray-200 prose-li:my-0.5
            prose-ul:my-1.5 prose-ol:my-1.5
            prose-code:text-purple-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
            prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700 prose-pre:rounded-lg
            prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
            prose-headings:text-gray-100 prose-headings:my-2
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.content}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* User avatar — right side */}
      {isUser && (
        <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/20">
            <Icon icon="lucide:user" width={16} className="text-white" />
          </div>
          <span className="text-[9px] text-gray-600 font-medium">You</span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main ChatCode view
// ---------------------------------------------------------------------------

const ChatCodeView: FC<ChatCodeViewProps> = ({ repoName, repoPath, onBack }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [newMsgIds, setNewMsgIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Clear "new" animation flag after animation completes
  useEffect(() => {
    if (newMsgIds.size === 0) return;
    const timer = setTimeout(() => setNewMsgIds(new Set()), 500);
    return () => clearTimeout(timer);
  }, [newMsgIds]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setNewMsgIds(new Set([userMsg.id]));
    setInput('');
    setIsLoading(true);

    // Auto-resize textarea back to default
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const { answer } = await api.ragQuery(text, repoPath);
      const aiMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: answer,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setNewMsgIds(new Set([aiMsg.id]));
    } catch (err) {
      const errMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `Something went wrong: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
      setNewMsgIds(new Set([errMsg.id]));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, repoPath]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      handleSend();
    },
    [handleSend],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Auto-grow textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, []);

  return (
    <div className="flex h-full flex-col bg-transparent">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-4 border-b border-gray-800 px-6 py-3">
        <button
          onClick={onBack}
          className="rounded-lg p-1.5 text-gray-500 backdrop-blur-xl transition-colors hover:bg-white/[0.06] hover:text-gray-300"
        >
          <Icon icon="lucide:arrow-left" width={18} />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700 shadow-md">
            <Icon icon="lucide:message-square-code" width={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-100 tracking-wide">ChatCode</h1>
            <span className="text-[11px] text-gray-500">{repoName}</span>
          </div>
        </div>

        <div className="flex-1" />

        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] text-gray-500 backdrop-blur-xl transition-colors hover:bg-white/[0.06] hover:text-gray-300"
          >
            <Icon icon="lucide:trash-2" width={13} />
            Clear
          </button>
        )}
      </div>

      {/* ── Chat messages area ─────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
            <div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl p-10 flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600/10 to-indigo-700/10 backdrop-blur-xl border border-violet-400/20">
              <Icon icon="lucide:message-square-code" width={32} className="text-violet-400" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-200">Chat with your codebase</h2>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Ask anything about <span className="text-violet-400 font-medium">{repoName}</span> —
                architecture, functions, bugs, or how things connect.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {[
                'What does this project do?',
                'Show me the main entry points',
                'How is authentication handled?',
                'Find potential bugs',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl px-4 py-2 text-[12px] text-gray-400 transition-all duration-200 hover:border-violet-400/30 hover:bg-white/[0.08] hover:text-violet-300 hover:shadow-md hover:shadow-violet-500/5"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 py-6">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} msg={msg} isNew={newMsgIds.has(msg.id)} />
            ))}

            {/* Thinking indicator */}
            {isLoading && (
              <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 shadow-lg shadow-violet-500/20 animate-pulse">
                    <Icon icon="lucide:bot" width={16} className="text-white" />
                  </div>
                </div>
                <div className="rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.06] backdrop-blur-xl px-4 py-3 shadow-lg shadow-black/10">
                  <ThinkingDots />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Input area ─────────────────────────────────────── */}
      <div className="border-t border-white/[0.08] bg-black/30 backdrop-blur-xl px-6 py-4">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-5xl items-end gap-3 rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.05] backdrop-blur-xl px-4 py-3 transition-all duration-200 focus-within:border-violet-400/30 focus-within:bg-white/[0.08] focus-within:shadow-lg focus-within:shadow-violet-500/5"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the codebase…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent text-sm text-gray-100 placeholder:text-gray-600 outline-none disabled:opacity-50 max-h-40"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/30 backdrop-blur-xl border border-violet-400/20 text-white shadow-md transition-all duration-200 hover:bg-violet-500/40 hover:shadow-lg hover:shadow-violet-500/20 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-md"
          >
            <Icon
              icon="lucide:arrow-up"
              width={18}
              className={isLoading ? 'animate-pulse' : ''}
            />
          </button>
        </form>
        <p className="mt-2 text-center text-[10px] text-gray-600">
          ChatCode uses RAG-powered AI to answer questions about your codebase. Shift+Enter for new line.
        </p>
      </div>
    </div>
  );
};

export default ChatCodeView;
