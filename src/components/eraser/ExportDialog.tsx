// ---------------------------------------------------------------------------
// eraser/ExportDialog.tsx — Export diagram preview popup with watermark
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState, type FC } from 'react';

interface ExportDialogProps {
  /** The React Flow viewport element to capture */
  flowElement: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  diagramName: string;
}

const WATERMARK_TEXT = 'Codrix.ai';
const WATERMARK_PADDING = 56;

/**
 * Renders the ReactFlow viewport to a canvas, stamps a watermark, and
 * lets the user preview / download the PNG.
 */
const ExportDialog: FC<ExportDialogProps> = ({
  flowElement,
  open,
  onClose,
  onSaved,
  diagramName,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);

  // Pre-load the logo image once
  useEffect(() => {
    const img = new Image();
    img.src = '/vyuha-logo.png';
    img.onload = () => { logoRef.current = img; };
  }, []);

  // Generate preview when dialog opens
  useEffect(() => {
    if (!open || !flowElement) return;

    const generate = async () => {
      try {
        // Dynamic import to avoid bundling unless needed
        const { toPng } = await import('html-to-image');

        const dataUrl = await toPng(flowElement, {
          backgroundColor: '#0a0e17',
          quality: 1,
          pixelRatio: 4,
          filter: (node: HTMLElement) => {
            // Exclude React Flow controls, minimap, panels overlaying the canvas
            const cls = node.className?.toString?.() ?? '';
            if (cls.includes('react-flow__controls')) return false;
            if (cls.includes('react-flow__minimap')) return false;
            if (cls.includes('react-flow__panel')) return false;
            return true;
          },
        });

        // Draw onto a canvas so we can add the watermark
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);

          // ---- Watermark ----
          const logoSize = 72;
          const fontSize = 40;
          ctx.save();
          ctx.globalAlpha = 0.7;
          ctx.font = `bold ${fontSize}px "Hanken Grotesk", sans-serif`;

          const textWidth = ctx.measureText(WATERMARK_TEXT).width;
          const totalWidth = logoSize + 8 + textWidth;
          const x = canvas.width - totalWidth - WATERMARK_PADDING;
          const y = canvas.height - WATERMARK_PADDING;

          // Draw logo if loaded
          if (logoRef.current) {
            ctx.drawImage(
              logoRef.current,
              x,
              y - logoSize + 4,
              logoSize,
              logoSize,
            );
          }

          // Draw text
          ctx.fillStyle = '#ffffff';
          ctx.fillText(WATERMARK_TEXT, x + logoSize + 8, y);
          ctx.restore();

          canvasRef.current = canvas;
          setPreviewUrl(canvas.toDataURL('image/png'));
        };
        img.src = dataUrl;
      } catch (err) {
        console.error('Export capture failed:', err);
      }
    };

    generate();
  }, [open, flowElement]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setPreviewUrl(null);
      onClose();
    }, 200);
  }, [onClose]);

  const handleSave = useCallback(() => {
    if (!canvasRef.current) return;

    // Trigger download
    const link = document.createElement('a');
    link.download = `${diagramName.replace(/[^a-zA-Z0-9_-]/g, '_')}_codrix.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();

    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setPreviewUrl(null);
      onSaved();
    }, 200);
  }, [diagramName, onSaved]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full max-w-2xl flex-col gap-5 rounded-2xl border border-dashed border-white/[0.15] bg-black/70 backdrop-blur-2xl p-6 shadow-2xl transition-all duration-200 ${closing ? 'scale-95 opacity-0' : 'animate-in fade-in zoom-in-95'}`}
      >
        {/* Title */}
        <div>
          <h2 className="text-lg font-bold text-gray-100">Export Diagram</h2>
          <p className="mt-1 text-sm text-gray-400">
            Preview your diagram. Click <strong>Save</strong> to download the PNG to your device.
          </p>
        </div>

        {/* Preview */}
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/40">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Diagram preview"
              className="w-full object-contain"
              style={{ maxHeight: '50vh' }}
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-gray-500">
              Generating preview…
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            className="rounded-full border border-red-500/30 bg-red-500/10 px-6 py-2 text-sm font-medium text-red-300 backdrop-blur-xl transition-all hover:bg-red-500/20 hover:text-red-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!previewUrl}
            className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-6 py-2 text-sm font-medium text-emerald-300 backdrop-blur-xl transition-all hover:bg-emerald-500/20 hover:text-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;
