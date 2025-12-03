import React, { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { io, Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';
import { XTERM_CONFIG } from '../utils/terminal-utils';
import Zmodem from 'zmodem.js/src/zmodem_browser';

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
  const normalFont = useRef<string>('mosoul, "Courier New", monospace');
  const transferState = useRef<{ direction: 'upload' | 'download' | null; paths?: string[] }>({
    direction: null,
    paths: [],
  });
  const zmodemSentry = useRef<any | null>(null);
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
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const finalBackendUrl = backendUrl ||
      (import.meta as any).env?.VITE_BBS_BACKEND_URL ||
      (isDevelopment ? 'http://localhost:3001' : (import.meta as any).env?.VITE_API_URL || 'https://amiexpress-backend.onrender.com');

    console.log('🔌 BBS Terminal: Connecting to:', finalBackendUrl);

    // Keyboard cancel for transfers (Esc)
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (transferState.current.direction && ev.key === 'Escape') {
        ev.preventDefault();
        cancelTransfer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Connect to BBS backend
    const socket = io(finalBackendUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: isDevelopment ? 3 : 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: isDevelopment ? 5000 : 10000,
    });
    socketRef.current = socket;

    // Socket event handlers
    socket.on('connect', () => {
      console.log('✅ BBS Terminal: Connected to BBS backend');
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

    // Handle file upload request from backend
    socket.on('show-file-upload', (options: { accept?: string; maxSize?: number; multiple?: boolean }) => {
      console.log('[BBSTerminal] show-file-upload event received:', options);

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

        // Upload each file
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          console.log(`[BBSTerminal] Uploading file ${i + 1}/${files.length}:`, file.name);

          // Check file size
          if (options.maxSize && file.size > options.maxSize) {
            socket.emit('ansi-output', `\r\n\x1b[31mFile ${file.name} exceeds maximum size of ${options.maxSize} bytes\x1b[0m\r\n`);
            continue;
          }

          // Read file as ArrayBuffer
          const reader = new FileReader();
          reader.onload = async (e) => {
            const arrayBuffer = e.target?.result as ArrayBuffer;

            // Send file data to backend
            socket.emit('file-upload', {
              filename: file.name,
              size: file.size,
              type: file.type,
              data: Array.from(new Uint8Array(arrayBuffer))
            });
          };
          reader.readAsArrayBuffer(file);
        }

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
    socket.on('download-file', (fileInfo: { filename: string; size: number; url: string; path?: string }) => {
      console.log('[BBSTerminal] download-file event received:', fileInfo);

      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.href = fileInfo.url;
      link.download = fileInfo.filename;
      link.style.display = 'none';

      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log('[BBSTerminal] Download initiated for:', fileInfo.filename);

      // Notify backend that download started
      socket.emit('file-download-started', {
        filename: fileInfo.filename
      });
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
      const currentFont = term.options.fontFamily;
      if (currentFont && currentFont.includes('PetMe64')) {
        if (data.includes('\x1b[2J') || data.includes('\x1b[H\x1b[2J') || data.includes('\x1b[0m\x1b[2J')) {
          term.options.fontFamily = normalFont.current;
          console.log('[ANSI] Screen clear detected, restored font from PetMe64 to', normalFont.current);
        }
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
            term.write('C\r\n');
            sendResponse('C');
            loginState.current = 'registering';
          } else if (lower === 'r') {
            term.write('R\r\n');
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
        console.error('❌ Socket not connected, cannot send data');
        return;
      }
      if (
        loginState.current === 'username' ||
        loginState.current === 'password' ||
        loginState.current === 'new-user-prompt' ||
        loginState.current === 'checking-username' ||
        loginState.current === 'registering'
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
      window.removeEventListener('keydown', handleKeyDown);
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

  return (
    <div
      className={`min-h-screen w-full flex items-center justify-center ${className}`}
      style={{
        backgroundColor: '#000000',
      }}
    >
      <div
        ref={terminalRef}
        onClick={handleClick}
        tabIndex={0}
        style={{
          overflow: 'hidden',
          position: 'relative',
          outline: 'none',
          width: '100%',
          maxWidth: '960px',
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
    </div>
  );
});

// Add display name for debugging
BBSTerminal.displayName = 'BBSTerminal';
