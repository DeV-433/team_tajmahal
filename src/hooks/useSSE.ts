// ---------------------------------------------------------------------------
// hooks/useSSE.ts — Server-Sent Events (simplified for contextplus bridge)
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SSEEvent } from '../types/graph';

const SSE_URL = (import.meta.env.VITE_API_URL || '') + '/api/events';
const MAX_BACKOFF_MS = 30_000;

export interface ToolProgress {
  tool: string;
  status: 'running' | 'done' | 'error';
  symbol?: string;
  error?: string;
  timestamp: string;
}

export interface UseSSEReturn {
  isConnected: boolean;
  lastEvent: SSEEvent | null;
  toolProgress: ToolProgress[];
  clearProgress: () => void;
  /** Clear agent-related steps (alias for clearProgress in the simplified bridge). */
  clearAgentSteps: () => void;
}

export function useSSE(): UseSSEReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [toolProgress, setToolProgress] = useState<ToolProgress[]>([]);

  const retryCount = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  const clearProgress = useCallback(() => setToolProgress([]), []);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!mounted) return;

      const es = new EventSource(SSE_URL);
      esRef.current = es;

      es.onopen = () => {
        if (!mounted) return;
        setIsConnected(true);
        retryCount.current = 0;
      };

      es.onmessage = (ev: MessageEvent) => {
        if (!mounted) return;
        try {
          const parsed: SSEEvent = { event: 'message', data: JSON.parse(ev.data) };
          setLastEvent(parsed);
        } catch { /* ignore */ }
      };

      const handleEvent = (ev: MessageEvent) => {
        if (!mounted) return;
        try {
          const data = JSON.parse(ev.data) as Record<string, string>;
          const sseEvent: SSEEvent = { event: ev.type, data };
          setLastEvent(sseEvent);

          const now = new Date().toISOString();

          switch (ev.type) {
            case 'tool_start':
              setToolProgress((prev) => [
                ...prev,
                { tool: data.tool, status: 'running', symbol: data.symbol, timestamp: now },
              ]);
              break;
            case 'tool_done':
              setToolProgress((prev) =>
                prev.map((p) =>
                  p.tool === data.tool && p.status === 'running'
                    ? { ...p, status: 'done' as const, timestamp: now }
                    : p,
                ),
              );
              break;
            case 'tool_error':
              setToolProgress((prev) =>
                prev.map((p) =>
                  p.tool === data.tool && p.status === 'running'
                    ? { ...p, status: 'error' as const, error: data.error, timestamp: now }
                    : p,
                ),
              );
              break;
          }
        } catch { /* ignore */ }
      };

      for (const t of ['tool_start', 'tool_done', 'tool_error']) {
        es.addEventListener(t, handleEvent as EventListener);
      }

      es.onerror = () => {
        if (!mounted) return;
        setIsConnected(false);
        es.close();
        esRef.current = null;
        const delay = Math.min(1000 * Math.pow(2, retryCount.current), MAX_BACKOFF_MS);
        retryCount.current += 1;
        timer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      esRef.current?.close();
    };
  }, []);

  return { isConnected, lastEvent, toolProgress, clearProgress, clearAgentSteps: clearProgress };
}
