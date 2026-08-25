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
  /**
   * When set, overrides server 'terminal-mode' events.
   * Pass 'wide' on mobile so FitAddon controls columns.
   */
  forcedMode?: 'fixed' | 'wide';
  /**
   * When true, the terminal refocuses itself whenever it loses focus.
   * Use for full-screen BBS mode where input must always be captured.
   */
  keepFocused?: boolean;
}

export interface BBSTerminalRef {
  focus: () => void;
  sendCommand: (command: string) => void;
  /** Feed raw BBS key data through the correct path for the current terminal state.
   *  During login states (username/password/etc.) replicates onKey handler logic directly.
   *  Post-login uses term.input() which fires onData → socket. */
  injectInput: (data: string) => void;
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
  forcedMode,
  keepFocused,
}, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // Always-current refs so socket handlers see the latest values without dep-array reinit
  const forcedModeRef = useRef(forcedMode);
  forcedModeRef.current = forcedMode;
  const keepFocusedRef = useRef(keepFocused);
  keepFocusedRef.current = keepFocused;
  // Tracks the current calibrated font size so set-font / font-preference events
  // don't override the mobile-calibrated size with the hardcoded desktop 16px value.
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;

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
    'password-reset' |
    'forced-pwd-change'
  >('waiting');
  const passwordResetInput = useRef<string>('');      // Buffer for email-based password reset input
  const forcedPwdChangeInput = useRef<string>('');   // Buffer for forced-change-at-login input
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
  // Pointer-lock virtual pointer (game mode): while the lock holds, real
  // clientX/Y freeze and movementX/Y carry the deltas - this ref is the
  // accumulated position the game keeps steering with.
  const lockedPointer = useRef<{ x: number; y: number } | null>(null);
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
    exclude?: { x: number; y: number; width: number; height: number };
  }>>(new Map());
  const overlayBufferRef = useRef<string>('');
  const ripCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ripBuffer = useRef<string>(''); // Buffer for RIP commands
  const zmodemSession = useRef<any | null>(null);
  const pendingUploadFiles = useRef<File[]>([]);
  // When the server emits `transfer-raw:init` with direction='upload'
  // we DEFER arming the Sentry until the user picks a file. This kills
  // the ZACK→ZFILE race where rz's post-ZACK timeout (~1s, not affected
  // by `-t`) was firing before the OS file picker returned control.
  const pendingZmodemInit = useRef<{ direction: 'upload' | 'download'; paths: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const transferTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gamepadManagerRef = useRef<GamepadManager | null>(null);
  const musicPlayerRef = useRef<HTMLAudioElement | null>(null);  // Background music player (for doors like GRANDMASTER)
  const mouseTrackingDisabledRef = useRef<boolean>(false); // Ctrl+Shift+M toggle state

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
    // Prefer sessionStorage — each tab keeps its own token so two tabs logged in
    // as different users don't overwrite each other's token in localStorage.
    return (
      sessionStorage.getItem(SHARED_AUTH_TOKEN_KEY) ||
      sessionStorage.getItem(BBS_AUTH_TOKEN_KEY) ||
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
    sessionStorage.removeItem(BBS_AUTH_TOKEN_KEY);
    sessionStorage.removeItem(SHARED_AUTH_TOKEN_KEY);
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
      if (pendingZmodemInit.current) {
        socketRef.current?.emit('transfer-raw:cancel');
        pendingZmodemInit.current = null;
      } else {
        zmodemSession.current?.close?.();
      }
      return;
    }
    // Deferred path: user picked file before Sentry was armed. Arm
    // now — beginZmodem will emit `transfer-raw:start`, backend
    // spawns rz, ZRQINIT/ZRINIT/ZSINIT/ZACK/ZFILE all flow in one
    // burst with no user-pick stall.
    if (pendingZmodemInit.current) {
      const init = pendingZmodemInit.current;
      pendingZmodemInit.current = null;
      console.log(`[ZMODEM] file picked (${files.length} file(s)); arming Sentry and starting handshake`);
      beginZmodem(init.direction, init.paths);
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
      const u8 = new Uint8Array(octets);
      // Per-call hex preview was invaluable while debugging the
      // ZACK → ZFILE byte path race, but it fires for every header
      // the Send session emits during a transfer — noisy at any real
      // file size. Set `window.__ZMODEM_DEBUG__ = true` in the
      // console to re-enable.
      if ((window as any).__ZMODEM_DEBUG__) {
        console.log(
          `[ZMODEM] sender ${u8.length}B → server: ${Array.from(u8.slice(0, 24)).map((b) => b.toString(16).padStart(2, '0')).join(' ')}${u8.length > 24 ? ' ...' : ''}`,
        );
      }
      socket.emit('transfer-raw:data', u8);
    };

    console.log(`[ZMODEM] beginZmodem direction=${direction} paths=`, paths);
    zmodemSentry.current = new Zmodem.Sentry({
      to_terminal: (data: any) => {
        if ((window as any).__ZMODEM_DEBUG__) {
          console.log('[ZMODEM] to_terminal bytes:', data?.length, data?.slice?.(0, 32));
        }
      },
      on_detect: (det: any) => {
        console.log('[ZMODEM] on_detect fired:', det);
        handleZmodemDetection(det);
      },
      on_retract: () => {
        console.log('[ZMODEM] on_retract');
      },
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
    injectInput: (data: string) => {
      const term = terminalInstance.current;
      const socket = socketRef.current;
      if (!term) return;

      // During login states onData is explicitly blocked — replicate onKey logic directly.
      if (loginState.current === 'username') {
        if (data === '\r' || data === '\n') {
          socket?.emit('check-username', { username: username.current });
          loginState.current = 'checking-username';
          term.write('\r\n');
        } else if (data === '\x7f' || data === '\x08') {
          if (username.current.length > 0) {
            username.current = username.current.slice(0, -1);
            term.write('\b \b');
          }
        } else if (data.length === 1 && data >= ' ') {
          username.current += data;
          term.write(data);
        }
        return;
      }

      if (loginState.current === 'password') {
        if (data === '\r' || data === '\n') {
          socket?.emit('login', { username: username.current, password: password.current });
          loginState.current = 'logging-in';
          term.write('\r\n');
        } else if (data === '\x7f' || data === '\x08') {
          if (password.current.length > 0) {
            password.current = password.current.slice(0, -1);
            term.write('\b \b');
          }
        } else if (data.length === 1 && data >= ' ') {
          password.current += data;
          term.write(passwordMode.current ? data : '*');
        }
        return;
      }

      if (loginState.current === 'password-reset') {
        if (data === '\r' || data === '\n') {
          socket?.emit('password-reset-input', { input: passwordResetInput.current });
          term.write('\r\n');
          passwordResetInput.current = '';
        } else if (data === '\x7f' || data === '\x08') {
          if (passwordResetInput.current.length > 0) {
            passwordResetInput.current = passwordResetInput.current.slice(0, -1);
            term.write('\b \b');
          }
        } else if (data.length === 1 && data >= ' ') {
          passwordResetInput.current += data;
          term.write(passwordMode.current ? '*' : data);
        }
        return;
      }

      if (loginState.current === 'forced-pwd-change') {
        if (data === '\r' || data === '\n') {
          socket?.emit('forced-pwd-change-input', { input: forcedPwdChangeInput.current });
          term.write('\r\n');
          forcedPwdChangeInput.current = '';
        } else if (data === '\x7f' || data === '\x08') {
          if (forcedPwdChangeInput.current.length > 0) {
            forcedPwdChangeInput.current = forcedPwdChangeInput.current.slice(0, -1);
            term.write('\b \b');
          }
        } else if (data.length === 1 && data >= ' ') {
          forcedPwdChangeInput.current += data;
          term.write('*'); // always mask during forced change
        }
        return;
      }

      if (loginState.current === 'new-user-prompt') {
        const promptUser = newUserPromptUsername.current || username.current || '';
        const sendResponse = (response: string) => {
          socket?.emit('new-user-response', { response, username: promptUser });
        };
        if (data === '\r' || data === '\n') {
          term.write('\r\n');
          sendResponse('');
          setTimeout(() => { loginState.current = 'registering'; }, 0);
        } else if (data.length === 1) {
          term.write(data + '\r\n');
          sendResponse(data);
          setTimeout(() => { loginState.current = 'registering'; }, 0);
        }
        return;
      }

      // checking-username / logging-in: BBS is processing, discard input
      if (loginState.current === 'checking-username' || loginState.current === 'logging-in') {
        return;
      }

      // Post-login: fire onData → socket (normal path, not blocked outside login states)
      term.input(data, true);
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

    // xterm.js 5.5.0 registers touchstart with {passive:true} but calls
    // preventDefault() inside it, producing console warnings. Intercept
    // addEventListener on this element before open() so touchstart is
    // forced non-passive.
    const el = terminalRef.current;
    const _origAddEvent = el.addEventListener.bind(el);
    el.addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === 'touchstart' && options && typeof options === 'object' && options.passive) {
        options = { ...options, passive: false };
      }
      _origAddEvent(type, listener, options);
    };
    term.open(el);
    el.addEventListener = _origAddEvent; // restore immediately after open()
    terminalInstance.current = term;

    // When keepFocused is set, auto-refocus whenever the terminal loses focus.
    // Cooldown prevents a blur→focus→blur infinite loop on iOS.
    // relatedTarget===null means focus moved to browser chrome (address bar, etc.) —
    // don't steal it back on desktop. On mobile, always refocus (iOS often returns null
    // relatedTarget even for in-page focus changes).
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    let lastRefocus = 0;
    term.textarea?.addEventListener('blur', (e: FocusEvent) => {
      if (!keepFocusedRef.current) return;
      if (!isMobileDevice && !e.relatedTarget) return; // browser chrome took focus — respect it
      const now = Date.now();
      if (now - lastRefocus < 200) return;
      lastRefocus = now;
      requestAnimationFrame(() => {
        if (document.visibilityState === 'visible' && document.activeElement !== term.textarea) {
          term.focus();
        }
      });
    });

    // Custom keyboard handler for Shift+Arrow keys (for text selection in doors)
    // xterm.js doesn't send proper escape sequences for Shift+Arrow by default
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Block Ctrl/Cmd+Shift+M from reaching xterm (handled by window listener)
      const modKey = event.ctrlKey || event.metaKey;
      if (modKey && event.shiftKey && (event.key === 'M' || event.key === 'm')) {
        return false;
      }

      // When mouse tracking is disabled, handle Cmd/Ctrl+C (copy) and Cmd/Ctrl+A (select all)
      // via xterm's own API since browser native selection doesn't work in xterm canvas
      if (mouseTrackingDisabledRef.current && modKey && event.type === 'keydown') {
        if (event.key === 'a' || event.key === 'A') {
          term.selectAll();
          return false;
        }
        if (event.key === 'c' || event.key === 'C') {
          const selection = term.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection).then(() => {
              console.log('[BBSTerminal] Copied to clipboard:', selection.length, 'chars');
            });
          }
          return false;
        }
      }

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

    // Global keydown listener for Ctrl/Cmd+Shift+M mouse toggle
    // Must be on window because xterm.js may not pass modifier combos to attachCustomKeyEventHandler
    const mouseToggleHandler = (event: KeyboardEvent) => {
      const modKey = event.ctrlKey || event.metaKey;
      if (modKey && event.shiftKey && (event.key === 'M' || event.key === 'm')) {
        event.preventDefault();
        event.stopPropagation();
        mouseTrackingDisabledRef.current = !mouseTrackingDisabledRef.current;
        if (mouseTrackingDisabledRef.current) {
          term.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l');
          console.log('[BBSTerminal] Mouse tracking DISABLED (Ctrl+Shift+M)');
        } else {
          term.write('\x1b[?1000h\x1b[?1002h\x1b[?1006h');
          console.log('[BBSTerminal] Mouse tracking ENABLED (Ctrl+Shift+M)');
        }
      }
    };
    window.addEventListener('keydown', mouseToggleHandler, true);

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
    // Default to 'fixed' for BBS compatibility; forcedModeRef overrides on mobile
    let terminalMode: 'fixed' | 'wide' = forcedModeRef.current ?? 'fixed';

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

    // Track pressed keys in normal mode for stuck-key detection
    const normalPressedKeys = new Map<string, number>(); // code -> first press timestamp
    const blockedKeys = new Set<string>(); // keys blocked until real keyup
    const MAX_NORMAL_REPEAT_MS = 5000; // max ms before we assume key is stuck (normal mode only)

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

      // Normal mode: detect stuck keys using repeat duration
      const keyId = ev.code || ev.key;

      if (ev.type === 'keydown') {
        // If this key was blocked as stuck, suppress until real keyup
        if (blockedKeys.has(keyId)) {
          ev.preventDefault();
          return false;
        }

        if (ev.repeat) {
          // Check if this key has been repeating too long
          const firstPress = normalPressedKeys.get(keyId);
          if (firstPress && Date.now() - firstPress > MAX_NORMAL_REPEAT_MS) {
            // Key has been "held" for too long - likely stuck
            blockedKeys.add(keyId);
            normalPressedKeys.delete(keyId);
            ev.preventDefault();
            return false;
          }
        } else {
          // Fresh keydown - record timestamp, unblock if previously blocked
          normalPressedKeys.set(keyId, Date.now());
          blockedKeys.delete(keyId);
        }
      } else if (ev.type === 'keyup') {
        // Key released - clear all tracking
        normalPressedKeys.delete(keyId);
        blockedKeys.delete(keyId);
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

    // Clear all key state and repeat timers (used on blur/visibility loss)
    const clearAllKeyState = () => {
      // Game mode: send key-up for all held keys so backend knows they're released
      if (gameMode.current) {
        for (const key of Object.keys(keyState.current)) {
          if (keyState.current[key] && socketRef.current?.connected) {
            socketRef.current.emit('key-up', { key, code: '' });
          }
          stopKeyRepeat(key);
        }
        keyState.current = {};
      }
      // Normal mode: clear tracked keys to prevent stale repeat detection
      normalPressedKeys.clear();
    };

    // Prevent stuck keys: clear state when window loses focus or tab becomes hidden
    const handleWindowBlur = () => clearAllKeyState();
    const handleVisibilityChange = () => {
      if (document.hidden) clearAllKeyState();
    };
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Connect to BBS backend
    // WebSocket first everywhere, with polling kept as an automatic
    // fallback. Production used to START on long-polling to wake sleeping
    // free-tier servers, which meant every keystroke rode an HTTP request
    // until the upgrade completed - unusable for an action game. socket.io
    // falls back on its own if the WebSocket handshake fails.
    const socket = io(finalBackendUrl, {
      transports: ['websocket', 'polling'],
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

    // Background music handlers (for doors like GRANDMASTER)
    socket.on('audio:music', (data: { track: string; loop: boolean; volume: number; file: string }) => {
      // Skip if a client door bundle is loaded - the door handles its own audio
      if (doorActive.current) return;

      // Stop any existing music
      if (musicPlayerRef.current) {
        musicPlayerRef.current.pause();
        musicPlayerRef.current.src = '';
      }

      // Create new audio element
      const audio = new Audio(data.file);
      audio.loop = data.loop;
      audio.volume = Math.max(0, Math.min(1, data.volume));

      audio.play().catch((err) => {
        console.error('[BBSTerminal] Music playback failed:', err);
      });

      musicPlayerRef.current = audio;
      console.log(`[BBSTerminal] Started playing music: ${data.track} (loop: ${data.loop}, volume: ${data.volume})`);
    });

    socket.on('audio:music:stop', () => {
      // Skip if a client door bundle is loaded - the door handles its own audio
      if (doorActive.current) return;

      if (musicPlayerRef.current) {
        musicPlayerRef.current.pause();
        musicPlayerRef.current.src = '';
        musicPlayerRef.current = null;
        console.log('[BBSTerminal] Stopped music');
      }
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

      // Try session restoration first (if we have a saved session).
      // Do NOT flip loginState to 'logging-in' here — if the server decides
      // the restore can't happen (e.g. after a backend restart), it will
      // emit `session-restore-failed` AFTER already starting its fresh
      // welcome/ANSI-prompt sequence. Any keypress during that window
      // would be dropped by onData's logging-in guard. Stay in 'waiting'
      // until we've actually submitted credentials; session-restored will
      // jump us straight to 'loggedin' on success.
      const savedSession = getStoredSessionState();
      if (savedSession && reconnectPending.current) {
        console.log('[Session Persistence] Attempting session restoration for user:', savedSession.username);
        socket.emit('restore-session', savedSession);
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
      const direction = (payload?.direction || 'download') as 'upload' | 'download';
      const paths: string[] = payload?.paths || [];
      // Upload path: pop the OS file picker BEFORE arming the Sentry
      // (and therefore before the backend spawns rz). Once a file is
      // chosen, handleFileInputChange arms the Sentry and emits
      // transfer-raw:start, which fires the backend handshake and
      // spawns rz. Result: ZRQINIT/ZRINIT/ZSINIT/ZACK/ZFILE all flow
      // in one tight burst with no user-pick stall.
      if (direction === 'upload' && pendingUploadFiles.current.length === 0) {
        pendingZmodemInit.current = { direction, paths };
        console.log('[ZMODEM] deferring beginZmodem; opening file picker first');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
          fileInputRef.current.click();
        } else {
          // Fallback: arm immediately and let detection click the picker.
          pendingZmodemInit.current = null;
          beginZmodem(direction, paths);
        }
        return;
      }
      beginZmodem(direction, paths);
    });

    socket.on('transfer-raw:data', (data: ArrayBuffer | Uint8Array) => {
      if (!zmodemSentry.current) {
        // The arrival-without-Sentry log STAYS unconditional — it
        // surfaces "Sentry not armed yet" timing regressions that
        // would otherwise silently drop bytes.
        console.warn('[ZMODEM] transfer-raw:data arrived but no Sentry armed; dropping', data);
        return;
      }
      const view =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : data instanceof Uint8Array
            ? data
            : new Uint8Array(data as any);
      if ((window as any).__ZMODEM_DEBUG__) {
        console.log(
          `[ZMODEM] consume ${view.length}B: ${Array.from(view.slice(0, 16)).map((b: any) => b.toString(16).padStart(2, '0')).join(' ')}`,
        );
      }
      try {
        zmodemSentry.current.consume(view);
      } catch (err) {
        console.error('[ZMODEM] consume threw:', err);
      }
    });

    socket.on('transfer-raw:complete', () => {
      resetZmodem();
    });

    socket.on('transfer-raw:cancelled', () => {
      resetZmodem();
    });

    // Track pending files for batch upload - send one at a time
    let legacyBatchQueue: File[] = [];
    let currentUploadOptions: { accept?: string; maxSize?: number; multiple?: boolean; uploadUrl?: string; fieldName?: string } | null = null;

    // Helper to upload the next file in the queue.
    //
    // Uploads go via HTTP multipart POST to /api/upload (multer endpoint,
    // see web/backend/src/server/file-routes.ts). Multer saves the file
    // to playpen and returns {filename, path, size}; we then emit a small
    // 'file-upload-ready' socket event with that metadata so the backend
    // runs processFileUpload on the already-saved file.
    //
    // Why not socket.emit the binary directly? socket.io serializes the
    // payload as JSON, so each byte becomes a 1-3 char number plus a comma
    // — average ~3x inflation. A 10MB upload became ~30MB on the wire and
    // tripped maxHttpBufferSize (#11). The HTTP route stays binary the
    // whole way.
    const uploadNextFile = async () => {
      if (legacyBatchQueue.length === 0) {
        console.log('[BBSTerminal] No more files to upload, signaling batch complete');
        socket.emit('upload-batch-complete');
        return;
      }

      const file = legacyBatchQueue.shift()!;
      console.log(`[BBSTerminal] Uploading file: ${file.name} (${legacyBatchQueue.length} remaining)`);

      if (currentUploadOptions?.maxSize && file.size > currentUploadOptions.maxSize) {
        socket.emit('ansi-output', `\r\n\x1b[31mFile ${file.name} exceeds maximum size of ${currentUploadOptions.maxSize} bytes\x1b[0m\r\n`);
        uploadNextFile();
        return;
      }

      const uploadStartTime = Date.now();
      const uploadUrl = currentUploadOptions?.uploadUrl || '/api/upload';
      const fieldName = currentUploadOptions?.fieldName || 'file';

      const form = new FormData();
      form.append(fieldName, file, file.name);

      try {
        const res = await fetch(uploadUrl, { method: 'POST', body: form });
        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          socket.emit('ansi-output', `\r\n\x1b[31mUpload failed (${res.status}): ${text}\x1b[0m\r\n`);
          // Move on so we don't wedge the queue
          uploadNextFile();
          return;
        }
        const result: { filename: string; originalname: string; size: number; path: string } = await res.json();
        socket.emit('file-upload-ready', {
          filename: result.filename,
          originalname: result.originalname,
          size: result.size,
          path: result.path,
          uploadStartTime,
        });
        // Backend processes the file then emits 'show-file-upload' for the next
        // file in the batch (or 'upload-batch-complete' is signaled when empty).
      } catch (err: any) {
        socket.emit('ansi-output', `\r\n\x1b[31mUpload error: ${err?.message || err}\x1b[0m\r\n`);
        uploadNextFile();
      }
    };

    // Handle file upload request from backend
    socket.on('show-file-upload', (options: { accept?: string; maxSize?: number; multiple?: boolean; batchContinue?: boolean }) => {
      console.log('[BBSTerminal] show-file-upload event received:', options);

      // If we have pending files from a batch selection, upload the next one
      if (legacyBatchQueue.length > 0) {
        console.log(`[BBSTerminal] Uploading next file from queue (${legacyBatchQueue.length} remaining)`);
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
        legacyBatchQueue = Array.from(files);

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
                exclude: overlayData.exclude,
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

      // Strip mouse enable sequences when user has toggled mouse tracking off
      // This prevents blessed screen.render() from re-enabling mouse capture
      let output = data;
      if (mouseTrackingDisabledRef.current) {
        output = output.replace(/\x1b\[\?(1000|1002|1003|1006)h/g, '');
      }

      // Use modem emulator for client-side speed throttling
      if (modemEmulatorRef.current) {
        modemEmulatorRef.current.write(output);
      } else {
        term.write(output);
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

    // Modem speed emulation handler.
    // NB: bps === 0 used to mean "disable throttling entirely", which let
    // xterm.js paint a full 80×25 screen in a single ~16ms frame and made
    // transient screens flash past unreadably. ModemEmulator.enable() now
    // soft-caps bps=0 to MAX_SOFT_CAP_BPS (230400) so MAX still feels
    // snappy but full-screen updates paint over ~87ms instead of 16ms.
    // Always route through enable() to get that behaviour.
    socket.on('modem-speed', (bps: number) => {
      console.log(`[ModemEmulator] Speed changed to ${bps} bps`);
      if (modemEmulatorRef.current) {
        modemEmulatorRef.current.enable(bps);
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
      // forcedModeRef overrides server command (e.g. mobile forces 'wide')
      const effectiveMode = forcedModeRef.current ?? mode;
      console.log(`[BBSTerminal] *** TERMINAL MODE SWITCH *** server: ${mode}, effective: ${effectiveMode}`);
      console.log(`[BBSTerminal] Container size before: ${terminalRef.current?.clientWidth}x${terminalRef.current?.clientHeight}px`);
      console.log(`[BBSTerminal] Terminal size before: ${term.cols}x${term.rows}`);

      // Update both local variable and state (state triggers re-render to update container CSS)
      terminalMode = effectiveMode;
      setTerminalMode(effectiveMode);

      if (effectiveMode === 'fixed') {
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
        // Write to sessionStorage so this tab always reconnects as this user,
        // even if another tab logs in as someone else and overwrites localStorage.
        sessionStorage.setItem(BBS_AUTH_TOKEN_KEY, data.token);
        sessionStorage.setItem(SHARED_AUTH_TOKEN_KEY, data.token);
        // Also write to localStorage for initial auto-login on new tabs.
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

    // Forced password change flow - express.e:29785-29845
    // Triggered when the server detects forcePwdReset=1 or PASSWORD_EXPIRY_DAYS has elapsed.
    socket.on('prompt-forced-pwd-change', () => {
      console.log('[ForcedPwdChange] Entering forced password change mode');
      loginState.current = 'forced-pwd-change';
      forcedPwdChangeInput.current = '';
      // mask-input will be set true by the server immediately after this event
    });

    // Server signals that the forced password change succeeded and the BBS session
    // is continuing normally (bulletin flow starting).
    socket.on('forced-pwd-change-complete', () => {
      console.log('[ForcedPwdChange] Password changed successfully, resuming BBS session');
      loginState.current = 'loggedin';
      forcedPwdChangeInput.current = '';
    });

    socket.on('mask-input', (enabled: boolean) => {
      console.log('[PasswordReset] Mask input:', enabled);
      passwordMode.current = enabled;
    });

    socket.on('door-active', (active: boolean) => {
      console.log('[BBSTerminal] door-active received:', active);
      doorActive.current = active;
      // Skip the modem soft-cap while a door is running — door output
      // should feel instant. The pacing is for BBS navigation only.
      modemEmulatorRef.current?.setDoorActive(active);
    });

    // Game mode: bypass OS key repeat for real-time game controls
    // Game-mode pointer tracking lives on WINDOW, not the terminal div:
    // slipping off the canvas mid-game must not drop paddle control. With
    // the pointer lock held, movementX/Y accumulate into a virtual
    // position; without it, page-wide coordinates clamp into the grid.
    const gameWindowMouseMove = (event: MouseEvent) => {
      if (!gameMode.current) return;

      if (document.pointerLockElement) {
        const rect = terminalRef.current?.getBoundingClientRect();
        const virtual = lockedPointer.current ?? {
          x: rect ? rect.left + rect.width / 2 : event.clientX,
          y: rect ? rect.top + rect.height / 2 : event.clientY,
        };
        virtual.x += event.movementX;
        virtual.y += event.movementY;
        // Keep the virtual pointer inside the terminal so full mouse travel
        // maps onto full paddle travel without unbounded overshoot.
        if (rect) {
          virtual.x = Math.max(rect.left, Math.min(rect.right - 1, virtual.x));
          virtual.y = Math.max(rect.top, Math.min(rect.bottom - 1, virtual.y));
        }
        lockedPointer.current = virtual;
        emitPointerMove(virtual.x, virtual.y, {
          buttons: event.buttons,
          shift: event.shiftKey,
          ctrl: event.ctrlKey,
          alt: event.altKey
        });
        return;
      }

      // Unlocked: track anywhere over the page. The container's own React
      // handler also fires when the pointer is over the terminal, but the
      // shared hover throttle collapses the duplicate.
      emitPointerMove(event.clientX, event.clientY, {
        buttons: event.buttons,
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey
      });
    };
    window.addEventListener('mousemove', gameWindowMouseMove);

    socket.on('game-mode', (enabled: boolean) => {
      gameMode.current = enabled;
      // Clear key states and repeat timers when switching modes
      keyState.current = {};
      // Stop all key repeat timers
      Object.keys(keyRepeatTimers.current).forEach(key => {
        clearTimeout(keyRepeatTimers.current[key]);
      });
      keyRepeatTimers.current = {};

      // Real-time games own the pointer: hide it over the playfield and
      // keep xterm from starting a text selection on click-drag. Game-mode
      // doors receive mouse input through our socket events on the parent
      // container, so cutting pointer events to the xterm layer changes
      // nothing for them - while blessed TUI doors (not game mode) keep
      // xterm's native mouse tracking and text selection untouched.
      const xtermEl = terminalRef.current?.querySelector('.xterm') as HTMLElement | null;
      if (xtermEl) {
        xtermEl.style.pointerEvents = enabled ? 'none' : '';
      }
      if (terminalRef.current) {
        terminalRef.current.style.cursor = enabled ? 'none' : '';
        terminalRef.current.style.userSelect = enabled ? 'none' : '';
        (terminalRef.current.style as any).webkitUserSelect = enabled ? 'none' : '';
      }
      if (enabled) {
        term.clearSelection();
      } else {
        lockedPointer.current = null;
        if (document.pointerLockElement) {
          document.exitPointerLock?.();
        }
      }
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
      // Bundles are built with esbuild --format=esm. As a classic script
      // that only works while the bundle avoids module-only syntax; the
      // SDK TrackerEngine's chiptune3 player uses import.meta.url (to find
      // its AudioWorklet next to the bundle), which is a SyntaxError
      // outside a module. Module scripts still fire onload/onerror.
      script.type = 'module';

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
      // Amiga bitmap fonts render gapless at 1.0 — pipe / box-drawing
      // chars are designed to connect vertically across rows. Any value
      // above 1.0 inserts a visible gap that breaks the ASCII art.
      // Unknown fonts fall back to 1.0 too; the BBS catalog only ships
      // bitmap fonts in this picker.
      const lineHeightMap: Record<string, number> = {
        'mosoul': 1.0, 'MicroKnight': 1.0, 'MicroKnightPlus': 1.0,
        'P0T-NOoDLE': 1.0, 'Topaz_a500': 1.0, 'Topaz_a1200': 1.0,
        'TopazPlus_a500': 1.0, 'TopazPlus_a1200': 1.0,
      };
      const fontFamily = `${fontName}, "Courier New", monospace`;
      const lineHeight = lineHeightMap[fontName] ?? 1.0;
      // Use calibrated size (fontSizeRef) — never override with hardcoded 16 on mobile
      const size = fontSizeRef.current;
      term.options.fontFamily = fontFamily;
      term.options.fontSize = size;
      term.options.lineHeight = lineHeight;
      normalFont.current = fontFamily;
      console.log('[Font] Applied font:', fontName, 'size:', size, 'lineHeight:', lineHeight);
    });

    // Handle font preference loaded from database on login
    socket.on('font-preference', (data: { font: string }) => {
      console.log('[Font Preference] Received saved preference:', data.font);
      // See set-font handler above — bitmap fonts render gapless at 1.0.
      const lineHeightMap: Record<string, number> = {
        'mosoul': 1.0, 'MicroKnight': 1.0, 'MicroKnightPlus': 1.0,
        'P0T-NOoDLE': 1.0, 'Topaz_a500': 1.0, 'Topaz_a1200': 1.0,
        'TopazPlus_a500': 1.0, 'TopazPlus_a1200': 1.0,
      };
      const fontName = data.font;
      const fontFamily = `${fontName}, "Courier New", monospace`;
      const lineHeight = lineHeightMap[fontName] ?? 1.0;
      // Use calibrated size (fontSizeRef) — never override with hardcoded 16 on mobile
      const size = fontSizeRef.current;
      term.options.fontFamily = fontFamily;
      term.options.fontSize = size;
      term.options.lineHeight = lineHeight;
      normalFont.current = fontFamily;
      console.log('[Font Preference] Applied saved font:', fontName, 'size:', size, 'lineHeight:', lineHeight);
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

      // Handle forced password change flow - express.e:29785-29845
      if (loginState.current === 'forced-pwd-change') {
        if (key === '\r' || key === '\n') {
          console.log('[ForcedPwdChange] Sending input:', forcedPwdChangeInput.current.length > 0 ? '(has input)' : '(empty)');
          socket.emit('forced-pwd-change-input', { input: forcedPwdChangeInput.current });
          term.write('\r\n');
          forcedPwdChangeInput.current = '';
        } else if (key === '\x7f' || key === '\b') {
          if (forcedPwdChangeInput.current.length > 0) {
            forcedPwdChangeInput.current = forcedPwdChangeInput.current.slice(0, -1);
            term.write('\b \b');
          }
        } else if (key.length === 1 && key >= ' ') {
          forcedPwdChangeInput.current += key;
          // Always mask: passwords are never echoed during forced change
          term.write('*');
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
        loginState.current === 'password-reset' ||
        loginState.current === 'forced-pwd-change'
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
      window.removeEventListener('mousemove', gameWindowMouseMove);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
      window.removeEventListener('keydown', mouseToggleHandler, true);
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
  // fontSize intentionally omitted from deps — live changes are handled by the
  // separate fontSize useEffect below, so font size updates never trigger reinit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, showConnectionError, onConnectionError, onConnect, onDisconnect]);

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

    // With the pointer lock held the event's clientX/Y are frozen at the
    // lock point - the virtual pointer is where the player actually is.
    const point = document.pointerLockElement && lockedPointer.current
      ? lockedPointer.current
      : { x: event.clientX, y: event.clientY };
    const coords = getTerminalCoordsFromPoint(point.x, point.y);
    if (!coords) return;

    mouseButtonDown.current = true;

    // The click is the game input - it goes out FIRST, unconditionally.
    // The pointer lock below is an enhancement, and requestPointerLock can
    // throw synchronously (permissions policy, unsupported) or reject as a
    // promise; when it sat above this emit, a failed lock swallowed every
    // menu click.
    socket.emit('mouse-click', {
      x: coords.x,
      y: coords.y,
      button: event.button,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      alt: event.altKey
    });

    // Game mode: lock the pointer to the terminal on the first click.
    // Locked, the mouse cannot stray off the playfield mid-game - the OS
    // pointer is captured and movement arrives as deltas that the window
    // listener below steers with. Esc releases the lock (browser UI);
    // the next click re-arms it.
    if (gameMode.current && !document.pointerLockElement && terminalRef.current) {
      lockedPointer.current = { x: event.clientX, y: event.clientY };
      try {
        const result: any = terminalRef.current.requestPointerLock?.();
        // Newer Chrome returns a promise; a rejection (e.g. the browser
        // refuses re-lock too soon after an Esc exit) must not surface as
        // an unhandled error.
        result?.catch?.(() => { lockedPointer.current = null; });
      } catch {
        lockedPointer.current = null;
      }
    }
  };

  const handleMouseUp = (event: React.MouseEvent) => {
    if (!mouseButtonDown.current) return;

    mouseButtonDown.current = false;

    const socket = socketRef.current;
    if (!socket?.connected) return;

    // Same substitution as handleMouseDown: locked events carry clientX/Y
    // frozen at the lock origin. Doors move on mouse-up too (arkanoid
    // steers the paddle on every event type), so a release at the left
    // edge must not teleport the paddle to wherever the lock began.
    const point = document.pointerLockElement && lockedPointer.current
      ? lockedPointer.current
      : { x: event.clientX, y: event.clientY };
    const coords = getTerminalCoordsFromPoint(point.x, point.y);
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

  /**
   * Shared pointer-move emitter for both event paths: the container's React
   * handler and the game-mode window listener. getTerminalCoordsFromPoint
   * clamps into the grid, so a pointer anywhere on the page still steers.
   */
  const emitPointerMove = (
    clientX: number,
    clientY: number,
    modifiers: { buttons: number; shift: boolean; ctrl: boolean; alt: boolean }
  ) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;

    const coords = getTerminalCoordsFromPoint(clientX, clientY);
    if (!coords) return;

    if (mouseButtonDown.current) {
      if ((window as any).__MOUSE_DEBUG__) {
        console.log('[BBSTerminal] Emitting mouse-drag');
      }
      socket.emit('mouse-drag', {
        x: coords.x,
        y: coords.y,
        button: modifiers.buttons === 1 ? 0 : modifiers.buttons === 2 ? 2 : modifiers.buttons === 4 ? 1 : 0,
        shift: modifiers.shift,
        ctrl: modifiers.ctrl,
        alt: modifiers.alt
      });
    } else {
      // Hovering - throttle to ~60fps (16ms) to avoid flooding
      const now = Date.now();
      if (now - lastMouseHoverTime.current < 16) return;
      lastMouseHoverTime.current = now;

      socket.emit('mouse-hover', {
        x: coords.x,
        y: coords.y,
        shift: modifiers.shift,
        ctrl: modifiers.ctrl,
        alt: modifiers.alt
      });
    }
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    // Only send mouse events when door is active or in game mode
    if (!doorActive.current && !gameMode.current) return;

    // While the pointer lock holds, the window-level game listener owns
    // movement; the frozen clientX/Y here would fight the virtual pointer.
    if (document.pointerLockElement) return;

    const coords = getTerminalCoords(event);
    if (!coords) return;

    // Mouse-move logging sits on the hot path: a door game gets one of these
    // per pointer sample (60+/s) and each console.log is real main-thread work
    // competing with the terminal renderer. Opt in with
    // `window.__MOUSE_DEBUG__ = true` when tracing pointer plumbing.
    if ((window as any).__MOUSE_DEBUG__) {
      console.log('[BBSTerminal] mousemove: mouseButtonDown=', mouseButtonDown.current, 'event.buttons=', event.buttons);
    }

    emitPointerMove(event.clientX, event.clientY, {
      buttons: event.buttons,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      alt: event.altKey
    });
  };

  const handleWheel = (event: React.WheelEvent) => {
    if (!doorActive.current && !gameMode.current) return;

    const socket = socketRef.current;
    if (!socket?.connected) return;

    const wheelPoint = document.pointerLockElement && lockedPointer.current
      ? lockedPointer.current
      : { x: event.clientX, y: event.clientY };
    const coords = getTerminalCoordsFromPoint(wheelPoint.x, wheelPoint.y);
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

        const bg = `rgba(0, 0, 0, ${overlay.opacity})`;
        const base: React.CSSProperties = { position: 'absolute', backgroundColor: bg, pointerEvents: 'none', zIndex: 100 };

        // If a modal cutout is specified, render 4 strips around it instead of one
        // full-screen div so the modal terminal content is not dimmed by CSS.
        if (overlay.exclude && cellWidth > 0 && cellHeight > 0) {
          const ex = overlay.exclude;
          const ox = offsetLeft + ((overlay.x ?? 0) * cellWidth);
          const oy = offsetTop  + ((overlay.y ?? 0) * cellHeight);
          const ow = (overlay.width  ?? cols) * cellWidth;
          const oh = (overlay.height ?? rows) * cellHeight;
          const mx = offsetLeft + (ex.x * cellWidth);
          const my = offsetTop  + (ex.y * cellHeight);
          const mw = ex.width  * cellWidth;
          const mh = ex.height * cellHeight;
          return (
            <React.Fragment key={id}>
              {/* Top strip */}
              <div style={{ ...base, left: ox, top: oy, width: ow, height: my - oy }} />
              {/* Bottom strip */}
              <div style={{ ...base, left: ox, top: my + mh, width: ow, height: (oy + oh) - (my + mh) }} />
              {/* Left strip (beside modal) */}
              <div style={{ ...base, left: ox, top: my, width: mx - ox, height: mh }} />
              {/* Right strip (beside modal) */}
              <div style={{ ...base, left: mx + mw, top: my, width: (ox + ow) - (mx + mw), height: mh }} />
            </React.Fragment>
          );
        }

        const style: React.CSSProperties = hasPosition ? {
          ...base,
          left: offsetLeft + (overlay.x! * cellWidth),
          top: offsetTop + (overlay.y! * cellHeight),
          width: overlay.width! * cellWidth,
          height: overlay.height! * cellHeight,
        } : {
          ...base,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        };

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
