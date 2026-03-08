// ---------------------------------------------------------------------------
// edges/CallChainEdge.tsx — Clean arrow edge for call chain mode
// ---------------------------------------------------------------------------

import { type FC } from 'react';
import { getSmoothStepPath, type EdgeProps } from 'reactflow';

interface CallChainEdgeData {
  type: string;
  isCycle?: boolean;
}

const CallChainEdge: FC<EdgeProps<CallChainEdgeData>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style = {},
}) => {
  const isCycle = data?.isCycle ?? false;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <path
      id={id}
      className="react-flow__edge-path"
      d={edgePath}
      style={{
        ...style,
        stroke: isCycle ? '#F59E0B' : '#334155',
        strokeWidth: isCycle ? 1.4 : 1,
        strokeDasharray: isCycle ? '6 4' : undefined,
        fill: 'none',
        opacity: isCycle ? 0.9 : 0.7,
      }}
      markerEnd={`url(#arrow-${isCycle ? 'cycle' : 'call'})`}
    />
  );
};

/**
 * SVG marker definitions to include once in the ReactFlow canvas.
 * Rendered by GraphCanvas when in call_chain mode.
 */
export const CallChainMarkers: FC = () => (
  <svg style={{ position: 'absolute', width: 0, height: 0 }}>
    <defs>
      <marker
        id="arrow-call"
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
      </marker>
      <marker
        id="arrow-cycle"
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#F59E0B" />
      </marker>
    </defs>
  </svg>
);

export default CallChainEdge;
