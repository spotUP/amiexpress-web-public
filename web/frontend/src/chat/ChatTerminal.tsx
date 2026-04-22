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
  fontFamily: 'mosoul, "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", "Courier New", monospace',
  fontSize: 16,
  lineHeight: 1.0,  // Perfect for ANSI art/box-drawing (bitmap font requires gapless lines)
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

    // Track mouse tracking state for Ctrl+M toggle
    let mouseTrackingDisabled = false;

    // Custom keyboard handler
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Ctrl+Shift+M: toggle mouse tracking on/off
      if (event.ctrlKey && event.shiftKey && (event.key === 'M' || event.key === 'm') && event.type === 'keydown') {
        mouseTrackingDisabled = !mouseTrackingDisabled;
        if (mouseTrackingDisabled) {
          // Disable all mouse tracking modes
          term.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l');
          console.log('[ChatTerminal] Mouse tracking DISABLED (Ctrl+M)');
        } else {
          // Re-enable mouse tracking (SGR extended mode + any-event)
          term.write('\x1b[?1000h\x1b[?1002h\x1b[?1006h');
          console.log('[ChatTerminal] Mouse tracking ENABLED (Ctrl+M)');
        }
        return false;
      }

      // Shift+Arrow keys for text selection in livechat
      if (!event.shiftKey) return true;

      const keyMap: Record<string, string> = {
        'ArrowUp': '\x1B[1;2A',      // Shift+Up
        'ArrowDown': '\x1B[1;2B',    // Shift+Down
        'ArrowRight': '\x1B[1;2C',   // Shift+Right
        'ArrowLeft': '\x1B[1;2D',    // Shift+Left
      };

      const sequence = keyMap[event.key];
      if (sequence) {
        socket.emit('command', sequence);
        return false;
      }

      return true;
    });

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
    // IMPORTANT: autoConnect: false to ensure handlers are registered before connection
    // This prevents race condition where backend emits door:load-client before handlers exist
    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      autoConnect: false,  // Don't connect until handlers are registered
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
      console.log(`[ChatTerminal] *** TERMINAL MODE SWITCH *** Mode: ${mode}`);
      console.log(`[ChatTerminal] Container size before: ${terminalRef.current?.clientWidth}x${terminalRef.current?.clientHeight}px`);
      console.log(`[ChatTerminal] Terminal size before: ${term.cols}x${term.rows}`);
      terminalMode = mode;
      fitTerminal(); // Re-fit with new mode
      console.log(`[ChatTerminal] Terminal size after: ${term.cols}x${term.rows}`);
    });

    // Load hybrid door client bundle (for audio support in LiveChat)
    socket.on('door:load-client', async (data: { doorId: string; sessionId: string; bundleUrl: string; manifest: any }) => {
      console.log(`[ChatTerminal] Loading client door: ${data.doorId}`);

      // Expose BBS connection to client doors
      (window as any).__BBS__ = {
        socket,
        sessionId: data.sessionId,
        backendUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
      };

      // Remove any existing script for this door
      const scriptId = `door-${data.doorId}`;
      const existingScript = document.getElementById(scriptId);
      if (existingScript) {
        existingScript.remove();
      }

      // Create and load the client bundle script
      const script = document.createElement('script');
      script.id = scriptId;
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      script.src = data.bundleUrl.startsWith('http')
        ? data.bundleUrl
        : `${backendUrl}${data.bundleUrl}`;
      script.type = 'text/javascript';

      script.onload = () => {
        console.log(`[ChatTerminal] Client bundle loaded: ${data.doorId}`);
      };

      script.onerror = (error) => {
        console.error(`[ChatTerminal] Failed to load client bundle:`, error);
        delete (window as any).__BBS__;
      };

      document.body.appendChild(script);
    });

    // Unload hybrid door client bundle
    socket.on('door:unload-client', (data: { doorId: string; sessionId?: string }) => {
      console.log(`[ChatTerminal] Unloading client door: ${data.doorId}`);
      const scriptId = `door-${data.doorId}`;
      const script = document.getElementById(scriptId);
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if ((window as any).__BBS__?.sessionId === data.sessionId) {
        delete (window as any).__BBS__;
      }
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

    // NOW connect - all handlers are registered, safe to receive events
    console.log('[ChatTerminal] All handlers registered, connecting...');
    socket.connect();

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
