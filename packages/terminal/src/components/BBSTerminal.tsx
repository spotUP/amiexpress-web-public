import React, { useEffect, useRef, forwardRef, useImperativeHandle, useCallback, useState } from 'react';
import * as SDKClient from '@amiexpress/bbs-door-sdk/client';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { io, Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';
import { XTERM_CONFIG } from '../utils/terminal-utils';
import { getZmodem } from '../utils/zmodem';
import { MediaHandler } from '../utils/media-handler';
import { ModemEmulator } from '../utils/modem-emulator';
import { GamepadManager } from '../utils/gamepad-manager';
import type { AnyGamepadEvent } from '@amiexpress/bbs-door-sdk';

// RIP Graphics types (inline to avoid package dependency)
const RIP_WIDTH = 640;
const RIP_HEIGHT = 350;

const SHARED_AUTH_TOKEN_KEY = 'authToken';
const BBS_AUTH_TOKEN_KEY = 'bbs_auth_token';
const SESSION_STATE_KEY = 'bbs_session_state';

interface BBSTerminalProps {
  /** BBS backend URL (defaults to auto-detect based on environment) */
  backendUrl?: string;
  /** Terminal font size */
  fontSize?: number;
  /** Additional CSS class */
  className?: string;
  /** Whether to show connection error UI (default: true) */
  showConnectionError?: boolean;
  /** Connection error callback */
  onConnectionError?: (error: Error) => void;
  /** Connection success callback */
  onConnect?: () => void;
  /** Disconnect callback */
  onDisconnect?: (reason: string) => void;
  /** Raw ANSI output callback */
  onAnsiOutput?: (data: string) => void;
}

export interface BBSTerminalRef {
  focus: () => void;
  sendCommand: (command: string) => void;
  getSocket: () => Socket | null;
  getTerminal: () => Terminal | null;
  startDownload: (amigaPath: string) => Promise<void>;
  startUpload: (amigaPath: string, file: File) => Promise<void>;
}

/**
 * Unified BBS Terminal Component
 *
 * Used by both:
 * - BBS Frontend (main terminal interface)
 * - SDK Preview (BBS tab for live testing)
 *
 * Features:
 * - Socket.IO connection to BBS backend
 * - Auto-login support
 * - PETSCII font switching
 * - Configurable connection handling
 */
export const BBSTerminal = forwardRef<BBSTerminalRef, BBSTerminalProps>(({
  backendUrl,
  fontSize = 16,
  className = '',
  showConnectionError = true,
  onConnectionError,
  onConnect,
  onDisconnect,
  onAnsiOutput,
}, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Login state tracking
  const loginState = useRef<
    'waiting' |
    'username' |
    'password' |
    'new-user-prompt' |
    'registering' |
    'loggedin' |
    'checking-username' |
    'logging-in' |
    'password-reset'
  >('waiting');
  const passwordResetInput = useRef<string>(''); // Buffer for password reset input
  const username = useRef<string>('');
  const password = useRef<string>('');
  const newUserPromptUsername = useRef<string>('');
  const passwordMode = useRef<boolean>(false);
  const doorActive = useRef<boolean>(false);
  const reconnectPending = useRef<boolean>(false);
  const forcedDisconnectRef = useRef<boolean>(false);  // Track server-initiated disconnect (logoff)
  const doorReadyMap = useRef<Record<string, boolean>>({});
  const doorMessageBuffer = useRef<Record<string, any[]>>({});
  const doorScripts = useRef<Record<string, HTMLScriptElement | null>>({});
  const keyState = useRef<Record<string, boolean>>({});
  const keyRepeatTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});  // Key repeat timers
  const gameMode = useRef<boolean>(false);  // When true, send raw keydown/keyup events
  const mouseButtonDown = useRef<boolean>(false);  // Track mouse button state for drag events
  const lastMouseHoverTime = useRef<number>(0);  // Throttle hover events
  const guruTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const guruPhaseRef = useRef<number>(0);
  const guruStaticRendered = useRef<boolean>(false);
  const normalFont = useRef<string>('TopazPlus_a1200, "Courier New", monospace');
  const transferState = useRef<{ direction: 'upload' | 'download' | null; paths?: string[] }>({
    direction: null,
    paths: [],
  });
  const zmodemSentry = useRef<any | null>(null);
  const zmodemRef = useRef<any | null>(null);
  const mediaHandlerRef = useRef<MediaHandler | null>(null);
  const sfxBufferRef = useRef<string>('');
  const modemEmulatorRef = useRef<ModemEmulator | null>(null);

  // RIP Graphics state
  const [ripMode, setRipMode] = useState<boolean>(false);
  const ripModeRef = useRef<boolean>(false);

  // Terminal mode: 'fixed' = 80 cols (centered, max-width), 'wide' = fullscreen responsive
  const [terminalMode, setTerminalMode] = useState<'fixed' | 'wide'>('fixed');

  // Web transparency overlays (CSS-based, for web connections only)
  // Position info (x, y, width, height) is in terminal cells, converted to pixels during render
  const [overlays, setOverlays] = useState<Map<string, {
    opacity: number;
    show: boolean;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }>>(new Map());
  const overlayBufferRef = useRef<string>('');
  const ripCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ripBuffer = useRef<string>(''); // Buffer for RIP commands
  const zmodemSession = useRef<any | null>(null);
  const pendingUploadFiles = useRef<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const transferTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gamepadManagerRef = useRef<GamepadManager | null>(null);

  // Preload all Amiga fonts on mount to prevent mixed rendering when switching fonts
  useEffect(() => {
    const fonts = [
      { family: 'TopazPlus_a1200', url: '/fonts/TopazPlus_a1200_v1.0.ttf' },
      { family: 'TopazPlus_a500', url: '/fonts/TopazPlus_a500_v1.0.ttf' },
      { family: 'Topaz_a1200', url: '/fonts/Topaz_a1200_v1.0.ttf' },
      { family: 'Topaz_a500', url: '/fonts/Topaz_a500_v1.0.ttf' },
      { family: 'mosoul', url: '/fonts/mOsOul_v1.0.ttf' }
    ];

    const loadFonts = async () => {
      console.log('[Font Preload] Loading all fonts...');
      const promises = fonts.map(async ({ family, url }) => {
        try {
          const fontFace = new FontFace(family, `url(${url})`);
          await fontFace.load();
          document.fonts.add(fontFace);
          console.log('[Font Preload] Loaded:', family);
        } catch (error) {
          console.error('[Font Preload] Failed to load', family, error);
        }
      });
      await Promise.all(promises);
      console.log('[Font Preload] All fonts loaded');
    };

    loadFonts();
  }, []);

  const resetZmodem = () => {
    zmodemSession.current = null;
    zmodemSentry.current = null;
    transferState.current = { direction: null, paths: [] };
    pendingUploadFiles.current = [];
    if (transferTimeout.current) {
      clearTimeout(transferTimeout.current);
      transferTimeout.current = null;
    }
  };

  const requireZmodem = useCallback(() => {
    if (zmodemRef.current) return zmodemRef.current;
    const loaded = getZmodem();
    if (!loaded) {
      console.warn('[ZMODEM] Zmodem library not available');
      return null;
    }
    zmodemRef.current = loaded;
    return loaded;
  }, []);

  // Sound effects are now handled by MediaHandler (see media-handler.ts)
  // MediaHandler uses Web Audio API directly for browser-compatible audio playback

  const getStoredSharedToken = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return (
      localStorage.getItem(SHARED_AUTH_TOKEN_KEY) ||
      localStorage.getItem(BBS_AUTH_TOKEN_KEY)
    );
  }, []);

  const saveSessionState = useCallback((sessionData: any) => {
    if (typeof window === 'undefined') return;
    try {
      const sessionState = {
        userId: sessionData.userId || sessionData.user?.id || sessionData.user?.userId,
        username: sessionData.username || sessionData.user?.username,
        nodeId: sessionData.nodeId,
        socketId: sessionData.socketId,
        currentConf: sessionData.currentConf,
        savedAt: Date.now(),
      };
      sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(sessionState));
      console.log('[Session Persistence] Session state saved:', sessionState);
    } catch (error) {
      console.error('[Session Persistence] Failed to save session state:', error);
    }
  }, []);

  const getStoredSessionState = useCallback(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(SESSION_STATE_KEY);
      if (!stored) return null;
      const sessionState = JSON.parse(stored);
      // Only use session if it's less than 2 minutes old (connection state recovery window)
      if (Date.now() - sessionState.savedAt > 120000) {
        sessionStorage.removeItem(SESSION_STATE_KEY);
        return null;
      }
      return sessionState;
    } catch (error) {
      console.error('[Session Persistence] Failed to load session state:', error);
      return null;
    }
  }, []);

  const clearSessionState = useCallback(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(SESSION_STATE_KEY);
    console.log('[Session Persistence] Session state cleared');
  }, []);

  const attemptTokenLogin = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return false;
    if (loginState.current === 'loggedin' || loginState.current === 'registering') {
      return false;
    }

    const token = getStoredSharedToken();
    if (token) {
      console.log('[AutoLogin] Reusing shared auth token');
      socket.emit('login', { token });
      loginState.current = 'logging-in';
      return true;
    }
    return false;
  }, [getStoredSharedToken]);

  useEffect(() => {
    if (!attemptTokenLogin()) {
      loginState.current = 'waiting';
    }

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === SHARED_AUTH_TOKEN_KEY ||
        event.key === BBS_AUTH_TOKEN_KEY
      ) {
        attemptTokenLogin();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [attemptTokenLogin]);

  const cancelTransfer = () => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!transferState.current.direction) return;
    socket.emit('transfer-raw:cancel');
    terminalInstance.current?.writeln?.('\r\nTransfer cancelled.\r\n');
    resetZmodem();
  };

  const sendPendingFiles = (session?: any) => {
    const active = session || zmodemSession.current;
    if (!active) return;
    const Zmodem = requireZmodem();
    if (!Zmodem) return;
    if (!pendingUploadFiles.current.length) {
      terminalInstance.current?.writeln?.('\r\nSelect a file to upload...\r\n');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
        fileInputRef.current.click();
      } else {
        active.close?.();
      }
      return;
    }
    Zmodem.Browser.send_files(active, pendingUploadFiles.current, {})
      .then(() => active.close?.())
      .catch((err: any) => console.error('[ZMODEM] send_files failed:', err));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    pendingUploadFiles.current = files;
    if (!files.length) {
      terminalInstance.current?.writeln?.('\r\nUpload cancelled.\r\n');
      zmodemSession.current?.close?.();
      return;
    }
    if (zmodemSession.current && zmodemSession.current.type === 'send') {
      sendPendingFiles(zmodemSession.current);
    }
  };

  const handleZmodemDetection = (detection: any) => {
    const Zmodem = requireZmodem();
    if (!Zmodem) return;
    if (transferTimeout.current) {
      clearTimeout(transferTimeout.current);
      transferTimeout.current = null;
    }
    let zsession: any;
    try {
      zsession = detection.confirm();
    } catch (err) {
      console.error('[ZMODEM] Detection confirm failed:', err);
      return;
    }

    zmodemSession.current = zsession;

    zsession.on('session_end', () => {
      resetZmodem();
    });

    if (zsession.type === 'receive') {
      zsession.on('offer', (xfer: any) => {
        const details = xfer.get_details ? xfer.get_details() : {};
        const name = details.name || 'download.bin';
        xfer.accept()
          .then(() => {
            const payloads = xfer.get_payloads ? xfer.get_payloads() : [];
            Zmodem.Browser.save_to_disk(payloads, name);
          })
          .catch((err: any) => {
            console.error('[ZMODEM] Accept failed:', err);
          });
      });
      zsession.start();
    } else if (zsession.type === 'send') {
      sendPendingFiles(zsession);
    }
  };

  const beginZmodem = (direction: 'upload' | 'download', paths?: string[]) => {
    const socket = socketRef.current;
    if (!socket) return;
    const Zmodem = requireZmodem();
    if (!Zmodem) return;

    transferState.current = { direction, paths: paths || [] };
    const sender = (octets: any) => {
      socket.emit('transfer-raw:data', new Uint8Array(octets));
    };

    zmodemSentry.current = new Zmodem.Sentry({
      to_terminal: () => {
        // Suppress raw noise in UI; ZMODEM takes over the channel.
      },
      on_detect: handleZmodemDetection,
      on_retract: () => {},
      sender,
    });

    socket.emit('transfer-raw:start', { direction });

    if (direction === 'upload') {
      // Auto-cancel after 30s if no negotiation/file selection
      if (transferTimeout.current) {
        clearTimeout(transferTimeout.current);
      }
      transferTimeout.current = setTimeout(() => {
        terminalInstance.current?.writeln?.('\r\nUpload timed out. Cancelling.\r\n');
        socket.emit('transfer-raw:cancel');
        resetZmodem();
      }, 30000);

      try {
        const hdr = Zmodem.Header.build('ZRQINIT');
        sender(new Uint8Array(hdr.to_hex()));
      } catch (err) {
        console.error('[ZMODEM] Failed to send ZRQINIT from client:', err);
      }
    }
  };

  // Expose methods to parent components
  useImperativeHandle(ref, () => ({
    focus: () => {
      terminalInstance.current?.focus();
    },
    sendCommand: (command: string) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('command', command);
      }
    },
    getSocket: () => socketRef.current,
    getTerminal: () => terminalInstance.current,
    startDownload: async (_amigaPath: string) => {
      console.warn('[Terminal] Downloads start from the BBS. Awaiting transfer-raw:init.');
    },
    startUpload: async (_amigaPath: string, file: File) => {
      pendingUploadFiles.current = [file];
      if (zmodemSession.current && zmodemSession.current.type === 'send') {
        sendPendingFiles(zmodemSession.current);
      }
    },
  }));

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js terminal for BBS connection
    // Start with standard BBS size (80x25), FitAddon will adjust based on mode
    const term = new Terminal({
      fontFamily: XTERM_CONFIG.fontFamily,
      fontSize: fontSize,
      lineHeight: XTERM_CONFIG.lineHeight,
      theme: XTERM_CONFIG.theme,
      ...XTERM_CONFIG.options,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: 'block',
      cols: 80,
      rows: 25,
    });

    term.open(terminalRef.current);
    terminalInstance.current = term;

    // Custom keyboard handler for Shift+Arrow keys (for text selection in doors)
    // xterm.js doesn't send proper escape sequences for Shift+Arrow by default
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Only handle Shift+Arrow keys
      if (!event.shiftKey) return true; // Let xterm handle it

      const keyMap: Record<string, string> = {
        'ArrowUp': '\x1B[1;2A',      // Shift+Up
        'ArrowDown': '\x1B[1;2B',    // Shift+Down
        'ArrowRight': '\x1B[1;2C',   // Shift+Right
        'ArrowLeft': '\x1B[1;2D',    // Shift+Left
      };

      const sequence = keyMap[event.key];
      if (sequence) {
        console.log('[BBSTerminal] Sending Shift+Arrow:', event.key, '→', JSON.stringify(sequence)); // DEBUG
        // Send the proper escape sequence with Shift modifier
        socketRef.current?.emit('command', sequence);
        // Prevent xterm from processing this key
        return false;
      }

      // Let xterm handle all other keys
      return true;
    });

    // Initialize modem emulator for client-side speed throttling
    modemEmulatorRef.current = new ModemEmulator(term);

    // Add native wheel event listener directly to xterm element (React onWheel doesn't capture xterm's wheel events)
    const xtermElement = terminalRef.current.querySelector('.xterm-screen') || terminalRef.current;
    const nativeWheelHandler = (ev: WheelEvent) => {
      if (!doorActive.current && !gameMode.current) return;
      if (!socketRef.current?.connected) return;

      // Get terminal coords
      const rect = terminalRef.current?.getBoundingClientRect();
      if (!rect) return;

      const cellWidth = rect.width / 80;
      const cellHeight = rect.height / 24;
      const x = Math.floor((ev.clientX - rect.left) / cellWidth);
      const y = Math.floor((ev.clientY - rect.top) / cellHeight);

      ev.preventDefault();
      ev.stopPropagation();
      socketRef.current.emit('mouse-wheel', {
        x, y,
        deltaY: ev.deltaY,
        shift: ev.shiftKey,
        ctrl: ev.ctrlKey,
        alt: ev.altKey
      });
    };
    xtermElement.addEventListener('wheel', nativeWheelHandler as EventListener, { passive: false });
    // Store for cleanup
    (terminalRef.current as any)._wheelHandler = nativeWheelHandler;
    (terminalRef.current as any)._wheelElement = xtermElement;

    // Load canvas addon for better performance
    const canvasAddon = new CanvasAddon();
    term.loadAddon(canvasAddon);

    // Load fit addon for responsive sizing
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Terminal mode: 'fixed' = 80 cols (for ANSI art), 'wide' = responsive width
    // Default to 'fixed' for BBS compatibility
    let terminalMode: 'fixed' | 'wide' = 'fixed';

    // Fit terminal to container, respecting mode
    const fitTerminal = () => {
      // In fixed mode, DON'T resize - stay at 80x25
      if (terminalMode === 'fixed') {
        console.log(`[BBSTerminal] Fixed mode - ignoring resize, staying at 80x25`);
        return;
      }

      // Wide mode - fit to container
      const container = terminalRef.current;
      if (container) {
        console.log(`[BBSTerminal] Container size: ${container.clientWidth}x${container.clientHeight}px`);
      }

      const preFitCols = term.cols;
      const preFitRows = term.rows;

      // Perform the fit
      fitAddon.fit();

      const { cols, rows } = term;
      console.log(`[BBSTerminal] FitAddon: ${preFitCols}x${preFitRows} -> ${cols}x${rows} (wide mode)`);

      // Sanity check: ignore unreasonably small sizes (container likely still resizing)
      // Wide mode should give us at least 100+ columns for fullscreen
      if (cols < 40) {
        console.log(`[BBSTerminal] IGNORING resize to ${cols}x${rows} - too small, container likely transitioning`);
        term.resize(preFitCols, preFitRows); // Restore previous size
        return;
      }

      console.log(`[BBSTerminal] Final size: ${cols}x${rows} (mode: ${terminalMode})`);

      if (socketRef.current?.connected) {
        socketRef.current.emit('terminal-size', { cols, rows });
        console.log(`[BBSTerminal] Emitted terminal-size event`);
      }
    };

    // DON'T auto-fit on mount - terminal starts at 80x25 (fixed mode)
    // Only resize when:
    // 1. Door calls enableWideMode() (terminal-mode event)
    // 2. User resizes browser window (handled by resize listeners below)
    // 3. Server sends terminal-resize event

    // Throttled resize handler for live resizing
    let resizeThrottleTimer: number | null = null;
    let resizeTrailingTimer: number | null = null;
    let lastResizeTime = 0;
    const THROTTLE_MS = 16; // ~60fps

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
    console.log('[BBSTerminal] Window resize listener attached');

    // Also use ResizeObserver for more reliable container size detection
    let resizeObserver: ResizeObserver | null = null;
    if (terminalRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        throttledFitTerminal();
      });
      resizeObserver.observe(terminalRef.current);
      console.log('[BBSTerminal] ResizeObserver attached');
    }

    // Custom key event handler - intercepts keys before xterm processes them
    // This is critical for game mode because xterm normally intercepts all keys
    // NOTE: We only BLOCK xterm here - actual key handling is done by window event listeners
    // (handleGameKeyDown/handleGameKeyUp) which also handle key repeat
    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      // In game mode, block xterm from processing keys - window handlers will emit events
      if (gameMode.current && socketRef.current?.connected) {
        // Block xterm from processing any keys in game mode
        return false;
      }
      // Not in game mode - let xterm handle normally
      return true;
    });

    // Force cursor blinking immediately after open
    term.options.cursorBlink = true;
    term.options.cursorStyle = 'block';
    term.options.cursorInactiveStyle = 'block';

    // Apply font smoothing settings
    setTimeout(() => {
      term.options.theme = XTERM_CONFIG.theme;
      term.options.cursorBlink = true;
      term.options.cursorStyle = 'block';
      term.options.cursorInactiveStyle = 'block';
      term.options.fontSize = fontSize;

      const termElement = terminalRef.current?.querySelector('.xterm');
      if (termElement) {
        const style = (termElement as HTMLElement).style as any;
        style.fontSmooth = 'never';
        style.webkitFontSmoothing = 'none';
        style.MozOsxFontSmoothing = 'none';
      }
      term.refresh(0, term.rows - 1);
      term.focus();
    }, 100);

    // Determine backend URL
    // In production, frontend and backend are served from same origin, so use window.location.origin
    // In development, use localhost:3001
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const finalBackendUrl = backendUrl ||
      (import.meta as any).env?.VITE_BBS_BACKEND_URL ||
      (isDevelopment ? 'http://localhost:3001' : window.location.origin);

    console.log('[Terminal] Connecting to:', finalBackendUrl);

    // Reset game mode state at initialization to prevent stuck state from previous sessions
    gameMode.current = false;
    keyState.current = {};
    // Clear any lingering key repeat timers
    Object.keys(keyRepeatTimers.current).forEach(key => {
      clearTimeout(keyRepeatTimers.current[key]);
    });
    keyRepeatTimers.current = {};

    const stopGuruAnimation = () => {
      if (guruTimerRef.current) {
        clearInterval(guruTimerRef.current);
        guruTimerRef.current = null;
      }
    };

    const renderGuruMeditation = (phase: number) => {
      if (!showConnectionError) return;

      // Clear screen and render static content on first render only
      if (!guruStaticRendered.current) {
        term.write('\x1b[2J'); // Clear entire screen
        term.write('\x1b[H');  // Move cursor to home (top-left)
      } else {
        // On subsequent renders, just position cursor at top for blinking frame
        term.write('\x1b[H');
      }

      // Blink border between red and black backgrounds (like Amiga Guru Meditation)
      const borderBg = phase % 2 === 0 ? '\x1b[41m' : '\x1b[40m'; // Red bg or black bg
      const textColor = '\x1b[31m'; // Text always red foreground
      const reset = '\x1b[0m';
      const frameWidth = 80;
      const interiorWidth = 76; // 80 - 4 chars for border (2 on each side)

      const centerLine = (text: string) => {
        const leftPadding = Math.max(0, Math.floor((interiorWidth - text.length) / 2));
        const rightPadding = Math.max(0, interiorWidth - text.length - leftPadding);
        return `${borderBg}  ${reset}${' '.repeat(leftPadding)}${textColor}${text}${reset}${' '.repeat(rightPadding)}${borderBg}  ${reset}`;
      };

      // Draw solid red background frame (thicker than box-drawing chars)
      term.write(`${borderBg}${' '.repeat(frameWidth)}${reset}\r\n`); // Top border (full width)
      term.write(`${borderBg}  ${reset}${' '.repeat(interiorWidth)}${borderBg}  ${reset}\r\n`); // Empty line
      term.write(centerLine('Software Failure.') + '\r\n');
      term.write(centerLine('BBS Backend Connection Failed') + '\r\n');
      term.write(centerLine('Guru Meditation') + '\r\n');
      term.write(`${borderBg}  ${reset}${' '.repeat(interiorWidth)}${borderBg}  ${reset}\r\n`); // Empty line
      term.write(`${borderBg}${' '.repeat(frameWidth)}${reset}\r\n`); // Bottom border (full width)

      // Render the static content below on first render only
      if (!guruStaticRendered.current) {
        guruStaticRendered.current = true;
        term.writeln('');
        term.writeln('\x1b[33m[!] Cannot connect to BBS server at: \x1b[0m' + finalBackendUrl);
        term.writeln('');
        term.writeln('\x1b[37mThe BBS terminal requires the AmiExpress BBS backend to be running.\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[32mTo start the BBS backend:\x1b[0m');
        term.writeln('  \x1b[37m1. Open a new terminal\x1b[0m');
        term.writeln('  \x1b[37m2. Navigate to project root: \x1b[36mcd amiexpress-web\x1b[0m');
        term.writeln('  \x1b[37m3. Run: \x1b[36m./dev/scripts/start-servers.sh\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[90m' + '-'.repeat(80) + '\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[37mNote: You can still use the SDK preview for door development.\x1b[0m');
        term.writeln('\x1b[37mThe BBS tab is optional and only needed for testing doors in a live BBS.\x1b[0m');
        term.writeln('');
      }
    };

    const startGuruAnimation = () => {
      if (!showConnectionError) return;
      if (guruTimerRef.current) {
        renderGuruMeditation(guruPhaseRef.current);
        return;
      }

      // Reset static content flag and phase for new animation
      guruStaticRendered.current = false;
      guruPhaseRef.current = 0;
      renderGuruMeditation(guruPhaseRef.current);
      guruTimerRef.current = setInterval(() => {
        guruPhaseRef.current = (guruPhaseRef.current + 1) % 2;
        renderGuruMeditation(guruPhaseRef.current);
      }, 650);
    };

    // Game mode keyboard handlers - bypass OS key repeat delay with custom key repeat
    // Typing keys have initial delay before repeat for single character typing
    // Delay is long enough for comfortable typing while still responsive for games
    const KEY_REPEAT_DELAY = 400;  // Initial delay before repeat starts (ms) - safe for typing, responsive for games
    const KEY_REPEAT_RATE = 30;    // Interval between repeats (ms) - ~33fps, fast enough for games

    // Keys that should NOT auto-repeat
    // NOTE: Arrow keys REMOVED to enable list navigation in neo-blessed UIs
    // Games that need single-press arrow handling should track state themselves
    const NO_REPEAT_KEYS = new Set([
      'w', 'W', 'a', 'A', 's', 'S', 'd', 'D',
      ' ', 'Control', 'Shift', 'Alt', 'Meta',
      'Escape', 'Enter', 'Tab'
    ]);

    const startKeyRepeat = (key: string, code: string) => {
      // Don't auto-repeat movement/action keys - games should poll key state instead
      if (NO_REPEAT_KEYS.has(key)) {
        return;
      }

      // Clear any existing timer for this key
      if (keyRepeatTimers.current[key]) {
        clearTimeout(keyRepeatTimers.current[key]);
      }

      const repeatKey = () => {
        const canRepeat = keyState.current[key] && gameMode.current && socketRef.current?.connected;
        if (canRepeat) {
          socketRef.current!.emit('key-down', { key, code, repeat: true });
          keyRepeatTimers.current[key] = setTimeout(repeatKey, KEY_REPEAT_RATE);
        }
      };

      // Start repeat after initial delay (allows single character typing)
      keyRepeatTimers.current[key] = setTimeout(repeatKey, KEY_REPEAT_DELAY);
    };

    const stopKeyRepeat = (key: string) => {
      if (keyRepeatTimers.current[key]) {
        clearTimeout(keyRepeatTimers.current[key]);
        delete keyRepeatTimers.current[key];
      }
    };

    const handleGameKeyDown = (ev: KeyboardEvent) => {
      // Handle transfer cancel
      if (transferState.current.direction && ev.key === 'Escape') {
        ev.preventDefault();
        cancelTransfer();
        return;
      }

      // Ctrl+C while door/game is active: terminate the door
      if (ev.ctrlKey && ev.key === 'c' && (doorActive.current || gameMode.current) && socketRef.current?.connected) {
        ev.preventDefault();
        console.log('[BBSTerminal] Ctrl+C pressed in game mode - sending door:terminate');
        terminalInstance.current?.write('\r\n\x1b[33m[Aborting door...]\x1b[0m\r\n');
        socketRef.current.emit('door:terminate');
        return;
      }

      // Game mode: send raw keydown events with custom key repeat
      if (gameMode.current && socketRef.current?.connected) {
        // Ignore browser key repeat - we handle our own repeat logic
        if (ev.repeat) {
          ev.preventDefault();
          return;
        }

        const key = ev.key;
        // Only send if key wasn't already pressed (prevents duplicate downs)
        if (!keyState.current[key]) {
          keyState.current[key] = true;
          socketRef.current.emit('key-down', { key, code: ev.code });
          // Start custom key repeat for this key
          startKeyRepeat(key, ev.code);
        }
        ev.preventDefault();
      }
    };

    const handleGameKeyUp = (ev: KeyboardEvent) => {
      // Game mode: send raw keyup events and stop repeat
      if (gameMode.current && socketRef.current?.connected) {
        const key = ev.key;
        if (keyState.current[key]) {
          delete keyState.current[key];
          stopKeyRepeat(key);
          socketRef.current.emit('key-up', { key, code: ev.code });
        }
        ev.preventDefault();
      }
    };

    window.addEventListener('keydown', handleGameKeyDown);
    window.addEventListener('keyup', handleGameKeyUp);

    // Connect to BBS backend
    // In production, start with polling to wake up sleeping servers (Render free tier),
    // then upgrade to WebSocket. In development, prefer WebSocket directly.
    const socket = io(finalBackendUrl, {
      transports: isDevelopment ? ['websocket', 'polling'] : ['polling', 'websocket'],
      timeout: 20000,
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      // Aggressive reconnection to maintain session within 2-minute window
      reconnectionAttempts: isDevelopment ? 5 : 30,
      reconnectionDelay: 1000, // Start with 1 second
      reconnectionDelayMax: isDevelopment ? 3000 : 10000, // Max 10 seconds in prod
      // Random factor to prevent thundering herd on server restart
      randomizationFactor: 0.5,
    });
    socketRef.current = socket;

    // Initialize media handler for audio/video streaming
    const mediaHandler = new MediaHandler(socket);
    mediaHandlerRef.current = mediaHandler;

    // Socket media event handlers
    socket.on('audio:start-streaming', async (options, callback) => {
      try {
        await mediaHandler.startMicrophone(options);
        callback({ success: true, streamId: `audio-${socket.id}` });
      } catch (err: any) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('audio:stop-streaming', (callback) => {
      mediaHandler.stopMicrophone();
      if (typeof callback === 'function') callback();
    });

    socket.on('audio:mute', (data: { muted: boolean }) => {
      mediaHandler.setMuted(data.muted);
    });

    socket.on('audio:volume', (data: { volume: number }) => {
      mediaHandler.setVolume(data.volume);
    });

    socket.on('video:start-stream', async (data, callback) => {
      try {
        const { options } = data;
        await mediaHandler.startVideo(options?.width, options?.height, options?.fps, options?.mode);
        if (typeof callback === 'function') callback({ success: true, streamId: `video-${socket.id}` });
      } catch (err: any) {
        console.error('[MediaHandler] video:start-stream error:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    socket.on('video:stop-stream', (data, callback) => {
      mediaHandler.stopVideo();
      if (typeof callback === 'function') callback({ success: true });
    });

    // Socket event handlers
    socket.on('connect', () => {
      console.log('[Terminal] Connected to BBS backend');
      stopGuruAnimation();

      // Re-enable auto-reconnection if it was disabled by a previous forced disconnect
      if (socket.io.opts.reconnection === false) {
        socket.io.opts.reconnection = true;
        console.log('[CONNECT] Auto-reconnection re-enabled after manual connection');
      }

      // CRITICAL: Reset game mode on new connection to prevent stuck input state
      gameMode.current = false;
      keyState.current = {};
      // Clear key repeat timers
      Object.keys(keyRepeatTimers.current).forEach(key => {
        clearTimeout(keyRepeatTimers.current[key]);
      });
      keyRepeatTimers.current = {};

      // Try session restoration first (if we have a saved session)
      const savedSession = getStoredSessionState();
      if (savedSession && reconnectPending.current) {
        console.log('[Session Persistence] Attempting session restoration for user:', savedSession.username);
        socket.emit('restore-session', savedSession);
        loginState.current = 'logging-in';
      } else if (reconnectPending.current) {
        reconnectPending.current = false;
        attemptTokenLogin();
      }

      if (loginState.current === 'password' && newUserPromptUsername.current && password.current) {
        socket.emit('login', { username: newUserPromptUsername.current, password: password.current });
        loginState.current = 'logging-in';
      }

      // Send initial terminal size to backend (80x25 in fixed mode)
      const { cols, rows } = term;
      socket.emit('terminal-size', { cols, rows });
      console.log(`[Terminal] Sent initial size: ${cols}x${rows}`);

      // Initialize gamepad support
      if (!gamepadManagerRef.current) {
        gamepadManagerRef.current = new GamepadManager({
          onEvent: (event: AnyGamepadEvent) => {
            if (socket.connected) {
              socket.emit('gamepad-event', event);
            }
          },
          config: {
            deadzone: 0.15,
            pollRate: 16,  // 60fps
          },
        });
        gamepadManagerRef.current.start();
        console.log('[Gamepad] Gamepad support initialized');
      }

      onConnect?.();
      term.focus();
    });

    socket.on('connect_error', (error: any) => {
      console.error('[Terminal] Connection error:', error.message);
      startGuruAnimation();

      onConnectionError?.(error);
    });

    socket.on('transfer-raw:init', (payload: any) => {
      beginZmodem(payload?.direction || 'download', payload?.paths || []);
    });

    socket.on('transfer-raw:data', (data: ArrayBuffer | Uint8Array) => {
      if (!zmodemSentry.current) return;
      const view =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : data instanceof Uint8Array
            ? data
            : new Uint8Array(data as any);
      zmodemSentry.current.consume(view);
    });

    socket.on('transfer-raw:complete', () => {
      resetZmodem();
    });

    socket.on('transfer-raw:cancelled', () => {
      resetZmodem();
    });

    // Track pending files for batch upload - send one at a time
    let pendingUploadFiles: File[] = [];
    let currentUploadOptions: { accept?: string; maxSize?: number; multiple?: boolean } | null = null;

    // Helper to upload the next file in the queue
    const uploadNextFile = () => {
      if (pendingUploadFiles.length === 0) {
        console.log('[BBSTerminal] No more files to upload, signaling batch complete');
        socket.emit('upload-batch-complete');
        return;
      }

      const file = pendingUploadFiles.shift()!;
      console.log(`[BBSTerminal] Uploading file: ${file.name} (${pendingUploadFiles.length} remaining)`);

      // Check file size
      if (currentUploadOptions?.maxSize && file.size > currentUploadOptions.maxSize) {
        socket.emit('ansi-output', `\r\n\x1b[31mFile ${file.name} exceeds maximum size of ${currentUploadOptions.maxSize} bytes\x1b[0m\r\n`);
        // Try next file
        uploadNextFile();
        return;
      }

      // Read file as ArrayBuffer
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        // Track upload start time for CPS calculation
        const uploadStartTime = Date.now();

        // Send file data to backend
        socket.emit('file-upload', {
          filename: file.name,
          size: file.size,
          type: file.type,
          data: Array.from(new Uint8Array(arrayBuffer)),
          uploadStartTime  // Include start time for CPS tracking
        });
        // Backend will emit 'show-file-upload' when ready for next file
      };
      reader.readAsArrayBuffer(file);
    };

    // Handle file upload request from backend
    socket.on('show-file-upload', (options: { accept?: string; maxSize?: number; multiple?: boolean; batchContinue?: boolean }) => {
      console.log('[BBSTerminal] show-file-upload event received:', options);

      // If we have pending files from a batch selection, upload the next one
      if (pendingUploadFiles.length > 0) {
        console.log(`[BBSTerminal] Uploading next file from queue (${pendingUploadFiles.length} remaining)`);
        uploadNextFile();
        return;
      }

      // If backend signals batchContinue but we have no pending files, batch is complete
      if (options.batchContinue) {
        console.log('[BBSTerminal] Batch continue received but no pending files, signaling batch complete');
        socket.emit('upload-batch-complete');
        return;
      }

      // Store options for batch uploads
      currentUploadOptions = options;

      // Create a hidden file input element
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = options.accept || '*/*';
      fileInput.multiple = options.multiple || false;
      fileInput.style.display = 'none';

      fileInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        const files = target.files;

        if (!files || files.length === 0) {
          console.log('[BBSTerminal] No files selected');
          socket.emit('upload-cancelled');
          return;
        }

        console.log('[BBSTerminal] Files selected:', files.length);

        // Queue all files for upload
        pendingUploadFiles = Array.from(files);

        // Start uploading the first file
        uploadNextFile();

        // Clean up
        document.body.removeChild(fileInput);
      });

      fileInput.addEventListener('cancel', () => {
        console.log('[BBSTerminal] File selection cancelled');
        socket.emit('upload-cancelled');
        document.body.removeChild(fileInput);
      });

      // Add to DOM and trigger click
      document.body.appendChild(fileInput);
      fileInput.click();
    });

    // Handle file download request from backend
    socket.on('download-file', async (fileInfo: { filename: string; size: number; url: string; path?: string }) => {
      console.log('[BBSTerminal] download-file event received:', fileInfo);

      // Track download start time for CPS calculation
      const downloadStartTime = Date.now();

      // Notify backend that download started
      socket.emit('file-download-started', {
        filename: fileInfo.filename,
        startTime: downloadStartTime
      });

      try {
        // Use fetch to download so we can track completion time
        const response = await fetch(fileInfo.url);
        if (!response.ok) {
          throw new Error(`Download failed: ${response.statusText}`);
        }

        const blob = await response.blob();
        const downloadEndTime = Date.now();
        const durationMs = downloadEndTime - downloadStartTime;

        // Calculate CPS (characters per second)
        const durationSec = durationMs / 1000;
        const cps = durationSec > 0 ? Math.floor(fileInfo.size / durationSec) : 0;

        console.log(`[BBSTerminal] Download complete: ${fileInfo.filename}, ${fileInfo.size} bytes in ${durationMs}ms (${cps} CPS)`);

        // Create download link for the blob
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileInfo.filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);

        // Send completion stats to backend for CPS tracking
        socket.emit('file-download-complete', {
          filename: fileInfo.filename,
          size: fileInfo.size,
          durationMs,
          cps,
          path: fileInfo.path
        });
      } catch (error) {
        console.error('[BBSTerminal] Download error:', error);
        // Fallback to anchor download (won't track CPS)
        const link = document.createElement('a');
        link.href = fileInfo.url;
        link.download = fileInfo.filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });

    // Server-initiated disconnect (e.g., user logged off with G command)
    socket.on('force-disconnect', (data?: { reason?: string }) => {
      console.log('[FORCE-DISCONNECT] Server initiated disconnect:', data?.reason || 'unknown');
      forcedDisconnectRef.current = true;
      // Disable auto-reconnection for this disconnect
      socket.io.opts.reconnection = false;
      console.log('[FORCE-DISCONNECT] Auto-reconnection disabled');
    });

    socket.on('disconnect', (reason: string) => {
      console.log('[DISCONNECT] Client disconnected, reason:', reason);

      // Log disconnect event for debugging
      console.log('[DISCONNECT] Disconnect details:', {
        reason,
        socketId: socket.id,
        loginState: loginState.current,
        forcedDisconnect: forcedDisconnectRef.current,
        timestamp: new Date().toISOString(),
      });

      // Check if this was a server-initiated forced disconnect (logoff)
      if (forcedDisconnectRef.current) {
        console.log('[DISCONNECT] Forced disconnect (logoff) - clearing session state and preventing reconnect');
        localStorage.removeItem('bbs_auth_token');
        clearSessionState();
        reconnectPending.current = false;
        forcedDisconnectRef.current = false;  // Reset flag
        // Auto-reconnection already disabled in force-disconnect handler
      } else if (reason === 'io client disconnect') {
        // User intentionally disconnected - clear everything
        console.log('[DISCONNECT] User-initiated disconnect - clearing session state');
        localStorage.removeItem('bbs_auth_token');
        clearSessionState();
        reconnectPending.current = false;
      } else {
        // Network issue or transport close - preserve session state for restoration
        console.log('[DISCONNECT] Network disconnect - preserving session state for reconnection');
        reconnectPending.current = true;
        loginState.current = 'waiting';
        username.current = '';
        password.current = '';
        // DO NOT clear session state - it will be used on reconnect
      }
      onDisconnect?.(reason);
    });

    const dispatchDoorMessage = (sessionId: string, message: any) => {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new CustomEvent('bbs:door:message', {
        detail: { sessionId, message }
      }));
    };

    const flushDoorMessages = (sessionId: string) => {
      const pending = doorMessageBuffer.current[sessionId];
      if (!pending?.length) {
        return;
      }
      pending.forEach((message) => dispatchDoorMessage(sessionId, message));
      doorMessageBuffer.current[sessionId] = [];
    };

    const handleDoorMessageEvent = (eventName: string, ...args: any[]) => {
      if (!eventName.startsWith('door:message:')) {
        return;
      }
      const sessionId = eventName.replace('door:message:', '');
      const message = args[0];

      if (doorReadyMap.current[sessionId]) {
        dispatchDoorMessage(sessionId, message);
        return;
      }

      if (!doorMessageBuffer.current[sessionId]) {
        doorMessageBuffer.current[sessionId] = [];
      }
      doorMessageBuffer.current[sessionId].push(message);
    };

    socket.onAny(handleDoorMessageEvent);

    // ANSI output handler
    socket.on('ansi-output', (data: string) => {
      // DEBUG: Log first 20 chars of any incoming data to help identify why RIP mode isn't triggering
      if (data.includes('[1!') || data.includes('!|')) {
        console.log(`[Terminal] Incoming possible RIP data (len ${data.length}): ${JSON.stringify(data.slice(0, 50))}`);
      }

      // 1. First, combine with buffers for any OSC sequences from previous chunks
      const overlayPrefix = '\x1b]9999;overlay;';
      let overlayPayload = overlayBufferRef.current + data;
      overlayBufferRef.current = '';

      // Check for web transparency overlay OSC sequences
      const overlayRegex = /\x1b\]9999;overlay;({[^}]*})\x07/g;
      let overlayMatch;
      while ((overlayMatch = overlayRegex.exec(overlayPayload)) !== null) {
        try {
          const overlayData = JSON.parse(overlayMatch[1]);
          setOverlays(prev => {
            const next = new Map(prev);
            if (overlayData.show) {
              next.set(overlayData.id, {
                opacity: overlayData.opacity || 0.5,
                show: true,
                x: overlayData.x,
                y: overlayData.y,
                width: overlayData.width,
                height: overlayData.height,
              });
            } else {
              next.delete(overlayData.id);
            }
            return next;
          });
        } catch (e) {
          console.error('[Overlay] Failed to parse overlay data:', e);
        }
      }
      overlayPayload = overlayPayload.replace(overlayRegex, '');

      // Preserve any incomplete overlay sequence
      const incompleteIndex = overlayPayload.lastIndexOf(overlayPrefix);
      if (incompleteIndex !== -1 && overlayPayload.indexOf('\x07', incompleteIndex) === -1) {
        overlayBufferRef.current = overlayPayload.slice(incompleteIndex);
        overlayPayload = overlayPayload.slice(0, incompleteIndex);
      }

      data = overlayPayload;

      const sfxPrefix = '\x1b]9999;sfx;';
      let sfxPayload = sfxBufferRef.current + data;
      sfxBufferRef.current = '';

      const sfxRegex = /\x1b\]9999;sfx;({[^}]*})\x07/g;
      sfxPayload = sfxPayload.replace(sfxRegex, '');
      const sfxIncompleteIndex = sfxPayload.lastIndexOf(sfxPrefix);
      if (sfxIncompleteIndex !== -1 && sfxPayload.indexOf('\x07', sfxIncompleteIndex) === -1) {
        sfxBufferRef.current = sfxPayload.slice(sfxIncompleteIndex);
        sfxPayload = sfxPayload.slice(0, sfxIncompleteIndex);
      }

      data = sfxPayload;

      // 2. RIP mode detection
      if (data.includes('\x1b[1!') || data.includes('\u001b[1!')) {
        const parts = data.split(/\x1b\[1!|\u001b\[1!/);
        const textBefore = parts[0];
        if (textBefore) {
          if (modemEmulatorRef.current) modemEmulatorRef.current.write(textBefore);
          else term.write(textBefore);
        }

        console.log('[RIP] Entering RIP graphics mode');
        ripModeRef.current = true;
        setRipMode(true);
        ripBuffer.current = '';
        
        const ripContent = parts.slice(1).join('\x1b[1!');
        if (ripContent) {
          if (ripContent.includes('\x1b[2!') || ripContent.includes('\u001b[2!')) {
            const ripParts = ripContent.split(/\x1b\[2!|\u001b\[2!/);
            ripBuffer.current += ripParts[0];
            console.log('[RIP] Exiting RIP graphics mode (within same chunk)');
            ripModeRef.current = false;
            setRipMode(false);
            data = ripParts[1] || '';
          } else {
            ripBuffer.current += ripContent;
            return;
          }
        } else {
          return;
        }
      }
      
      if (ripModeRef.current) {
        if (data.includes('\x1b[2!') || data.includes('\u001b[2!')) {
          const parts = data.split(/\x1b\[2!|\u001b\[2!/);
          ripBuffer.current += parts[0];
          console.log('[RIP] Exiting RIP graphics mode');
          ripModeRef.current = false;
          setRipMode(false);
          data = parts[1] || '';
          if (!data) return;
        } else {
          ripBuffer.current += data;
          return;
        }
      }

      const currentFont = term.options.fontFamily;

      // Use modem emulator for client-side speed throttling
      if (modemEmulatorRef.current) {
        modemEmulatorRef.current.write(data);
      } else {
        term.write(data);
      }
      term.refresh(0, term.rows - 1);
    });

    // PETSCII output handler
    socket.on('petscii-output', (data: string) => {
      console.log('[PETSCII] Received petscii-output, length:', data.length);
      const currentFont = term.options.fontFamily;
      if (!currentFont?.includes('PetMe64')) {
        normalFont.current = currentFont || 'TopazPlus_a1200, "Courier New", monospace';
        console.log('[PETSCII] Saved normal font:', normalFont.current);
      }
      console.log('[PETSCII] Switching font from', currentFont, 'to PetMe64');
      term.options.fontFamily = 'PetMe64, "Courier New", monospace';
      term.write(data);
      term.refresh(0, term.rows - 1);
      console.log('[PETSCII] PETSCII content written to terminal');
    });

    // Modem speed emulation handler
    socket.on('modem-speed', (bps: number) => {
      console.log(`[ModemEmulator] Speed changed to ${bps} bps`);
      if (modemEmulatorRef.current) {
        if (bps > 0) {
          modemEmulatorRef.current.enable(bps);
        } else {
          modemEmulatorRef.current.disable();
        }
      }
    });

    // Terminal resize handler (PETSCII mode uses 40x25)
    socket.on('terminal-resize', (size: { cols: number; rows: number }) => {
      console.log('[Terminal] Resize request:', size.cols, 'x', size.rows);
      term.resize(size.cols, size.rows);
      // For PETSCII mode (40x25), also switch to PetMe64 font
      if (size.cols === 40 && size.rows === 25) {
        const currentFont = term.options.fontFamily;
        if (!currentFont?.includes('PetMe64')) {
          normalFont.current = currentFont || 'TopazPlus_a1200, "Courier New", monospace';
        }
        term.options.fontFamily = 'PetMe64, "Courier New", monospace';
        console.log('[PETSCII] Terminal resized to 40x25, switched to PetMe64 font');
      }
    });

    // Cursor style for mouse hover feedback (CSS cursor property)
    socket.on('cursor-style', (style: string) => {
      if (terminalRef.current) {
        terminalRef.current.style.cursor = style;
      }
    });

    // Terminal mode switching: 'fixed' = 80 cols, 'wide' = responsive
    socket.on('terminal-mode', (mode: 'fixed' | 'wide') => {
      console.log(`[BBSTerminal] *** TERMINAL MODE SWITCH *** Mode: ${mode}`);
      console.log(`[BBSTerminal] Container size before: ${terminalRef.current?.clientWidth}x${terminalRef.current?.clientHeight}px`);
      console.log(`[BBSTerminal] Terminal size before: ${term.cols}x${term.rows}`);

      // Update both local variable and state (state triggers re-render to update container CSS)
      terminalMode = mode;
      setTerminalMode(mode);

      if (mode === 'fixed') {
        // Switching to fixed mode - resize to 80x25 immediately
        term.resize(80, 25);
        if (socketRef.current?.connected) {
          socketRef.current.emit('terminal-size', { cols: 80, rows: 25 });
        }
        console.log(`[BBSTerminal] Switched to fixed mode: 80x25`);
        console.log(`[BBSTerminal] Terminal size after: ${term.cols}x${term.rows}`);
      } else {
        // Switching to wide mode - wait for browser to resize container
        // Use longer delay (500ms) to ensure container finishes resizing
        console.log(`[BBSTerminal] Switched to wide mode - waiting 500ms for container resize...`);
        setTimeout(() => {
          console.log(`[BBSTerminal] Container size after delay: ${terminalRef.current?.clientWidth}x${terminalRef.current?.clientHeight}px`);
          fitTerminal();
          console.log(`[BBSTerminal] Terminal size after: ${term.cols}x${term.rows}`);
        }, 500);
      }
    });

    // RIP mode handler (RIPscrip v1.54 graphics protocol)
    socket.on('rip-mode', (info: { enabled: boolean; width?: number; height?: number }) => {
      console.log('[RIP] Mode changed:', info.enabled ? 'ENABLED' : 'DISABLED');
      setRipMode(info.enabled);
      if (info.enabled) {
        // Initialize RIP canvas when entering RIP mode
        ripBuffer.current = '';
        console.log('[RIP] RIP graphics mode initialized:', info.width || RIP_WIDTH, 'x', info.height || RIP_HEIGHT);
      }
    });

    // Auto-login handlers
    const handleAutoLogin = () => {
      const autoLoginEnabled = localStorage.getItem('bbs_auto_login_enabled') === 'true';
      const savedUsername = localStorage.getItem('bbs_saved_username');
      const savedPassword = localStorage.getItem('bbs_saved_password');

      if (autoLoginEnabled && savedUsername && savedPassword) {
        const decodedUsername = atob(savedUsername);
        const decodedPassword = atob(savedPassword);
        console.log(`🔐 Auto-login enabled, sending credentials for ${decodedUsername}`);
        socket.emit('login', { username: decodedUsername, password: decodedPassword });
        loginState.current = 'logging-in';
        return true;
      }
      return false;
    };

    socket.on('prompt-login', () => {
      // If we're already in the middle of manual login, don't duplicate the prompt
      if (
        loginState.current === 'username' ||
        loginState.current === 'password' ||
        loginState.current === 'checking-username' ||
        loginState.current === 'logging-in'
      ) {
        return;
      }

      // Reset any prior login attempt so manual entry always works.
      // Backend already sent the visible prompt via ansi-output.
      username.current = '';
      password.current = '';
      loginState.current = 'username';
    });

    socket.on('login-success', (data: any) => {
      console.log('Login successful:', data);
      loginState.current = 'loggedin';
      reconnectPending.current = false;

      if (data && data.token) {
        localStorage.setItem(BBS_AUTH_TOKEN_KEY, data.token);
        localStorage.setItem(SHARED_AUTH_TOKEN_KEY, data.token);
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: SHARED_AUTH_TOKEN_KEY,
            newValue: data.token,
            oldValue: null,
          })
        );
      }

      // Save session state for reconnection persistence
      saveSessionState({
        userId: data.userId || data.user?.id || data.user?.userId,
        username: data.username || data.user?.username,
        nodeId: data.nodeId,
        socketId: socket.id,
        currentConf: data.currentConf,
      });

      const autoLoginEnabled = localStorage.getItem('bbs_auto_login_enabled') === 'true';
      if (autoLoginEnabled && newUserPromptUsername.current) {
        const encodedUsername = btoa(newUserPromptUsername.current);
        const encodedPassword = btoa(password.current || '');
        localStorage.setItem('bbs_saved_username', encodedUsername);
        localStorage.setItem('bbs_saved_password', encodedPassword);
        console.log('[Quick Connect] Credentials saved for future auto-login');
      }

      socket.emit('get-font-preference');
      term.focus();
    });

    socket.on('session-restored', (data: any) => {
      console.log('[Session Persistence] Session restored successfully:', data);
      loginState.current = 'loggedin';
      reconnectPending.current = false;

      // Update session state with new socket ID
      saveSessionState({
        userId: data.userId || data.user?.id || data.user?.userId,
        username: data.username || data.user?.username,
        nodeId: data.nodeId,
        socketId: socket.id,
        currentConf: data.currentConf,
      });

      term.write('\r\n\x1b[32m[Session Restored] Welcome back!\x1b[0m\r\n');
      term.focus();
    });

    socket.on('session-restore-failed', (reason: string) => {
      console.log('[Session Persistence] Session restoration failed:', reason);
      clearSessionState();
      reconnectPending.current = false;
      // Fall back to token login
      if (!attemptTokenLogin()) {
        loginState.current = 'waiting';
      }
    });

    socket.on('login-failed', (data: string | { reason: string; retryFrom?: 'username' | 'password' }) => {
      // Handle both old string format and new object format
      const reason = typeof data === 'string' ? data : data.reason;
      const retryFrom = typeof data === 'object' ? data.retryFrom : 'username';

      console.log('Login failed:', reason, 'retryFrom:', retryFrom);
      localStorage.removeItem('bbs_auth_token');
      clearSessionState();
      const autoLoginEnabled = localStorage.getItem('bbs_auto_login_enabled') === 'true';
      if (autoLoginEnabled) {
        localStorage.removeItem('bbs_saved_username');
        localStorage.removeItem('bbs_saved_password');
        term.write('\r\n\x1b[33m[Quick Connect] Saved credentials cleared due to login failure\x1b[0m\r\n');
      }

      // If retrying from password, keep username and wait for prompt-password event
      // If retrying from username (default), clear everything and go back to username prompt
      if (retryFrom === 'password') {
        // Keep username, just clear password - prompt-password event will set state
        password.current = '';
      } else {
        // Go back to username entry
        loginState.current = 'username';
        username.current = '';
        password.current = '';
      }
    });

    socket.on('user-not-found', (data: { username: string; prompt: string }) => {
      term.write('\x1b[33m' + data.prompt + '\x1b[0m');
      loginState.current = 'new-user-prompt';
      newUserPromptUsername.current = data.username;
      username.current = '';
    });

    socket.on('retry-login', (data?: { prefillUsername?: string }) => {
      loginState.current = 'username';
      // Prefill username if provided (e.g., when user presses R to retry after "user not found")
      username.current = data?.prefillUsername || '';
      password.current = '';
      passwordResetInput.current = '';
      passwordMode.current = false;
    });

    socket.on('prompt-password', () => {
      loginState.current = 'password';
      password.current = '';
      term.write('Password: ');
    });

    socket.on('password-mode', (enabled: boolean) => {
      passwordMode.current = enabled;
    });

    // Password reset flow - express.e:29152-29213
    socket.on('prompt-password-reset', (data: { state: string }) => {
      console.log('[PasswordReset] Entering password reset mode:', data.state);
      loginState.current = 'password-reset';
      passwordResetInput.current = '';
      // mask-input controls whether to echo or mask characters
    });

    socket.on('mask-input', (enabled: boolean) => {
      console.log('[PasswordReset] Mask input:', enabled);
      passwordMode.current = enabled;
    });

    socket.on('door-active', (active: boolean) => {
      console.log('[BBSTerminal] door-active received:', active);
      doorActive.current = active;
      console.log('[BBSTerminal] doorActive.current set to:', doorActive.current);
    });

    // Game mode: bypass OS key repeat for real-time game controls
    socket.on('game-mode', (enabled: boolean) => {
      gameMode.current = enabled;
      // Clear key states and repeat timers when switching modes
      keyState.current = {};
      // Stop all key repeat timers
      Object.keys(keyRepeatTimers.current).forEach(key => {
        clearTimeout(keyRepeatTimers.current[key]);
      });
      keyRepeatTimers.current = {};
    });

    socket.on('door:load-client', async (data: { doorId: string; sessionId: string; bundleUrl: string; manifest: any }) => {
      console.log(`[ClientDoor] Loading door: ${data.doorId}`);

      const doorName = data.manifest?.name || data.doorId;
      term.write(`\r\n\x1b[36mLoading ${doorName}...\x1b[0m\r\n`);
      doorActive.current = true;
      doorReadyMap.current[data.sessionId] = false;
      if (!doorMessageBuffer.current[data.sessionId]) {
        doorMessageBuffer.current[data.sessionId] = [];
      }

      // Expose BBS connection to client doors
      (window as any).__BBS__ = {
        socket,
        sessionId: data.sessionId,
        backendUrl: finalBackendUrl
      };

      // Ensure we do not keep stale scripts around
      const scriptId = `door-${data.doorId}`;
      const existingScript = document.getElementById(scriptId);
      if (existingScript) {
        existingScript.remove();
      }

      const script = document.createElement('script');
      script.id = scriptId;
      script.src = data.bundleUrl.startsWith('http')
        ? data.bundleUrl
        : `${finalBackendUrl}${data.bundleUrl}`;
      script.type = 'text/javascript';

      script.onload = () => {
        console.log(`[ClientDoor] Bundle loaded successfully: ${data.doorId}`);
        term.write('\x1b[32m[OK] Door bundle loaded\x1b[0m\r\n');
        doorReadyMap.current[data.sessionId] = true;
        flushDoorMessages(data.sessionId);
      };

      script.onerror = (error) => {
        console.error(`[ClientDoor] Failed to load bundle:`, error);
        term.write('\r\n\x1b[31mError loading door bundle\x1b[0m\r\n');
        doorActive.current = false;
        delete (window as any).__BBS__;
        const failedScript = document.getElementById(scriptId);
        if (failedScript && failedScript.parentNode) {
          failedScript.parentNode.removeChild(failedScript);
        }
        delete doorScripts.current[data.sessionId];
        delete doorReadyMap.current[data.sessionId];
        delete doorMessageBuffer.current[data.sessionId];
      };

      doorScripts.current[data.sessionId] = script;
      document.body.appendChild(script);
    });

    socket.on('door:unload-client', (data: { doorId: string; sessionId?: string }) => {
      const scriptId = `door-${data.doorId}`;
      const script = document.getElementById(scriptId) || doorScripts.current[data.sessionId || ''] || null;
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (data.sessionId) {
        delete doorScripts.current[data.sessionId];
        delete doorReadyMap.current[data.sessionId];
        delete doorMessageBuffer.current[data.sessionId];
      }
      if ((window as any).__BBS__?.sessionId === data.sessionId) {
        delete (window as any).__BBS__;
      }
      doorActive.current = false;
      term.write(`\r\n\x1b[32mDoor closed\x1b[0m\r\n`);
    });

    socket.on('set-font', (fontName: string) => {
      console.log('[Font] Received set-font event:', fontName);
      const fontMetrics: Record<string, { size: number; lineHeight: number }> = {
        'mosoul': { size: 16, lineHeight: 1.2 },
        'MicroKnight': { size: 16, lineHeight: 1.2 },
        'MicroKnightPlus': { size: 16, lineHeight: 1.2 },
        'P0T-NOoDLE': { size: 16, lineHeight: 1.2 },
        'Topaz_a500': { size: 16, lineHeight: 1.2 },
        'Topaz_a1200': { size: 16, lineHeight: 1.2 },
        'TopazPlus_a500': { size: 16, lineHeight: 1.2 },
        'TopazPlus_a1200': { size: 16, lineHeight: 1.2 }
      };

      const metrics = fontMetrics[fontName] || { size: 16, lineHeight: 1.2 };
      const fontFamily = `${fontName}, "Courier New", monospace`;

      // Update both the terminal options and the normalFont ref
      term.options.fontFamily = fontFamily;
      term.options.fontSize = metrics.size;
      term.options.lineHeight = metrics.lineHeight;
      normalFont.current = fontFamily;

      console.log('[Font] Applied font:', fontName, 'size:', metrics.size, 'lineHeight:', metrics.lineHeight);
    });

    // Handle font preference loaded from database on login
    socket.on('font-preference', (data: { font: string }) => {
      console.log('[Font Preference] Received saved preference:', data.font);
      const fontMetrics: Record<string, { size: number; lineHeight: number }> = {
        'mosoul': { size: 16, lineHeight: 1.2 },
        'MicroKnight': { size: 16, lineHeight: 1.2 },
        'MicroKnightPlus': { size: 16, lineHeight: 1.2 },
        'P0T-NOoDLE': { size: 16, lineHeight: 1.2 },
        'Topaz_a500': { size: 16, lineHeight: 1.2 },
        'Topaz_a1200': { size: 16, lineHeight: 1.2 },
        'TopazPlus_a500': { size: 16, lineHeight: 1.2 },
        'TopazPlus_a1200': { size: 16, lineHeight: 1.2 }
      };

      const fontName = data.font;
      const metrics = fontMetrics[fontName] || { size: 16, lineHeight: 1.2 };
      const fontFamily = `${fontName}, "Courier New", monospace`;

      // Update both the terminal options and the normalFont ref
      term.options.fontFamily = fontFamily;
      term.options.fontSize = metrics.size;
      term.options.lineHeight = metrics.lineHeight;
      normalFont.current = fontFamily;

      console.log('[Font Preference] Applied saved font:', fontName, 'size:', metrics.size, 'lineHeight:', metrics.lineHeight);
    });

    // Keyboard input handling
    term.onKey(({ key, domEvent }) => {
      if (!socket.connected) {
        console.error('❌ Socket not connected, cannot send key');
        return;
      }

      // Handle login input locally
      if (loginState.current === 'checking-username' || loginState.current === 'logging-in') {
        return;
      }

      if (loginState.current === 'username') {
        if (key === '\r' || key === '\n') {
          console.log('🔐 Username entered:', username.current);
          socket.emit('check-username', { username: username.current });
          loginState.current = 'checking-username';
          term.write('\r\n');
        } else if (key === '\x7f' || key === '\b') {
          if (username.current.length > 0) {
            username.current = username.current.slice(0, -1);
            term.write('\b \b');
          }
        } else if (key.length === 1 && key >= ' ') {
          username.current += key;
          term.write(key);
        }
        return;
      }

      if (loginState.current === 'password') {
        if (key === '\r' || key === '\n') {
          console.log('🔐 Password entered, sending login');
          socket.emit('login', { username: username.current, password: password.current });
          loginState.current = 'logging-in';
          term.write('\r\n');
        } else if (key === '\x7f' || key === '\b') {
          if (password.current.length > 0) {
            password.current = password.current.slice(0, -1);
            term.write('\b \b');
          }
        } else if (key.length === 1 && key >= ' ') {
          password.current += key;
          term.write(passwordMode.current ? key : '*');
        }
        return;
      }

      // Handle password reset flow - express.e:29152-29213
      if (loginState.current === 'password-reset') {
        if (key === '\r' || key === '\n') {
          console.log('[PasswordReset] Sending input:', passwordResetInput.current.length > 0 ? '(has input)' : '(empty)');
          socket.emit('password-reset-input', { input: passwordResetInput.current });
          term.write('\r\n');
          passwordResetInput.current = '';
        } else if (key === '\x7f' || key === '\b') {
          if (passwordResetInput.current.length > 0) {
            passwordResetInput.current = passwordResetInput.current.slice(0, -1);
            term.write('\b \b');
          }
        } else if (key.length === 1 && key >= ' ') {
          passwordResetInput.current += key;
          // passwordMode controls whether to show * or the actual character
          term.write(passwordMode.current ? '*' : key);
        }
        return;
      }

      // Handle new user prompt
      if (loginState.current === 'new-user-prompt') {
        const promptUser = newUserPromptUsername.current || username.current || '';
        const sendResponse = (response: string) => {
          socket.emit('new-user-response', { response, username: promptUser });
        };

        if (key === '\r' || key === '\n') {
          term.write('\r\n');
          sendResponse('');
          // Delay state change so onData (which fires after onKey) still sees
          // 'new-user-prompt' and skips this keystroke - prevents double echo
          setTimeout(() => { loginState.current = 'registering'; }, 0);
        } else {
          const lower = key.toLowerCase();
          if (lower === 'c') {
            // Echo character only - backend sends the newline with next prompt
            // express.e:6845 lineInput echoes char, then adds \b\n after
            term.write('C');
            sendResponse('C');
            // Delay state change so onData still sees 'new-user-prompt' and skips
            setTimeout(() => { loginState.current = 'registering'; }, 0);
          } else if (lower === 'r') {
            // Echo character only - backend sends \r\nUsername: which provides newline
            term.write('R');
            sendResponse('R');
            // Delay state change so onData still sees 'new-user-prompt' and skips
            setTimeout(() => { loginState.current = 'username'; }, 0);
            username.current = '';
            password.current = '';
          } else {
            term.write('\r\n\x1b[33mPress R to retry or C to continue as a new user\x1b[0m\r\n');
          }
        }
        return;
      }
    });

    // Send all other input directly to the backend (doors/commands)
    term.onData((data: string) => {
      if (!socket.connected) {
        console.error('[Terminal] Socket not connected, cannot send data');
        return;
      }
      // In game mode, keydown/keyup events are sent separately - skip onData
      if (gameMode.current) {
        return;
      }
      if (
        loginState.current === 'username' ||
        loginState.current === 'password' ||
        loginState.current === 'new-user-prompt' ||
        loginState.current === 'checking-username' ||
        loginState.current === 'logging-in' ||
        loginState.current === 'password-reset'
        // Note: 'registering' removed - server handles registration input including pause prompts
      ) {
        return;
      }
      // Ctrl+C (0x03) while door is active: terminate the door
      if (data === '\x03' && doorActive.current) {
        console.log('[BBSTerminal] Ctrl+C pressed while door active - sending door:terminate');
        term.write('\r\n\x1b[33m[Aborting door...]\x1b[0m\r\n');
        socket.emit('door:terminate');
        return;
      }
      socket.emit('command', data);
    });

    // Focus terminal on mount
    term.focus();

    // Cleanup
    return () => {
      mediaHandlerRef.current?.destroy();
      if (gamepadManagerRef.current) {
        gamepadManagerRef.current.stop();
        gamepadManagerRef.current = null;
      }
      socket.disconnect();
      socket.offAny(handleDoorMessageEvent);
      term.dispose();
      terminalInstance.current = null;
      socketRef.current = null;
      doorReadyMap.current = {};
      doorMessageBuffer.current = {};
      doorScripts.current = {};
      transferState.current = { direction: null, paths: [] };
      gameMode.current = false;
      keyState.current = {};
      // Clear all key repeat timers
      Object.keys(keyRepeatTimers.current).forEach(key => {
        clearTimeout(keyRepeatTimers.current[key]);
      });
      keyRepeatTimers.current = {};
      window.removeEventListener('keydown', handleGameKeyDown);
      window.removeEventListener('keyup', handleGameKeyUp);
      // Clean up wheel handler
      if (terminalRef.current) {
        const handler = (terminalRef.current as any)._wheelHandler;
        const element = (terminalRef.current as any)._wheelElement;
        if (handler && element) {
          element.removeEventListener('wheel', handler);
        }
      }
      // Clean up resize handlers
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      // Clear resize throttle timers
      if (resizeThrottleTimer) {
        clearTimeout(resizeThrottleTimer);
      }
      if (resizeTrailingTimer) {
        clearTimeout(resizeTrailingTimer);
      }
      if (transferTimeout.current) {
        clearTimeout(transferTimeout.current);
        transferTimeout.current = null;
      }
      stopGuruAnimation();
    };
  }, [fontSize, backendUrl, showConnectionError, onConnectionError, onConnect, onDisconnect]);

  // Handle fontSize changes
  useEffect(() => {
    if (terminalInstance.current) {
      terminalInstance.current.options.fontSize = fontSize;
    }
  }, [fontSize]);

  // Focus terminal when clicking anywhere in the window
  // This ensures keyboard input always goes to the terminal
  useEffect(() => {
    const handleWindowClick = () => {
      terminalInstance.current?.focus();
    };

    window.addEventListener('click', handleWindowClick);
    return () => {
      window.removeEventListener('click', handleWindowClick);
    };
  }, []);

  // Focus terminal when clicked
  const handleClick = () => {
    terminalInstance.current?.focus();
    // Audio is now handled by MediaHandler (initialized on audio:play-sfx socket event)
  };

  // Calculate terminal cell coordinates from mouse event
  const getTerminalCoordsFromPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const term = terminalInstance.current;
    if (!term || !terminalRef.current) return null;

    // Get the viewport element (where cells are rendered)
    const viewport = terminalRef.current.querySelector('.xterm-screen');
    if (!viewport) return null;

    const rect = viewport.getBoundingClientRect();
    const cellWidth = rect.width / term.cols;
    const cellHeight = rect.height / term.rows;

    // Calculate cell position (0-indexed)
    const x = Math.floor((clientX - rect.left) / cellWidth);
    const y = Math.floor((clientY - rect.top) / cellHeight);

    // Clamp to valid range
    return {
      x: Math.max(0, Math.min(term.cols - 1, x)),
      y: Math.max(0, Math.min(term.rows - 1, y))
    };
  };

  const getTerminalCoords = (event: React.MouseEvent): { x: number; y: number } | null =>
    getTerminalCoordsFromPoint(event.clientX, event.clientY);

  // Mouse event handlers for game mode / doors
  const handleMouseDown = (event: React.MouseEvent) => {
    // Only send mouse events when door is active or in game mode
    if (!doorActive.current && !gameMode.current) return;

    const socket = socketRef.current;
    if (!socket?.connected) return;

    const coords = getTerminalCoords(event);
    if (!coords) return;

    mouseButtonDown.current = true;
    console.log('[BBSTerminal] mouseButtonDown set to:', mouseButtonDown.current);

    socket.emit('mouse-click', {
      x: coords.x,
      y: coords.y,
      button: event.button,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      alt: event.altKey
    });
  };

  const handleMouseUp = (event: React.MouseEvent) => {
    if (!mouseButtonDown.current) return;

    mouseButtonDown.current = false;

    const socket = socketRef.current;
    if (!socket?.connected) return;

    const coords = getTerminalCoords(event);
    if (!coords) return;

    socket.emit('mouse-up', {
      x: coords.x,
      y: coords.y,
      button: event.button,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      alt: event.altKey
    });
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    // Only send mouse events when door is active or in game mode
    if (!doorActive.current && !gameMode.current) return;

    const socket = socketRef.current;
    if (!socket?.connected) return;

    const coords = getTerminalCoords(event);
    if (!coords) return;

    console.log('[BBSTerminal] mousemove: mouseButtonDown=', mouseButtonDown.current, 'event.buttons=', event.buttons);

    if (mouseButtonDown.current) {
      // Dragging - send drag event
      console.log('[BBSTerminal] Emitting mouse-drag');
      socket.emit('mouse-drag', {
        x: coords.x,
        y: coords.y,
        button: event.buttons === 1 ? 0 : event.buttons === 2 ? 2 : event.buttons === 4 ? 1 : 0,
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey
      });
    } else {
      // Hovering - throttle to ~60fps (16ms) to avoid flooding
      const now = Date.now();
      if (now - lastMouseHoverTime.current < 16) return;
      lastMouseHoverTime.current = now;

      socket.emit('mouse-hover', {
        x: coords.x,
        y: coords.y,
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey
      });
    }
  };

  const handleWheel = (event: React.WheelEvent) => {
    if (!doorActive.current && !gameMode.current) return;

    const socket = socketRef.current;
    if (!socket?.connected) return;

    const coords = getTerminalCoordsFromPoint(event.clientX, event.clientY);
    if (!coords) return;

    event.preventDefault();
    socket.emit('mouse-wheel', {
      x: coords.x,
      y: coords.y,
      deltaY: event.deltaY,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      alt: event.altKey
    });
  };

  // Prevent browser context menu when door is active (allows app to use right-click)
  const handleContextMenu = (event: React.MouseEvent) => {
    if (doorActive.current || gameMode.current) {
      event.preventDefault();
    }
  };

  // Handle RIP canvas click to send commands back to BBS
  const handleRipCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = ripCanvasRef.current;
    const socket = socketRef.current;
    if (!canvas || !socket) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = RIP_WIDTH / rect.width;
    const scaleY = RIP_HEIGHT / rect.height;
    const x = Math.floor((event.clientX - rect.left) * scaleX);
    const y = Math.floor((event.clientY - rect.top) * scaleY);

    console.log(`[RIP] Canvas click at ${x}, ${y}`);
    // In a full implementation, we would check mouse regions here
    // For now, just log the click
  }, []);

  return (
    <div
      className={`min-h-screen w-full ${terminalMode === 'fixed' ? 'flex items-center justify-center' : ''} ${className}`}
      style={{
        backgroundColor: '#000000',
        overflow: 'hidden', // Prevent scrollbars
        height: '100vh', // Explicit height for flex centering
        // In wide mode: use absolute positioning to break out of parent flex centering
        // In fixed mode: relative positioning for normal layout
        position: terminalMode === 'wide' ? 'absolute' : 'relative',
        ...(terminalMode === 'wide' && {
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
        }),
      }}
    >
      <div
        ref={terminalRef}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { mouseButtonDown.current = false; }}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        tabIndex={0}
        style={{
          overflow: 'hidden',
          position: 'relative',
          outline: 'none',
          width: '100%',
          // In fixed mode: auto height for centering, max-width constraint
          // In wide mode: 100% height to fill screen
          ...(terminalMode === 'fixed' ? { maxWidth: '960px' } : { height: '100%' }),
        }}
      />
      {/* Web Transparency Overlays - CSS-based overlays for web connections */}
      {Array.from(overlays.entries()).map(([id, overlay]) => {
        // Calculate pixel position from terminal cell coordinates
        const terminalEl = terminalRef.current;
        const xtermScreen = terminalEl?.querySelector('.xterm-screen');
        const rect = xtermScreen?.getBoundingClientRect();
        const termRect = terminalEl?.getBoundingClientRect();

        // Calculate cell dimensions
        const cols = 80;
        const rows = 24;
        const cellWidth = rect ? rect.width / cols : 0;
        const cellHeight = rect ? rect.height / rows : 0;

        // Calculate offset from terminal container to xterm-screen
        const offsetLeft = rect && termRect ? rect.left - termRect.left : 0;
        const offsetTop = rect && termRect ? rect.top - termRect.top : 0;

        // Determine overlay position and size (default to full screen if not specified)
        const hasPosition = overlay.x !== undefined && overlay.y !== undefined &&
                           overlay.width !== undefined && overlay.height !== undefined;

        const style: React.CSSProperties = hasPosition ? {
          position: 'absolute',
          left: offsetLeft + (overlay.x! * cellWidth),
          top: offsetTop + (overlay.y! * cellHeight),
          width: overlay.width! * cellWidth,
          height: overlay.height! * cellHeight,
          backgroundColor: `rgba(0, 0, 0, ${overlay.opacity})`,
          pointerEvents: 'none',
          zIndex: 100,
        } : {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: `rgba(0, 0, 0, ${overlay.opacity})`,
          pointerEvents: 'none',
          zIndex: 100,
        };

        console.log('[Overlay] Rendering overlay:', id, 'opacity:', overlay.opacity,
          'hasPosition:', hasPosition, 'pos:', { x: overlay.x, y: overlay.y, w: overlay.width, h: overlay.height },
          'cellSize:', { cellWidth, cellHeight });

        return (
          <div
            key={id}
            style={style}
          />
        );
      })}
      {/* RIP Graphics Canvas Overlay */}
      {ripMode && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10,
            backgroundColor: '#000',
            border: '2px solid #555',
            boxShadow: '0 0 20px rgba(0,0,0,0.8)',
          }}
        >
          <canvas
            ref={ripCanvasRef}
            width={RIP_WIDTH}
            height={RIP_HEIGHT}
            onClick={handleRipCanvasClick}
            style={{
              imageRendering: 'pixelated',
              cursor: 'pointer',
              display: 'block',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '5px',
              right: '5px',
              backgroundColor: '#333',
              color: '#0f0',
              padding: '2px 6px',
              fontSize: '10px',
              fontFamily: 'monospace',
              borderRadius: '3px',
            }}
          >
            RIP Graphics
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
    </div>
  );
});

// Add display name for debugging
BBSTerminal.displayName = 'BBSTerminal';
