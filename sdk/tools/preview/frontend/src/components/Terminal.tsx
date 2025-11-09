import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ansiToHtml } from '../utils/ansi';
import { SessionRecorder } from '../utils/sessionRecording';

interface TerminalProps {
  output: string[];
  onInput?: (input: string) => void;
  autoScroll?: boolean;
  fontSize?: number;
  recorder?: SessionRecorder;
  className?: string;
}

export const Terminal: React.FC<TerminalProps> = ({
  output,
  onInput,
  autoScroll = true,
  fontSize = 14,
  recorder,
  className = '',
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentInput, setCurrentInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isAutoScrolling, setIsAutoScrolling] = useState(autoScroll);
  const [copySuccess, setCopySuccess] = useState(false);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (isAutoScrolling && terminalRef.current) {
      // Use double requestAnimationFrame to ensure DOM has fully updated
      // This fixes the issue where clicking Run doesn't scroll until you click again
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
          }
        });
      });
    }
  }, [output, isAutoScrolling]);

  // Focus input when terminal is clicked
  const handleTerminalClick = () => {
    inputRef.current?.focus();
  };

  // Handle scroll to detect manual scrolling
  const handleScroll = () => {
    if (!terminalRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;

    setIsAutoScrolling(isAtBottom);
  };

  // Handle keyboard input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Enter':
        if (currentInput.trim()) {
          onInput?.(currentInput);
          recorder?.addEvent('input', currentInput);
          setCommandHistory((prev) => [...prev, currentInput]);
          setHistoryIndex(-1);
          setCurrentInput('');
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (commandHistory.length > 0) {
          const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
          setHistoryIndex(newIndex);
          setCurrentInput(commandHistory[newIndex]);
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (historyIndex !== -1) {
          const newIndex = historyIndex + 1;
          if (newIndex >= commandHistory.length) {
            setHistoryIndex(-1);
            setCurrentInput('');
          } else {
            setHistoryIndex(newIndex);
            setCurrentInput(commandHistory[newIndex]);
          }
        }
        break;

      case 'c':
        if (e.ctrlKey) {
          e.preventDefault();
          setCurrentInput('');
        }
        break;
    }
  };

  // Extract error logs for copying
  const extractErrorLogs = useCallback(() => {
    return output
      .filter((line) => {
        // Match lines with "Error:" or ANSI red color code (31m)
        return line.includes('Error:') || line.includes('\x1b[31m') || line.includes('error');
      })
      .map((line) => line.replace(/\x1b\[[0-9;]*m/g, '')) // Strip ANSI codes
      .join('\n');
  }, [output]);

  // Copy error logs to clipboard
  const handleCopyErrors = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const errors = extractErrorLogs();
    if (!errors) {
      // No errors found, copy all output
      const allOutput = output.map((line) => line.replace(/\x1b\[[0-9;]*m/g, '')).join('\n');
      try {
        await navigator.clipboard.writeText(allOutput);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(errors);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Render output lines with ANSI support
  const renderOutput = useCallback(() => {
    return output.map((line, index) => {
      const html = ansiToHtml(line);
      return (
        <div
          key={index}
          className="whitespace-pre-wrap font-mono"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    });
  }, [output]);

  return (
    <div
      className={`terminal relative flex flex-col h-full overflow-hidden bg-[#1E1E1E] text-[#CCCCCC] ${className}`}
      onClick={handleTerminalClick}
    >
      {/* Output area */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 cursor-text"
        onScroll={handleScroll}
        style={{ fontSize: `${fontSize}px` }}
      >
        {renderOutput()}

        {/* Current input line */}
        <div className="flex items-start font-mono">
          <span className="text-green-400 mr-2">$</span>
          <input
            ref={inputRef}
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent outline-none border-none text-[#CCCCCC] font-mono"
            style={{ fontSize: `${fontSize}px` }}
            autoFocus
            spellCheck={false}
          />
        </div>
      </div>

      {/* Copy errors button */}
      <button
        onClick={handleCopyErrors}
        className="absolute top-4 right-4 bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm shadow-lg transition-colors flex items-center gap-2"
        title="Copy error logs to clipboard"
      >
        {copySuccess ? (
          <>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy Logs
          </>
        )}
      </button>

      {/* Auto-scroll indicator */}
      {!isAutoScrolling && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsAutoScrolling(true);
            if (terminalRef.current) {
              requestAnimationFrame(() => {
                if (terminalRef.current) {
                  terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
                }
              });
            }
          }}
          className="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm shadow-lg transition-colors"
        >
          Scroll to bottom
        </button>
      )}
    </div>
  );
};
