// ---------------------------------------------------------------------------
// eraser/CanvasToolbar.tsx — Vertical toolbar on the canvas (eraser.io style)
// ---------------------------------------------------------------------------

import { memo, type FC } from 'react';
import { Icon } from '@iconify/react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type CanvasTool =
  | 'pointer'
  | 'rectangle'
  | 'circle'
  | 'arrow'
  | 'line'
  | 'connector'
  | 'text'
  | 'search'
  | 'frame'
  | 'comment';

interface CanvasToolbarProps {
  activeTool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  onAdd: () => void;
  onAI: () => void;
  disabled?: boolean;
}

const MAIN_TOOLS: { tool: CanvasTool; icon: string; label: string; shortcut: string }[] = [
  { tool: 'pointer',   icon: 'lucide:mouse-pointer-2', label: 'Select',    shortcut: 'V' },
  { tool: 'rectangle', icon: 'lucide:square',           label: 'Rectangle', shortcut: 'R' },
  { tool: 'circle',    icon: 'lucide:circle',           label: 'Ellipse',   shortcut: 'O' },
  { tool: 'arrow',     icon: 'lucide:arrow-up-right',   label: 'Arrow',     shortcut: 'A' },
  { tool: 'line',      icon: 'lucide:minus',            label: 'Line',      shortcut: 'L' },
  { tool: 'connector', icon: 'lucide:link-2',           label: 'Connector', shortcut: 'D' },
  { tool: 'text',      icon: 'lucide:type',             label: 'Text',      shortcut: 'T' },
  { tool: 'search',    icon: 'lucide:search',           label: 'Find',      shortcut: 'I' },
];

const BOTTOM_TOOLS: { tool: CanvasTool; icon: string; label: string; shortcut: string }[] = [
  { tool: 'frame',   icon: 'lucide:frame',           label: 'Frame',   shortcut: 'F' },
  { tool: 'comment', icon: 'lucide:message-square',   label: 'Comment', shortcut: 'C' },
];

// Tools that stay enabled even when canvas has no diagram content
const ALWAYS_ENABLED = new Set<CanvasTool>(['pointer', 'search']);

const CanvasToolbar: FC<CanvasToolbarProps> = ({ activeTool, onToolChange, onAdd, onAI, disabled }) => (
  <div className="absolute right-4 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.04] backdrop-blur-2xl p-1.5">
    {/* Add button */}
    <ToolButton icon="lucide:plus" label="Add" shortcut="/" onClick={onAdd} />

    {/* AI button */}
    <ToolButton icon="lucide:sparkles" label="AI" shortcut="Ctrl J" onClick={onAI} className="text-purple-400" />

    <div className="my-1 h-px w-6 bg-gray-700" />

    {/* Main tools */}
    {MAIN_TOOLS.map((t) => (
      <ToolButton
        key={t.tool}
        icon={t.icon}
        label={t.label}
        shortcut={t.shortcut}
        isActive={activeTool === t.tool}
        onClick={() => onToolChange(t.tool)}
        disabled={disabled && !ALWAYS_ENABLED.has(t.tool)}
      />
    ))}

    <div className="my-1 h-px w-6 bg-gray-700" />

    {/* Bottom tools */}
    {BOTTOM_TOOLS.map((t) => (
      <ToolButton
        key={t.tool}
        icon={t.icon}
        label={t.label}
        shortcut={t.shortcut}
        isActive={activeTool === t.tool}
        onClick={() => onToolChange(t.tool)}
        disabled={disabled && !ALWAYS_ENABLED.has(t.tool)}
      />
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Individual toolbar button
// ---------------------------------------------------------------------------

interface ToolButtonProps {
  icon: string;
  label: string;
  shortcut: string;
  isActive?: boolean;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}

const ToolButton: FC<ToolButtonProps> = ({
  icon,
  label,
  shortcut,
  isActive,
  onClick,
  className,
  disabled,
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          disabled
            ? 'cursor-not-allowed text-gray-600 opacity-40'
            : isActive
              ? 'bg-blue-600/20 text-blue-400'
              : `text-gray-400 hover:bg-gray-800 hover:text-gray-200 ${className ?? ''}`
        }`}
      >
        <Icon icon={icon} width={16} />
      </button>
    </TooltipTrigger>
    <TooltipContent side="left" className="text-xs">
      {label} <kbd className="ml-1 rounded border border-gray-700 bg-gray-800 px-1 text-[9px] text-gray-500">{shortcut}</kbd>
    </TooltipContent>
  </Tooltip>
);

export default memo(CanvasToolbar);
