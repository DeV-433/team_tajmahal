// ---------------------------------------------------------------------------
// nodes/CallChainNode.tsx — Architecture-style node matching reference diagram
// Large Iconify icon on top, label below, minimal clean card
// ---------------------------------------------------------------------------

import { memo, type FC } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import LanguageIcon from '../icons/LanguageIcon';

// ---- Data shape expected by the node ---------------------------------------

export interface CallChainNodeData {
  name: string;
  file_path?: string;
  file?: string;
  line_start?: number;
  line?: number;
  end_line?: number;
  signature?: string;
  is_external?: boolean;
  annotations?: string[];
  chainDepth?: number;
  role?: string;
}

// ---- Node width (keep in sync with layout constants) -----------------------

const NODE_WIDTH = 140;
const ICON_SIZE = 48;

// ---- Component -------------------------------------------------------------

const CallChainNode: FC<NodeProps<CallChainNodeData>> = ({ data }) => {
  const annotations = data.annotations ?? [];
  const filePath = data.file_path ?? data.file ?? '';

  // Human-friendly display name: strip parens, camelCase → Title Case
  const displayName = data.name
    .replace(/\(.*\)$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div
      className="group relative flex flex-col items-center"
      style={{ width: NODE_WIDTH }}
      title={data.signature ?? data.name}
    >
      {/* ── Handles ───────────────────────────────────────────── */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !border-0 !bg-gray-600/50 !-left-1"
      />

      {/* ── Icon ─────────────────────────────────────────────── */}
      <LanguageIcon
        filePath={filePath}
        isExternal={data.is_external}
        annotations={annotations}
        size={ICON_SIZE}
      />

      {/* ── Label ────────────────────────────────────────────── */}
      <p
        className="mt-2 w-full text-center text-[12px] font-semibold leading-tight text-gray-200"
        style={{ wordBreak: 'break-word' }}
        title={data.name}
      >
        {displayName}
      </p>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !border-0 !bg-gray-600/50 !-right-1"
      />
    </div>
  );
};

export default memo(CallChainNode);
