import React, { useEffect, useRef, forwardRef, useImperativeHandle, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { io, Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';
import { XTERM_CONFIG } from '../utils/terminal-utils';
import Zmodem from 'zmodem.js/src/zmodem_browser';

// RIP Graphics types (inline to avoid package dependency)
const RIP_WIDTH = 640;
const RIP_HEIGHT = 350;

const SHARED_AUTH_TOKEN_KEY = 'authToken';
const BBS_AUTH_TOKEN_KEY = 'bbs_auth_token';

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
}, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Login state tracking
  const loginState = useRef<'waiting' | 'username' | 'password' | 'new-user-prompt' | 'registering' | 'loggedin' | 'checking-username'>('waiting');
  const username = useRef<string>('');
  const password = useRef<string>('');
  const newUserPromptUsername = useRef<string>('');
  const passwordMode = useRef<boolean>(false);
  const doorActive = useRef<boolean>(false);
  const doorReadyMap = useRef<Record<string, boolean>>({});
  const doorMessageBuffer = useRef<Record<string, any[]>>({});
  const doorScripts = useRef<Record<string, HTMLScriptElement | null>>({});
  const keyState = useRef<Record<string, boolean>>({});
  const gameMode = useRef<boolean>(false);  // When true, send raw keydown/keyup events
  const mouseButtonDown = useRef<boolean>(false);  // Track mouse button state for drag events
  const lastMouseHoverTime = useRef<number>(0);  // Throttle hover events
  const normalFont = useRef<string>('mosoul, "Courier New", monospace');
  const transferState = useRef<{ direction: 'upload' | 'download' | null; paths?: string[] }>({
    direction: null,
    paths: [],
  });
  const zmodemSentry = useRef<any | null>(null);

  // RIP Graphics state
  const [ripMode, setRipMode] = useState<boolean>(false);

  // Web transparency overlays (CSS-based, for web connections only)
  const [overlays, setOverlays] = useState<Map<string, { opacity: number; show: boolean }>>(new Map());
  const ripCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ripBuffer = useRef<string>(''); // Buffer for RIP commands
  const zmodemSession = useRef<any | null>(null);
  const pendingUploadFiles = useRef<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const transferTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const getStoredSharedToken = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return (
      localStorage.getItem(SHARED_AUTH_TOKEN_KEY) ||
      localStorage.getItem(BBS_AUTH_TOKEN_KEY)
    );
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
      loginState.current = 'checking-username';
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

    // Initialize xterm.js terminal for BBS connection (fixed 80x24 for BBS compatibility)
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
      rows: 24, // Standard BBS screen height
    });

    term.open(terminalRef.current);
    terminalInstance.current = term;

    // Load canvas addon for better performance
    const canvasAddon = new CanvasAddon();
    term.loadAddon(canvasAddon);

    // Custom key event handler - intercepts keys before xterm processes them
    // This is critical for game mode because xterm normally intercepts all keys
    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      // In game mode, emit key-down/key-up events and prevent xterm from processing
      if (gameMode.current && socketRef.current?.connected) {
        if (ev.type === 'keydown') {
          // Ignore browser key repeat - we handle our own
          if (ev.repeat) {
            return false; // Prevent xterm from processing
          }
          const key = ev.key;
          if (!keyState.current[key]) {
            keyState.current[key] = true;
            socketRef.current.emit('key-down', { key, code: ev.code });
          }
          return false; // Prevent xterm from processing (we handle it)
        } else if (ev.type === 'keyup') {
          const key = ev.key;
          if (keyState.current[key]) {
            delete keyState.current[key];
            socketRef.current.emit('key-up', { key, code: ev.code });
          }
          return false; // Prevent xterm from processing
        }
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

    // Game mode keyboard handlers - bypass OS key repeat delay
    const handleGameKeyDown = (ev: KeyboardEvent) => {
      // Handle transfer cancel
      if (transferState.current.direction && ev.key === 'Escape') {
        ev.preventDefault();
        cancelTransfer();
        return;
      }

      // Game mode: send raw keydown events (no key repeat!)
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
        }
        ev.preventDefault();
      }
    };

    const handleGameKeyUp = (ev: KeyboardEvent) => {
      // Game mode: send raw keyup events
      if (gameMode.current && socketRef.current?.connected) {
        const key = ev.key;
        if (keyState.current[key]) {
          delete keyState.current[key];
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
      reconnectionAttempts: isDevelopment ? 3 : 15,
      reconnectionDelay: 2000,
      reconnectionDelayMax: isDevelopment ? 5000 : 15000,
    });
    socketRef.current = socket;

    // Socket event handlers
    socket.on('connect', () => {
      console.log('[Terminal] Connected to BBS backend');
      // CRITICAL: Reset game mode on new connection to prevent stuck input state
      gameMode.current = false;
      keyState.current = {};
      if (loginState.current === 'password' && newUserPromptUsername.current && password.current) {
        socket.emit('login', { username: newUserPromptUsername.current, password: password.current });
        loginState.current = 'loggedin';
      }
      onConnect?.();
      term.focus();
    });

    socket.on('connect_error', (error: any) => {
      console.error('❌ BBS Terminal: Connection error:', error.message);

      if (showConnectionError) {
        term.clear();
        term.writeln('\r\n\x1b[36m╔══════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
        term.writeln('\x1b[36m║                                                                              ║\x1b[0m');
        const bannerMessage = 'BBS Backend Connection Failed';
        const interiorWidth = 78;
        const leftPadding = Math.max(0, Math.floor((interiorWidth - bannerMessage.length) / 2));
        const rightPadding = Math.max(0, interiorWidth - bannerMessage.length - leftPadding);
        term.writeln(
          `\x1b[36m║${' '.repeat(leftPadding)}\x1b[31m${bannerMessage}\x1b[36m${' '.repeat(rightPadding)}║\x1b[0m`
        );
        term.writeln('\x1b[36m║                                                                              ║\x1b[0m');
        term.writeln('\x1b[36m╚══════════════════════════════════════════════════════════════════════════════╝\x1b[0m');
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

    socket.on('disconnect', (reason: string) => {
      console.log('🔌 BBS Terminal: Disconnected:', reason);
      if (reason === 'io client disconnect') {
        localStorage.removeItem('bbs_auth_token');
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
      // Debug: Check if data contains OSC 9999 sequence
      if (data.includes('9999') || data.includes('overlay')) {
        console.log('[Overlay] Raw data contains potential overlay command, length:', data.length);
        console.log('[Overlay] Raw data hex:', Array.from(data.slice(0, 100)).map(c => c.charCodeAt(0).toString(16)).join(' '));
      }

      // Check for web transparency overlay OSC sequences
      // Format: ESC ] 9999 ; overlay ; <json> BEL
      const overlayRegex = /\x1b\]9999;overlay;({[^}]+})\x07/g;
      let overlayMatch;
      while ((overlayMatch = overlayRegex.exec(data)) !== null) {
        try {
          const overlayData = JSON.parse(overlayMatch[1]);
          console.log('[Overlay] Parsed overlay command:', overlayData);
          setOverlays(prev => {
            const next = new Map(prev);
            if (overlayData.show) {
              next.set(overlayData.id, { opacity: overlayData.opacity || 0.5, show: true });
            } else {
              next.delete(overlayData.id);
            }
            console.log('[Overlay] Updated overlays map, size:', next.size);
            return next;
          });
        } catch (e) {
          console.error('[Overlay] Failed to parse overlay data:', e, 'Match:', overlayMatch[1]);
        }
      }
      // Strip overlay sequences from output (they shouldn't display as text)
      data = data.replace(overlayRegex, '');

      // Check for RIP mode escape codes (express.e:25679-25683)
      // [1! = Enter RIP pixel/graphics mode
      // [2! = Return to RIP text mode
      if (data.includes('\x1b[1!') || data.includes('[1!')) {
        console.log('[RIP] Entering RIP graphics mode');
        setRipMode(true);
        // Strip the escape code and continue processing
        data = data.replace(/\x1b?\[1!/g, '');
      }
      if (data.includes('\x1b[2!') || data.includes('[2!')) {
        console.log('[RIP] Exiting RIP graphics mode');
        setRipMode(false);
        // Strip the escape code and continue processing
        data = data.replace(/\x1b?\[2!/g, '');
      }

      const currentFont = term.options.fontFamily;
      if (currentFont && currentFont.includes('PetMe64')) {
        if (data.includes('\x1b[2J') || data.includes('\x1b[H\x1b[2J') || data.includes('\x1b[0m\x1b[2J')) {
          term.options.fontFamily = normalFont.current;
          console.log('[ANSI] Screen clear detected, restored font from PetMe64 to', normalFont.current);
        }
      }

      // If in RIP mode, buffer RIP commands for processing
      if (ripMode && data.includes('!|')) {
        ripBuffer.current += data;
        // Process RIP commands in buffer (basic implementation - full parsing in RIPRenderer)
        console.log('[RIP] Buffered RIP content, length:', ripBuffer.current.length);
      }

      term.write(data);
      term.refresh(0, term.rows - 1);
    });

    // PETSCII output handler
    socket.on('petscii-output', (data: string) => {
      console.log('[PETSCII] Received petscii-output, length:', data.length);
      const currentFont = term.options.fontFamily;
      if (!currentFont?.includes('PetMe64')) {
        normalFont.current = currentFont || 'mosoul, "Courier New", monospace';
        console.log('[PETSCII] Saved normal font:', normalFont.current);
      }
      console.log('[PETSCII] Switching font from', currentFont, 'to PetMe64');
      term.options.fontFamily = 'PetMe64, "Courier New", monospace';
      term.write(data);
      term.refresh(0, term.rows - 1);
      console.log('[PETSCII] PETSCII content written to terminal');
    });

    // Terminal resize handler (PETSCII mode uses 40x25)
    socket.on('terminal-resize', (size: { cols: number; rows: number }) => {
      console.log('[Terminal] Resize request:', size.cols, 'x', size.rows);
      term.resize(size.cols, size.rows);
      // For PETSCII mode (40x25), also switch to PetMe64 font
      if (size.cols === 40 && size.rows === 25) {
        const currentFont = term.options.fontFamily;
        if (!currentFont?.includes('PetMe64')) {
          normalFont.current = currentFont || 'mosoul, "Courier New", monospace';
        }
        term.options.fontFamily = 'PetMe64, "Courier New", monospace';
        console.log('[PETSCII] Terminal resized to 40x25, switched to PetMe64 font');
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
        loginState.current = 'loggedin';
        return true;
      }
      return false;
    };

    socket.on('prompt-login', () => {
      // If we're already in the middle of manual login, don't duplicate the prompt
      if (
        loginState.current === 'username' ||
        loginState.current === 'password' ||
        loginState.current === 'checking-username'
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
      loginState.current = 'loggedin';

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

    socket.on('login-failed', (reason: string) => {
      console.log('Login failed:', reason);
      localStorage.removeItem('bbs_auth_token');
      const autoLoginEnabled = localStorage.getItem('bbs_auto_login_enabled') === 'true';
      if (autoLoginEnabled) {
        localStorage.removeItem('bbs_saved_username');
        localStorage.removeItem('bbs_saved_password');
        term.write('\r\n\x1b[33m[Quick Connect] Saved credentials cleared due to login failure\x1b[0m\r\n');
      }
      // Always return to manual prompt so input is accepted; prompt text comes from backend
      loginState.current = 'username';
      username.current = '';
      password.current = '';
    });

    socket.on('user-not-found', (data: { username: string; prompt: string }) => {
      term.write('\x1b[33m' + data.prompt + '\x1b[0m');
      loginState.current = 'new-user-prompt';
      newUserPromptUsername.current = data.username;
      username.current = '';
    });

    socket.on('retry-login', () => {
      loginState.current = 'username';
      username.current = '';
      password.current = '';
    });

    socket.on('prompt-password', () => {
      loginState.current = 'password';
      password.current = '';
      term.write('Password: ');
    });

    socket.on('password-mode', (enabled: boolean) => {
      passwordMode.current = enabled;
    });

    socket.on('door-active', (active: boolean) => {
      doorActive.current = active;
    });

    // Game mode: bypass OS key repeat for real-time game controls
    socket.on('game-mode', (enabled: boolean) => {
      console.log(`[GameMode] ${enabled ? 'ENABLED' : 'DISABLED'} - raw keydown/keyup events`);
      gameMode.current = enabled;
      // Clear key states when switching modes
      keyState.current = {};
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
      term.options.fontFamily = `${fontName}, "Courier New", monospace`;
      term.options.fontSize = metrics.size;
      term.options.lineHeight = metrics.lineHeight;
      console.log('[Font] Applied font:', fontName, 'size:', metrics.size, 'lineHeight:', metrics.lineHeight);
    });

    // Keyboard input handling
    term.onKey(({ key, domEvent }) => {
      if (!socket.connected) {
        console.error('❌ Socket not connected, cannot send key');
        return;
      }

      // Handle login input locally
      if (loginState.current === 'checking-username') {
        return;
      }

      if (loginState.current === 'username') {
        if (key === '\r') {
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
        if (key === '\r') {
          console.log('🔐 Password entered, sending login');
          socket.emit('login', { username: username.current, password: password.current });
          loginState.current = 'loggedin';
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

      // Handle new user prompt
      if (loginState.current === 'new-user-prompt') {
        const promptUser = newUserPromptUsername.current || username.current || '';
        const sendResponse = (response: string) => {
          socket.emit('new-user-response', { response, username: promptUser });
        };

        if (key === '\r') {
          term.write('\r\n');
          sendResponse('');
          loginState.current = 'registering';
        } else {
          const lower = key.toLowerCase();
          if (lower === 'c') {
            // Echo character only - backend sends the newline with next prompt
            // express.e:6845 lineInput echoes char, then adds \b\n after
            term.write('C');
            sendResponse('C');
            loginState.current = 'registering';
          } else if (lower === 'r') {
            // Echo character only - backend sends \r\nUsername: which provides newline
            term.write('R');
            sendResponse('R');
            loginState.current = 'username';
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
        loginState.current === 'checking-username'
        // Note: 'registering' removed - server handles registration input including pause prompts
      ) {
        return;
      }
      socket.emit('command', data);
    });

    // Focus terminal on mount
    term.focus();

    // Cleanup
    return () => {
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
      window.removeEventListener('keydown', handleGameKeyDown);
      window.removeEventListener('keyup', handleGameKeyUp);
      if (transferTimeout.current) {
        clearTimeout(transferTimeout.current);
        transferTimeout.current = null;
      }
    };
  }, [fontSize, backendUrl, showConnectionError, onConnectionError, onConnect, onDisconnect]);

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

  // Calculate terminal cell coordinates from mouse event
  const getTerminalCoords = (event: React.MouseEvent): { x: number; y: number } | null => {
    const term = terminalInstance.current;
    if (!term || !terminalRef.current) return null;

    // Get the viewport element (where cells are rendered)
    const viewport = terminalRef.current.querySelector('.xterm-screen');
    if (!viewport) return null;

    const rect = viewport.getBoundingClientRect();
    const cellWidth = rect.width / term.cols;
    const cellHeight = rect.height / term.rows;

    // Calculate cell position (0-indexed)
    const x = Math.floor((event.clientX - rect.left) / cellWidth);
    const y = Math.floor((event.clientY - rect.top) / cellHeight);

    // Clamp to valid range
    return {
      x: Math.max(0, Math.min(term.cols - 1, x)),
      y: Math.max(0, Math.min(term.rows - 1, y))
    };
  };

  // Mouse event handlers for game mode / doors
  const handleMouseDown = (event: React.MouseEvent) => {
    // Only send mouse events when door is active or in game mode
    if (!doorActive.current && !gameMode.current) return;

    const socket = socketRef.current;
    if (!socket?.connected) return;

    const coords = getTerminalCoords(event);
    if (!coords) return;

    mouseButtonDown.current = true;

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

    if (mouseButtonDown.current) {
      // Dragging - send drag event
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
      className={`min-h-screen w-full flex items-center justify-center ${className}`}
      style={{
        backgroundColor: '#000000',
        position: 'relative',
      }}
    >
      <div
        ref={terminalRef}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { mouseButtonDown.current = false; }}
        tabIndex={0}
        style={{
          overflow: 'hidden',
          position: 'relative',
          outline: 'none',
          width: '100%',
          maxWidth: '960px',
        }}
      />
      {/* Web Transparency Overlays - CSS-based overlays for web connections */}
      {Array.from(overlays.entries()).map(([id, overlay]) => {
        console.log('[Overlay] Rendering overlay:', id, 'opacity:', overlay.opacity);
        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: `rgba(0, 0, 0, ${overlay.opacity})`,
              pointerEvents: 'none', // Allow clicks through to terminal
              zIndex: 100, // High enough to be above terminal
              outline: '2px solid red', // Debug: shows overlay bounds
            }}
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
