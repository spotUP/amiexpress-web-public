import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface SessionLogTerminalProps {
  content: string[];
}

export function SessionLogTerminal({ content }: SessionLogTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Strip destructive ANSI control codes while keeping color (SGR) codes
  const sanitizeAnsi = (text: string) => {
    // Remove cursor movement/clear sequences but keep SGR (m) codes
    return text.replace(/\x1b\[[0-9;?]*([@-Z\\-_]|[a-ln-z])/g, (match, cmd) => {
      return cmd === 'm' ? match : '';
    });
  };

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance
    const terminal = new Terminal({
      rows: 24,
      cols: 80,
      cursorBlink: false,
      disableStdin: true,  // Read-only terminal
      theme: {
        background: '#000000',
        foreground: '#00ff00',
        cursor: '#00ff00',
        black: '#000000',
        red: '#cd0000',
        green: '#00cd00',
        yellow: '#cdcd00',
        blue: '#0000ee',
        magenta: '#cd00cd',
        cyan: '#00cdcd',
        white: '#e5e5e5',
        brightBlack: '#7f7f7f',
        brightRed: '#ff0000',
        brightGreen: '#00ff00',
        brightYellow: '#ffff00',
        brightBlue: '#5c5cff',
        brightMagenta: '#ff00ff',
        brightCyan: '#00ffff',
        brightWhite: '#ffffff',
      },
    });

    // Create fit addon
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal
    terminal.open(terminalRef.current);
    fitAddon.fit();

    // Store refs
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
    };
  }, []);

  // Update terminal content when it changes
  useEffect(() => {
    if (!xtermRef.current) return;

    // Clear terminal
    xtermRef.current.clear();

    // Write all content
    const fullContent = sanitizeAnsi(content.join(''));
    if (fullContent) {
      xtermRef.current.write(fullContent);
    }
  }, [content]);

  return (
    <div
      ref={terminalRef}
      className="w-full h-full bg-surface-0 rounded-lg"
      style={{ minHeight: '400px' }}
    />
  );
}
