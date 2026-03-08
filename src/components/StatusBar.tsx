// ---------------------------------------------------------------------------
// components/StatusBar.tsx — Bottom status bar (simplified for bridge mode)
// ---------------------------------------------------------------------------

import type { FC } from 'react';
import type { ToolProgress } from '../hooks/useSSE';

interface StatusBarProps {
  nodeCount: number;
  edgeCount: number;
  isConnected: boolean;
  toolProgress?: ToolProgress[];
}

const StatusBar: FC<StatusBarProps> = ({ nodeCount, edgeCount, isConnected, toolProgress }) => {
  const running = toolProgress?.filter((p) => p.status === 'running') ?? [];
  const latestTool = running.length > 0 ? running[running.length - 1] : undefined;

  return (
    <div className="flex h-7 items-center gap-3 rounded-tr-2xl border-t border-white/[0.08] bg-black/40 backdrop-blur-2xl px-3 text-[11px] text-gray-500">
      {/* SSE connection indicator */}
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>

      {/* Running tool indicator */}
      {latestTool && (
        <>
          <span className="text-gray-700">|</span>
          <span className="animate-pulse text-blue-400">
            Running {latestTool.tool}
            {latestTool.symbol ? ` (${latestTool.symbol})` : ''}…
          </span>
        </>
      )}

      <div className="flex-1" />
    </div>
  );
};

export default StatusBar;
