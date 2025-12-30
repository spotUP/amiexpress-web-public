/**
 * Chat Terminal - Standalone LiveChat Access
 *
 * Uses the same BBSTerminal component as the main BBS,
 * but connects with a chat-only flag that auto-launches LiveChat door.
 */

import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { io, Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';
import './chat.css';

const XTERM_CONFIG = {
  fontFamily: 'mosoul, "Courier New", monospace',
  fontSize: 16,
  lineHeight: 1.2,
  theme: {
    background: '#000000',
    foreground: '#aaaaaa',
    cursor: '#00ff00',
    cursorAccent: '#000000',
    black: '#000000',
    red: '#aa0000',
    green: '#00aa00',
    yellow: '#aa5500',
    blue: '#0000aa',
    magenta: '#aa00aa',
    cyan: '#00aaaa',
    white: '#aaaaaa',
    brightBlack: '#555555',
    brightRed: '#ff5555',
    brightGreen: '#55ff55',
    brightYellow: '#ffff55',
    brightBlue: '#5555ff',
    brightMagenta: '#ff55ff',
    brightCyan: '#55ffff',
    brightWhite: '#ffffff',
  },
};

export default function ChatTerminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js terminal - size will be set by FitAddon
    const term = new Terminal({
      fontFamily: XTERM_CONFIG.fontFamily,
      fontSize: XTERM_CONFIG.fontSize,
      lineHeight: XTERM_CONFIG.lineHeight,
      theme: XTERM_CONFIG.theme,
      cursorBlink: true,
      cursorStyle: 'block',
      convertEol: false,
    });

    term.open(terminalRef.current);
    terminalInstance.current = term;
    console.log('[ChatTerminal] Terminal opened and instance stored');

    // Load canvas addon for better performance
    const canvasAddon = new CanvasAddon();
    term.loadAddon(canvasAddon);

    // Load fit addon for responsive sizing
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Terminal mode: 'fixed' = 80 cols (for ANSI art), 'wide' = responsive width
    // Default to 'wide' for standalone chat page - full responsive width
    let terminalMode: 'fixed' | 'wide' = 'wide';

    // Fit terminal to container, respecting mode
    const fitTerminal = () => {
      // Get container dimensions for debugging
      const container = terminalRef.current;
      if (container) {
        console.log(`[ChatTerminal] Container size: ${container.clientWidth}x${container.clientHeight}px`);
      }

      // Get pre-fit dimensions
      const preFitCols = term.cols;
      const preFitRows = term.rows;

      // Perform the fit
      fitAddon.fit();

      // Get post-fit dimensions
      let { cols, rows } = term;
      console.log(`[ChatTerminal] FitAddon: ${preFitCols}x${preFitRows} -> ${cols}x${rows}`);

      // In fixed mode, cap width at 80 columns for ANSI art compatibility
      if (terminalMode === 'fixed' && cols > 80) {
        cols = 80;
        term.resize(cols, rows);
        console.log(`[ChatTerminal] Fixed mode: capped to ${cols}x${rows}`);
      }

      console.log(`[ChatTerminal] Final size: ${cols}x${rows} (mode: ${terminalMode})`);
      if (socketRef.current?.connected) {
        socketRef.current.emit('terminal-size', { cols, rows });
        console.log(`[ChatTerminal] Emitted terminal-size event`);
      }
    };

    // Initial fit after a brief delay for DOM layout
    setTimeout(fitTerminal, 100);

    // Throttled resize handler for live resizing
    // Fires immediately, then throttles to ~60fps, then fires once more at end
    let resizeThrottleTimer: number | null = null;
    let resizeTrailingTimer: number | null = null;
    let lastResizeTime = 0;
    const THROTTLE_MS = 16; // ~60fps for smooth live resize

    const throttledFitTerminal = () => {
      const now = Date.now();

      // Clear any pending trailing call
      if (resizeTrailingTimer) {
        clearTimeout(resizeTrailingTimer);
        resizeTrailingTimer = null;
      }

      // If enough time has passed, fire immediately
      if (now - lastResizeTime >= THROTTLE_MS) {
        lastResizeTime = now;
        fitTerminal();
      } else if (!resizeThrottleTimer) {
        // Otherwise, schedule a throttled call
        resizeThrottleTimer = window.setTimeout(() => {
          resizeThrottleTimer = null;
          lastResizeTime = Date.now();
          fitTerminal();
        }, THROTTLE_MS - (now - lastResizeTime));
      }

      // Always schedule a trailing call to catch the final size
      resizeTrailingTimer = window.setTimeout(() => {
        resizeTrailingTimer = null;
        fitTerminal();
      }, 100);
    };

    // Handle window resize
    const handleResize = () => {
      throttledFitTerminal();
    };
    window.addEventListener('resize', handleResize);
    console.log('[ChatTerminal] Window resize listener attached');

    // Also use ResizeObserver for more reliable container size detection
    let resizeObserver: ResizeObserver | null = null;
    if (terminalRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        throttledFitTerminal();
      });
      resizeObserver.observe(terminalRef.current);
      console.log('[ChatTerminal] ResizeObserver attached');
    }

    // Determine backend URL
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const backendUrl = isDevelopment ? 'http://localhost:3001' : window.location.origin;

    // Connect with chatOnly flag - backend will auto-launch LiveChat after login
    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      query: {
        chatOnly: 'true'  // Signal to backend this is chat-only mode
      }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[ChatTerminal] Connected');
      // Send terminal size on connect
      const { cols, rows } = term;
      socket.emit('terminal-size', { cols, rows });
      term.focus();
    });

    socket.on('connect_error', (error) => {
      console.error('[ChatTerminal] Connection error:', error.message);
      // Connection errors are now handled by blessed modals on the door side
    });

    socket.on('disconnect', (reason) => {
      console.log('[ChatTerminal] Disconnected:', reason);
      // Disconnection is now handled by blessed modals on the door side
    });

    // ANSI output from server (including LiveChat door output)
    socket.on('ansi-output', (data: string) => {
      term.write(data);
    });

    // Terminal resize
    socket.on('terminal-resize', (size: { cols: number; rows: number }) => {
      term.resize(size.cols, size.rows);
    });

    // Door active state
    socket.on('door-active', (active: boolean) => {
      console.log('[ChatTerminal] Door active:', active);
    });

    // Terminal mode switching: 'fixed' = 80 cols, 'wide' = responsive
    socket.on('terminal-mode', (mode: 'fixed' | 'wide') => {
      console.log(`[ChatTerminal] Mode switched to: ${mode}`);
      terminalMode = mode;
      fitTerminal(); // Re-fit with new mode
    });

    // Send ALL input to backend - door handles everything (including login via blessed modal)
    term.onData((data: string) => {
      console.log('[ChatTerminal] onData fired:', JSON.stringify(data), 'charCode:', data.charCodeAt(0));
      if (!socket.connected) {
        console.log('[ChatTerminal] Socket not connected, ignoring input');
        return;
      }
      console.log('[ChatTerminal] Emitting command event to backend');
      socket.emit('command', data);
    });

    term.focus();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      // Clean up throttle timers
      if (resizeThrottleTimer) {
        clearTimeout(resizeThrottleTimer);
      }
      if (resizeTrailingTimer) {
        clearTimeout(resizeTrailingTimer);
      }
      socket.disconnect();
      term.dispose();
    };
  }, []);

  return (
    <div className="chat-terminal-container">
      <div
        ref={terminalRef}
        className="chat-terminal-wrapper"
        onClick={() => terminalInstance.current?.focus()}
      />
    </div>
  );
}
