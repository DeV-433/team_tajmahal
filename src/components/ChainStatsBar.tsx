// ---------------------------------------------------------------------------
// components/ChainStatsBar.tsx — Summary stats bar for call chain mode
// ---------------------------------------------------------------------------

import { type FC } from 'react';
import type { ChainStats } from '../types/graph';

interface ChainStatsBarProps {
  stats: ChainStats;
  rootName: string;
  onClose: () => void;
}

const Stat: FC<{ label: string; value: number; accent?: string }> = ({
  label,
  value,
  accent = 'text-gray-100',
}) => (
  <div className="flex items-center gap-1.5">
    <span className={`text-sm font-semibold tabular-nums ${accent}`}>{value}</span>
    <span className="text-[11px] text-gray-500">{label}</span>
  </div>
);

const ChainStatsBar: FC<ChainStatsBarProps> = ({ stats, rootName, onClose }) => (
  <div className="flex items-center gap-5 rounded-lg border border-white/[0.08] bg-black/30 backdrop-blur-xl px-4 py-2 shadow-lg">
    {/* Root indicator */}
    <div className="flex items-center gap-2 border-r border-gray-700/50 pr-4">
      <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
      <span className="text-xs font-medium text-gray-200 max-w-[160px] truncate">
        {rootName}
      </span>
    </div>

    {/* Stats */}
    <Stat label="hops" value={stats.total_hops} />
    <Stat label="leaves" value={stats.leaf_count} accent="text-emerald-400" />
    <Stat label="external" value={stats.external_count} accent="text-blue-400" />
    <Stat label="max depth" value={stats.max_depth} />

    {/* Close */}
    <button
      onClick={onClose}
      className="ml-2 rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
      title="Exit call chain view"
    >
      ✕ Exit
    </button>
  </div>
);

export default ChainStatsBar;
