import React, { useState } from 'react';
import { CheckCircle, XCircle, Copy, Download } from 'lucide-react';

interface CodeDiffViewerProps {
  original: string;
  suggested: string;
  filePath: string;
  explanation?: string;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
}

export const CodeDiffViewer: React.FC<CodeDiffViewerProps> = ({
  original,
  suggested,
  filePath,
  explanation,
  onAccept,
  onReject,
  onClose,
}) => {
  const [copyFeedback, setCopyFeedback] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(suggested);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([suggested], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filePath.split('/').pop() || 'code.ts';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Calculate stats
  const originalLines = original.split('\n').length;
  const suggestedLines = suggested.split('\n').length;
  const lineDiff = suggestedLines - originalLines;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1E1E1E] rounded-lg shadow-2xl w-full max-w-7xl h-[90vh] mx-4 border border-gray-700 flex flex-col">
        {/* Header */}
        <div className="bg-[#252526] px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Code Diff Viewer</h2>
            <p className="text-sm text-gray-400 mt-1">{filePath}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-3xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* Explanation */}
        {explanation && (
          <div className="bg-[#252526] px-6 py-3 border-b border-gray-700">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 mt-2 bg-blue-500 rounded-full flex-shrink-0" />
              <p className="text-sm text-gray-300">{explanation}</p>
            </div>
          </div>
        )}

        {/* Stats Bar */}
        <div className="bg-[#252526] px-6 py-2 border-b border-gray-700 flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Original:</span>
            <span className="text-white font-mono">{originalLines} lines</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Suggested:</span>
            <span className="text-white font-mono">{suggestedLines} lines</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Change:</span>
            <span className={`font-mono ${lineDiff > 0 ? 'text-green-400' : lineDiff < 0 ? 'text-red-400' : 'text-gray-400'}`}>
              {lineDiff > 0 ? '+' : ''}{lineDiff} lines
            </span>
          </div>
        </div>

        {/* Diff View */}
        <div className="flex-1 overflow-hidden flex">
          {/* Original Code */}
          <div className="flex-1 flex flex-col border-r border-gray-700">
            <div className="bg-[#252526] px-4 py-2 border-b border-gray-700 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">Original</span>
            </div>
            <div className="flex-1 overflow-auto">
              <pre className="text-xs font-mono p-4 text-gray-300 whitespace-pre-wrap break-words">
                {original}
              </pre>
            </div>
          </div>

          {/* Suggested Code */}
          <div className="flex-1 flex flex-col">
            <div className="bg-[#252526] px-4 py-2 border-b border-gray-700 flex items-center justify-between">
              <span className="text-sm font-medium text-green-400">Suggested</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                  title="Copy to clipboard"
                >
                  <Copy className="w-3 h-3 text-gray-400 hover:text-white" />
                </button>
                <button
                  onClick={handleDownload}
                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                  title="Download file"
                >
                  <Download className="w-3 h-3 text-gray-400 hover:text-white" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-green-900/5">
              <pre className="text-xs font-mono p-4 text-gray-300 whitespace-pre-wrap break-words">
                {suggested}
              </pre>
            </div>
          </div>
        </div>

        {/* Copy Feedback */}
        {copyFeedback && (
          <div className="absolute top-20 right-6 bg-green-600 text-white px-4 py-2 rounded shadow-lg animate-fadeIn">
            Copied to clipboard!
          </div>
        )}

        {/* Actions */}
        <div className="bg-[#252526] px-6 py-4 border-t border-gray-700 flex items-center justify-between">
          <div className="text-sm text-gray-400">
            Review the changes carefully before applying
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onReject}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
            <button
              onClick={() => {
                onAccept();
                onClose();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Accept & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
