import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import '@xterm/xterm/css/xterm.css';
import { buildTerminalBuffer, XTERM_CONFIG } from '../utils/terminal-utils';

interface XTermTerminalProps {
  output: string[];
  onInput?: (input: string) => void;
  fontSize?: number;
  className?: string;
}

export interface XTermTerminalRef {
  focus: () => void;
}

export const XTermTerminal = forwardRef<XTermTerminalRef, XTermTerminalProps>(({
  output,
  onInput,
  fontSize = 14,
  className = '',
}, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const lastOutputLength = useRef<number>(0);

  // Expose focus method to parent components
  useImperativeHandle(ref, () => ({
    focus: () => {
      terminalInstance.current?.focus();
    },
  }));

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js terminal with shared configuration
    // IMPORTANT: Use BBS theme (not SDK theme) for 100% BBS compatibility
    const term = new Terminal({
      fontFamily: XTERM_CONFIG.fontFamily,
      fontSize: fontSize,
      lineHeight: XTERM_CONFIG.lineHeight,
      theme: XTERM_CONFIG.theme, // Use BBS theme for consistency
      ...XTERM_CONFIG.options,
      // CRITICAL: Don't let terminal grow, use fixed dimensions
      convertEol: false,
      cols: 80, // BBS standard width
      rows: 24, // BBS standard height
    });

    term.open(terminalRef.current);
    terminalInstance.current = term;

    // Load canvas addon for better performance
    const canvasAddon = new CanvasAddon();
    term.loadAddon(canvasAddon);

    // Handle input using onKey for proper keyboard event handling
    // This gives us actual key values instead of raw escape sequences
    term.onKey(({ key }) => {
      if (onInput) {
        // Send the raw key data which includes proper escape sequences
        // This is what doors expect to receive
        onInput(key);
      }
    });

    // Focus terminal on mount
    term.focus();

    // Cleanup
    return () => {
      term.dispose();
      terminalInstance.current = null;
    };
  }, [fontSize]);

  // Handle output updates - only write new lines with double buffering and cursor hiding
  useEffect(() => {
    if (!terminalInstance.current) return;

    // If output array has shrunk (e.g., tab switch), clear terminal and re-render all
    if (output.length < lastOutputLength.current) {
      terminalInstance.current.clear();
      lastOutputLength.current = 0;
    }

    const newLines = output.slice(lastOutputLength.current);
    if (newLines.length > 0) {
      // Use shared double buffering utility to prevent screen flickering
      const buffer = buildTerminalBuffer(newLines, { hideCursor: true });

      // Write entire buffer at once
      terminalInstance.current.write(buffer);
      lastOutputLength.current = output.length;
    }
  }, [output]);

  // Handle fontSize changes
  useEffect(() => {
    if (terminalInstance.current) {
      terminalInstance.current.options.fontSize = fontSize;
    }
  }, [fontSize]);

  // Focus terminal when clicked
  const handleClick = () => {
    terminalInstance.current?.focus();
  };

  return (
    <div
      ref={terminalRef}
      className={`h-full w-full ${className}`}
      onClick={handleClick}
      style={{
        // CRITICAL: Prevent terminal from growing
        overflow: 'hidden',
        position: 'relative',
        // Ensure terminal uses full available space but doesn't exceed it
        maxHeight: '100%',
        maxWidth: '100%'
      }}
    />
  );
});

// Add display name for debugging
XTermTerminal.displayName = 'XTermTerminal';
