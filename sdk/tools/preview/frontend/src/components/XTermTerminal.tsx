import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import '@xterm/xterm/css/xterm.css';

interface XTermTerminalProps {
  output: string[];
  onInput?: (input: string) => void;
  fontSize?: number;
  className?: string;
}

export const XTermTerminal: React.FC<XTermTerminalProps> = ({
  output,
  onInput,
  fontSize = 14,
  className = '',
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const lastOutputLength = useRef<number>(0);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js terminal with proper configuration
    const term = new Terminal({
      fontFamily: 'mosoul, "Courier New", monospace',
      fontSize: fontSize,
      lineHeight: 1.2,
      theme: {
        background: '#1E1E1E',
        foreground: '#CCCCCC',
        cursor: '#CCCCCC',
        black: '#000000',
        red: '#ff0000',
        green: '#00ff00',
        yellow: '#ffff00',
        blue: '#0000ff',
        magenta: '#ff00ff',
        cyan: '#00ffff',
        white: '#ffffff',
        brightBlack: '#808080',
        brightRed: '#ff8080',
        brightGreen: '#80ff80',
        brightYellow: '#ffff80',
        brightBlue: '#8080ff',
        brightMagenta: '#ff80ff',
        brightCyan: '#80ffff',
        brightWhite: '#ffffff'
      },
      allowTransparency: false,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 2000,
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      allowProposedApi: true,
      // CRITICAL: Don't let terminal grow, use fixed dimensions
      convertEol: false,
    });

    term.open(terminalRef.current);
    terminalInstance.current = term;

    // Load canvas addon for better performance
    const canvasAddon = new CanvasAddon();
    term.loadAddon(canvasAddon);

    // Handle input
    term.onData((data: string) => {
      if (onInput) {
        onInput(data);
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

    const newLines = output.slice(lastOutputLength.current);
    if (newLines.length > 0) {
      // Double buffering: Build complete output buffer before writing
      // This prevents screen flickering during updates
      const HIDE_CURSOR = '\x1b[?25l';
      const SHOW_CURSOR = '\x1b[?25h';

      // Build buffered output with cursor hiding
      let buffer = HIDE_CURSOR;
      newLines.forEach((line) => {
        buffer += line + '\r\n';
      });
      buffer += SHOW_CURSOR;

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
};
