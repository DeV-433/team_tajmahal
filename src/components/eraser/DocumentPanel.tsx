// ---------------------------------------------------------------------------
// eraser/DocumentPanel.tsx — Left "Document" panel (markdown notes / AI output)
// Matches eraser.io's left side with markdown editing area.
// ---------------------------------------------------------------------------

import { memo, type FC } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DocumentPanelProps {
  /** Repo name shown as the title */
  title: string;
  /** Document content (markdown-ish text) */
  content: string;
  /** Called when user edits the content */
  onContentChange: (text: string) => void;
  /** AI answer shown below the editor (if any) */
  aiAnswer: string | null;
}

const DocumentPanel: FC<DocumentPanelProps> = ({
  title,
  content,
  onContentChange,
  aiAnswer,
}) => (
  <div className="flex h-full flex-col bg-transparent">
    {/* Title */}
    <div className="px-6 pt-6 pb-2">
      <h1 className="text-2xl font-bold text-gray-100">
        {title || 'Untitled File'}
      </h1>
    </div>

    {/* Editable content area */}
    <div className="flex-1 overflow-auto px-6 py-2 pb-6">
      {aiAnswer ? (
        /* AI answer display */
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">
              AI Analysis
            </span>
          </div>
          <div className="rounded-lg border border-dashed border-purple-500/20 bg-purple-950/30 backdrop-blur-2xl p-4">
            <div className="prose prose-invert prose-sm max-w-none
              prose-headings:text-gray-100 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
              prose-h2:text-base prose-h3:text-sm
              prose-p:text-gray-300 prose-p:leading-relaxed prose-p:my-2
              prose-strong:text-gray-100
              prose-li:text-gray-300 prose-li:my-0.5
              prose-ul:my-2 prose-ol:my-2
              prose-code:text-purple-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
              prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700 prose-pre:rounded-lg
              prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {aiAnswer}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 italic">
          Type your notes or document here &mdash; style with markdown or{' '}
          <span className="text-blue-400 underline cursor-pointer">shortcuts</span>{' '}
          (Ctrl/)
        </p>
      )}

      {/* Editable textarea */}
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        placeholder="Start typing your notes…"
        className="mt-4 min-h-[200px] w-full resize-none border-none bg-transparent text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:ring-0"
        spellCheck={false}
      />
    </div>
  </div>
);

export default memo(DocumentPanel);
