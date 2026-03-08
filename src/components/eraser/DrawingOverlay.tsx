// ---------------------------------------------------------------------------
// eraser/DrawingOverlay.tsx — SVG drawing overlay for canvas shapes
//   Supports: rectangle, circle, arrow, line, text, frame, comment
//   • Drag to draw shapes
//   • Double-click a shape to delete it
//   • Pointer mode: overlay is transparent to events
// ---------------------------------------------------------------------------

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { CanvasTool } from './CanvasToolbar';

// ---------------------------------------------------------------------------
// Shape types
// ---------------------------------------------------------------------------

interface Point { x: number; y: number }

interface DrawnShape {
  id: string;
  type: CanvasTool;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
}

interface DrawingOverlayProps {
  activeTool: CanvasTool;
  onToolReset: () => void;
}

// Non-drawing tools — overlay should be transparent to events
const PASSTHROUGH_TOOLS = new Set<CanvasTool>([
  'pointer', 'search', 'connector',
]);

let nextId = 1;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DrawingOverlay: FC<DrawingOverlayProps> = ({ activeTool, onToolReset }) => {
  const [shapes, setShapes] = useState<DrawnShape[]>([]);
  const [drawing, setDrawing] = useState<DrawnShape | null>(null);
  const [deletePopup, setDeletePopup] = useState<{ id: string; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const isPassthrough = PASSTHROUGH_TOOLS.has(activeTool);

  // ---- Mouse → SVG coordinate helper ─────────────────────────────
  const toLocal = useCallback((e: ReactMouseEvent): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  // ---- Start drawing ─────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (isPassthrough) return;
      const p = toLocal(e);
      const id = `drawn-${nextId++}`;
      setDrawing({ id, type: activeTool, x: p.x, y: p.y, w: 0, h: 0 });
    },
    [activeTool, isPassthrough, toLocal],
  );

  // ---- Resize while dragging ─────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      if (!drawing) return;
      const p = toLocal(e);
      setDrawing((d) =>
        d ? { ...d, w: p.x - d.x, h: p.y - d.y } : null,
      );
    },
    [drawing, toLocal],
  );

  // ---- Finish drawing ────────────────────────────────────────────
  const handleMouseUp = useCallback(() => {
    if (!drawing) return;
    // Only keep shapes larger than 8px in either dimension
    const absW = Math.abs(drawing.w);
    const absH = Math.abs(drawing.h);
    if (absW > 8 || absH > 8) {
      // Normalise negative sizes
      const finalShape: DrawnShape = {
        ...drawing,
        x: drawing.w < 0 ? drawing.x + drawing.w : drawing.x,
        y: drawing.h < 0 ? drawing.y + drawing.h : drawing.y,
        w: absW,
        h: absH,
      };
      // For text tool, prompt for text
      if (drawing.type === 'text') {
        const text = window.prompt('Enter text:');
        if (text) {
          finalShape.text = text;
          setShapes((s) => [...s, finalShape]);
        }
      } else {
        setShapes((s) => [...s, finalShape]);
      }
    } else if (drawing.type === 'text') {
      // Click-to-place text
      const text = window.prompt('Enter text:');
      if (text) {
        setShapes((s) => [...s, { ...drawing, w: 120, h: 32, text }]);
      }
    }
    setDrawing(null);
    onToolReset();
  }, [drawing, onToolReset]);

  // ---- Double-click to show delete popup ─────────────────────────
  const handleDoubleClick = useCallback((shapeId: string, cx: number, cy: number) => {
    setDeletePopup({ id: shapeId, x: cx, y: cy });
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deletePopup) return;
    setShapes((s) => s.filter((sh) => sh.id !== deletePopup.id));
    setDeletePopup(null);
  }, [deletePopup]);

  const dismissPopup = useCallback(() => setDeletePopup(null), []);

  // Dismiss popup on Escape key
  useEffect(() => {
    if (!deletePopup) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDeletePopup(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deletePopup]);

  // ---- Render shapes ────────────────────────────────────────────
  const allShapes = useMemo(
    () => (drawing ? [...shapes, drawing] : shapes),
    [shapes, drawing],
  );

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 z-10"
      style={{
        width: '100%',
        height: '100%',
        pointerEvents: isPassthrough ? 'none' : 'auto',
        cursor: isPassthrough ? 'default' : 'crosshair',
      }}
      onMouseDown={(e) => {
        // Dismiss popup if clicking on empty canvas area
        if (deletePopup) { dismissPopup(); return; }
        handleMouseDown(e);
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {allShapes.map((s) => (
        <ShapeElement
          key={s.id}
          shape={s}
          isPreview={s.id === drawing?.id}
          onDoubleClick={handleDoubleClick}
        />
      ))}

      {/* ── Animated delete popup ─────────────────────────── */}
      {deletePopup && (
        <foreignObject
          x={deletePopup.x - 52}
          y={deletePopup.y - 44}
          width={104}
          height={40}
          style={{ overflow: 'visible' }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              animation: 'deletePopIn 0.2s cubic-bezier(0.34,1.56,0.64,1) forwards',
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); confirmDelete(); }}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-950/80 px-3 py-1.5 text-xs font-medium text-red-300 shadow-lg shadow-red-900/30 backdrop-blur-xl transition-colors hover:bg-red-900/90 hover:text-red-200"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              Delete
            </button>
          </div>
        </foreignObject>
      )}

      {/* Keyframe animation for the popup */}
      <defs>
        <style>{`
          @keyframes deletePopIn {
            0% { opacity: 0; transform: scale(0.5) translateY(6px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </defs>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Individual shape renderer
// ---------------------------------------------------------------------------

interface ShapeElementProps {
  shape: DrawnShape;
  isPreview: boolean;
  onDoubleClick: (id: string, cx: number, cy: number) => void;
}

const ShapeElement: FC<ShapeElementProps> = ({ shape, isPreview, onDoubleClick }) => {
  const { id, type, x, y, w, h, text } = shape;
  const opacity = isPreview ? 0.5 : 0.85;
  const stroke = isPreview ? '#60a5fa' : '#818cf8'; // blue-400 / indigo-400
  const fill = isPreview ? 'rgba(96,165,250,0.08)' : 'rgba(129,140,248,0.06)';

  // Normalise for rendering (handle negative w/h when still drawing)
  const nx = w < 0 ? x + w : x;
  const ny = h < 0 ? y + h : y;
  const nw = Math.abs(w);
  const nh = Math.abs(h);

  const common = {
    opacity,
    onDoubleClick: (e: ReactMouseEvent) => {
      e.stopPropagation();
      onDoubleClick(id, nx + nw / 2, ny - 4);
    },
    style: { cursor: 'pointer' } as React.CSSProperties,
  };

  switch (type) {
    case 'rectangle':
    case 'frame':
      return (
        <rect
          {...common}
          x={nx}
          y={ny}
          width={nw}
          height={nh}
          rx={type === 'frame' ? 0 : 6}
          fill={fill}
          stroke={type === 'frame' ? '#fbbf24' : stroke}
          strokeWidth={type === 'frame' ? 1.5 : 2}
          strokeDasharray={type === 'frame' ? '6 3' : undefined}
        />
      );

    case 'circle':
      return (
        <ellipse
          {...common}
          cx={nx + nw / 2}
          cy={ny + nh / 2}
          rx={nw / 2}
          ry={nh / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
        />
      );

    case 'arrow': {
      // Draw line with arrowhead
      const x1 = x;
      const y1 = y;
      const x2 = x + w;
      const y2 = y + h;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 12;
      const ax1 = x2 - headLen * Math.cos(angle - Math.PI / 6);
      const ay1 = y2 - headLen * Math.sin(angle - Math.PI / 6);
      const ax2 = x2 - headLen * Math.cos(angle + Math.PI / 6);
      const ay2 = y2 - headLen * Math.sin(angle + Math.PI / 6);
      return (
        <g {...common}>
          <line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={stroke} strokeWidth={2} opacity={opacity}
          />
          <polygon
            points={`${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`}
            fill={stroke} opacity={opacity}
          />
          {/* Invisible wider hit area for double-click */}
          <line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="transparent" strokeWidth={12}
          />
        </g>
      );
    }

    case 'line':
      return (
        <g {...common}>
          <line
            x1={x} y1={y} x2={x + w} y2={y + h}
            stroke={stroke} strokeWidth={2} opacity={opacity}
          />
          <line
            x1={x} y1={y} x2={x + w} y2={y + h}
            stroke="transparent" strokeWidth={12}
          />
        </g>
      );

    case 'text':
      return (
        <g {...common}>
          <rect x={nx} y={ny} width={Math.max(nw, 40)} height={Math.max(nh, 28)} fill="transparent" />
          <text
            x={nx + 4}
            y={ny + (Math.max(nh, 28)) / 2}
            dominantBaseline="central"
            fill="#e2e8f0"
            fontSize={14}
            fontFamily="Inter, system-ui, sans-serif"
            opacity={opacity}
          >
            {text || 'Text'}
          </text>
        </g>
      );

    case 'comment':
      return (
        <g {...common}>
          <rect
            x={nx} y={ny} width={Math.max(nw, 60)} height={Math.max(nh, 36)}
            rx={8} fill="rgba(250,204,21,0.12)" stroke="#fbbf24" strokeWidth={1.5}
            opacity={opacity}
          />
          <text
            x={nx + 8}
            y={ny + (Math.max(nh, 36)) / 2}
            dominantBaseline="central"
            fill="#fde68a"
            fontSize={12}
            fontFamily="Inter, system-ui, sans-serif"
            opacity={opacity}
          >
            {text || '💬'}
          </text>
        </g>
      );

    default:
      return null;
  }
};

export default memo(DrawingOverlay);
