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

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (isAutoScrolling && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
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
      className={`terminal relative flex flex-col h-full bg-[#1E1E1E] text-[#CCCCCC] ${className}`}
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

      {/* Auto-scroll indicator */}
      {!isAutoScrolling && (
        <button
          onClick={() => {
            setIsAutoScrolling(true);
            if (terminalRef.current) {
              terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
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
