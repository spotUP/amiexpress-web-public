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

const AUTH_ERROR_PATTERNS = [
  /session expired/i,
  /please log in/i,
  /invalid authentication token/i,
  /authentication failed/i,
];

function isAuthError(message: string | undefined): boolean {
  if (!message) return false;
  return AUTH_ERROR_PATTERNS.some((re) => re.test(message));
}

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
      // Hold Option (macOS) to select text with the mouse.
      //
      // The door turns on mouse tracking, which hands every click and drag
      // to the application - so an ordinary drag moves a blessed widget
      // instead of selecting, and the chat log cannot be copied out of. This
      // is the standard escape hatch, and the same one iTerm and Terminal
      // use: Option forces selection even while an app owns the mouse.
      macOptionClickForcesSelection: true,
      // Almost no scrollback. The door draws a full-screen UI and scrolls its
      // own chat log, so terminal history buys nothing here and costs a great
      // deal: on resize xterm REFLOWS the old rows into scrollback rather
      // than discarding them, ESC[2J clears only the viewport, and the
      // viewport can be left above the bottom - which showed up as copies of
      // the whole UI stacked above the live one during a resize drag
      // (2026-08-26).
      //
      // ONE line, not zero. At zero, a resize could leave xterm's own
      // renderer reading a row that is not in the buffer:
      //   Cannot read properties of undefined (reading 'loadCell')
      //     at _forEachCell -> _drawBackground -> handleGridChanged
      // A single line of history is far too little for a stale frame to hide
      // in and keeps the buffer out of that edge case.
      scrollback: 1,
    });

    term.open(terminalRef.current);
    terminalInstance.current = term;
    console.log('[ChatTerminal] Terminal opened and instance stored');

    // Suppress the browser's native right-click menu over the terminal
    // — blessed doors use rightclick as their context-menu trigger, and
    // letting the OS menu pop instead hid ours entirely.
    terminalRef.current.addEventListener('contextmenu', (e) => e.preventDefault());

    // Track mouse tracking state for Ctrl+M toggle
    let mouseTrackingDisabled = false;

    // Track pressed keys for stuck-key detection
    const normalPressedKeys = new Map<string, number>(); // code -> first press timestamp
    const blockedKeys = new Set<string>(); // keys blocked until real keyup
    const MAX_NORMAL_REPEAT_MS = 5000; // max ms before we assume key is stuck

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

      // Stuck key detection: block keys repeating beyond threshold
      const keyId = event.code || event.key;
      if (event.type === 'keydown') {
        if (blockedKeys.has(keyId)) {
          event.preventDefault();
          return false;
        }
        if (event.repeat) {
          const firstPress = normalPressedKeys.get(keyId);
          if (firstPress && Date.now() - firstPress > MAX_NORMAL_REPEAT_MS) {
            blockedKeys.add(keyId);
            normalPressedKeys.delete(keyId);
            event.preventDefault();
            return false;
          }
        } else {
          normalPressedKeys.set(keyId, Date.now());
          blockedKeys.delete(keyId);
        }
      } else if (event.type === 'keyup') {
        normalPressedKeys.delete(keyId);
        blockedKeys.delete(keyId);
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

      // A container with no size cannot be fitted to.
      //
      // On a phone the on-screen keyboard can collapse the terminal's box to
      // nothing for a frame, and fitAddon.fit() then computes zero rows -
      // which xterm refuses, throwing out of the resize handler and leaving
      // the terminal in whatever state it had reached. Keeping the last good
      // size until the box comes back costs nothing: the next resize event
      // fits properly.
      if (!container || container.clientWidth < 1 || container.clientHeight < 1) {
        console.log('[ChatTerminal] Container has no size yet - keeping the current fit');
        return;
      }

      // Get pre-fit dimensions
      const preFitCols = term.cols;
      const preFitRows = term.rows;

      // Perform the fit
      try {
        fitAddon.fit();
      } catch (error) {
        // Never let a bad fit escape into the resize handler.
        console.warn('[ChatTerminal] fit failed, keeping the current size:', error);
        return;
      }

      // Get post-fit dimensions
      let cols = term.cols;
      const rows = term.rows;
      console.log(`[ChatTerminal] FitAddon: ${preFitCols}x${preFitRows} -> ${cols}x${rows}`);

      // In fixed mode, cap width at 80 columns for ANSI art compatibility
      if (terminalMode === 'fixed' && cols > 80) {
        cols = 80;
        term.resize(cols, rows);
        console.log(`[ChatTerminal] Fixed mode: capped to ${cols}x${rows}`);
      }

      console.log(`[ChatTerminal] Final size: ${cols}x${rows} (mode: ${terminalMode})`);

      // Never tell the door about a degenerate size - a door asked to lay
      // itself out in zero rows has nothing sensible to do with that.
      if (cols < 1 || rows < 1) return;

      // Telling the door is DEBOUNCED, not throttled - see announceSize.
      announceSize(cols, rows);
    };

    /**
     * Tell the door the new size, once the dragging has stopped.
     *
     * Fitting xterm is cheap and local, so it can track the window at any
     * rate. Telling the DOOR is not: every size it hears costs a whole-screen
     * repaint, and at the old 16ms throttle a single drag sent about sixty of
     * them. They landed while the terminal was still reflowing its own cell
     * grid, which stacked partial frames at different scales on top of each
     * other - the reported "layout really breaks, then pops back after some
     * seconds". Waiting for the size to settle means the door paints once,
     * at the size the window actually ended up.
     */
    let announceTimer: number | null = null;
    let announcedSize = '';
    const ANNOUNCE_SETTLE_MS = 120;

    function announceSize(cols: number, rows: number) {
      if (announceTimer) clearTimeout(announceTimer);
      announceTimer = window.setTimeout(() => {
        announceTimer = null;
        const size = `${cols}x${rows}`;
        // A resize that ends where it started costs the door nothing.
        if (size === announcedSize) return;
        announcedSize = size;
        if (socketRef.current?.connected) {
          socketRef.current.emit('terminal-size', { cols, rows });
          console.log(`[ChatTerminal] Emitted terminal-size ${size}`);
        }
      }, ANNOUNCE_SETTLE_MS);
    }

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

    // Send any cached SSO token (from main BBS login or a prior chat-only
    // login). If absent or rejected, the socket connects anonymously and
    // the door's blessed chat-only-login modal handles authentication.
    const ssoToken =
      localStorage.getItem('authToken') ||
      localStorage.getItem('bbs_auth_token');

    // Connect with chatOnly flag - backend will auto-launch LiveChat after login
    // IMPORTANT: autoConnect: false to ensure handlers are registered before connection
    // This prevents race condition where backend emits door:load-client before handlers exist
    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      // Infinity, not 10. A deploy recreates the container, and ten attempts
      // with a 5s ceiling gave up while it was still starting - after which
      // socket.io never tries again and the page sits on a dead terminal with
      // nothing on screen to say so.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      autoConnect: false,  // Don't connect until handlers are registered
      auth: ssoToken ? { token: ssoToken } : {},
      query: {
        chatOnly: 'true'  // Signal to backend this is chat-only mode
      }
    });
    socketRef.current = socket;

    // True once the socket has been up at least once, so a later 'connect' is
    // a RECONNECT rather than the first one. The door redraws its whole screen
    // on re-entry, so nothing is written here - the status line below only
    // exists for the window where there is no door to draw anything.
    let hasConnectedBefore = false;

    socket.on('connect', () => {
      console.log('[ChatTerminal] Connected');
      hasConnectedBefore = true;
      // Send terminal size on connect
      const { cols, rows } = term;
      socket.emit('terminal-size', { cols, rows });
      term.focus();
    });

    socket.on('connect_error', (error) => {
      console.error('[ChatTerminal] Connection error:', error.message);
      // Auth failures (expired/invalid JWT) happen BEFORE the door starts
      // so the door's blessed chat-only-login modal never gets to render.
      // The backend allows ANY connection without a token (see
      // index.ts:630-636), so the recovery is: clear the bad token and
      // reconnect with no auth — the door will load and its blessed
      // login modal will prompt for credentials.
      if (isAuthError(error.message)) {
        console.log('[ChatTerminal] Clearing stale auth token and retrying anonymously');
        localStorage.removeItem('authToken');
        localStorage.removeItem('bbs_auth_token');
        socket.auth = {};
        // socket.io won't auto-reconnect after a server-rejected handshake;
        // explicitly trigger a fresh connect attempt.
        setTimeout(() => socket.connect(), 100);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[ChatTerminal] Disconnected:', reason);
      // Say so on screen. A deploy takes the container away mid-session and
      // the terminal used to just freeze with the last frame still painted,
      // which reads as a hung door rather than a restart. Safe to write over
      // the door's screen here: the door is gone, and re-entry clears and
      // redraws it in full.
      if (hasConnectedBefore) {
        term.write('\r\n\x1b[33m*** Disconnected - reconnecting...\x1b[0m\r\n');
      }
      // Anything beyond this is handled by blessed modals on the door side
    });

    // socket.io retries for ever now (see reconnectionAttempts above); this
    // only reports progress so a long outage does not look like a dead page.
    socket.io.on('reconnect_attempt', (attempt: number) => {
      // Every attempt would scroll the screen away during a slow restart.
      if (attempt === 1 || attempt % 10 === 0) {
        term.write(`\x1b[90m  reconnect attempt ${attempt}...\x1b[0m\r\n`);
      }
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
      // Stop any copy still running before starting another. Removing a
      // door's <script> does not stop what the script started, so without
      // this every re-entry left its timers and its camera behind - which is
      // how this page ran out of media players ("too many WebMediaPlayers
      // already in existence"). BBSTerminal does the same; this page has its
      // own loader and needs its own call.
      window.dispatchEvent(new CustomEvent('bbs:door-unload', {
        detail: { doorId: data.doorId },
      }));

      console.log(`[ChatTerminal] Loading client door: ${data.doorId}`);

      // Expose BBS connection to client doors
      (window as any).__BBS__ = {
        socket,
        sessionId: data.sessionId,
        // The SAME origin the socket connected to - see backendUrl above.
        backendUrl,
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
      // backendUrl is the origin this page connected its socket to. It used
      // to be read from VITE_BACKEND_URL with a localhost:3001 fallback -
      // and that variable is not set for the production build, so the live
      // site asked the VIEWER'S OWN machine for the door bundle. If they
      // happened to be running a backend there it answered and the browser
      // refused it as cross-origin
      // (ERR_BLOCKED_BY_RESPONSE.NotSameOrigin); if they were not, it simply
      // failed. Either way LiveChat's client never loaded, so video could
      // not start.
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
      // Tell the door before taking its <script> away.
      window.dispatchEvent(new CustomEvent('bbs:door-unload', {
        detail: { doorId: data.doorId, sessionId: data.sessionId },
      }));

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

    // Prevent stuck keys: clear tracking when window loses focus or tab becomes hidden
    const handleWindowBlur = () => {
      normalPressedKeys.clear();
      blockedKeys.clear();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        normalPressedKeys.clear();
        blockedKeys.clear();
      }
    };
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // NOW connect - all handlers are registered, safe to receive events
    console.log('[ChatTerminal] All handlers registered, connecting...');
    socket.connect();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
