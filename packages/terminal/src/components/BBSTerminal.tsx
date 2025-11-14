import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { io, Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';
import { XTERM_CONFIG } from '../utils/terminal-utils';

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
  const loginState = useRef<'waiting' | 'username' | 'password' | 'new-user-prompt' | 'loggedin'>('waiting');
  const username = useRef<string>('');
  const password = useRef<string>('');
  const newUserPromptUsername = useRef<string>('');
  const passwordMode = useRef<boolean>(false);
  const doorActive = useRef<boolean>(false);
  const keyState = useRef<Record<string, boolean>>({});
  const normalFont = useRef<string>('mosoul, "Courier New", monospace');

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
        term.writeln('\x1b[36m║                     \x1b[31mBBS Backend Connection Failed\x1b[36m                          ║\x1b[0m');
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

    socket.on('disconnect', (reason: string) => {
      console.log('🔌 BBS Terminal: Disconnected:', reason);
      if (reason === 'io client disconnect') {
        localStorage.removeItem('bbs_auth_token');
      }
      onDisconnect?.(reason);
    });

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
      if (!handleAutoLogin()) {
        term.write('Username: ');
        loginState.current = 'username';
      }
    });

    socket.on('login-success', (data: any) => {
      console.log('Login successful:', data);
      if (data && data.token) {
        localStorage.setItem('bbs_auth_token', data.token);
      }

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
    });

    socket.on('user-not-found', (data: { username: string; prompt: string }) => {
      term.write('\x1b[33m' + data.prompt + '\x1b[0m');
      loginState.current = 'new-user-prompt';
      newUserPromptUsername.current = data.username;
      username.current = '';
    });

    socket.on('retry-login', () => {
      term.write('\r\n\r\nUsername: ');
      loginState.current = 'username';
      username.current = '';
      password.current = '';
    });

    socket.on('prompt-password', () => {
      loginState.current = 'password';
      term.write('Password: ');
    });

    socket.on('password-mode', (enabled: boolean) => {
      passwordMode.current = enabled;
    });

    socket.on('door-active', (active: boolean) => {
      doorActive.current = active;
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
      if (loginState.current === 'username' || loginState.current === 'password') {
        if (key === '\r') {
          if (loginState.current === 'username') {
            console.log('🔐 Username entered:', username.current);
            term.write('\r\nPassword: ');
            loginState.current = 'password';
          } else if (loginState.current === 'password') {
            console.log('🔐 Password entered, sending login');
            socket.emit('login', { username: username.current, password: password.current });
            loginState.current = 'loggedin';
            term.write('\r\n');
          }
        } else if (key === '\x7f' || key === '\b') {
          if (loginState.current === 'username' && username.current.length > 0) {
            username.current = username.current.slice(0, -1);
            term.write('\b \b');
          } else if (loginState.current === 'password' && password.current.length > 0) {
            password.current = password.current.slice(0, -1);
            term.write('\b \b');
          }
        } else if (key.length === 1 && key >= ' ') {
          if (loginState.current === 'username') {
            username.current += key;
            term.write(key);
          } else if (loginState.current === 'password') {
            password.current += key;
            term.write(passwordMode.current ? key : '*');
          }
        }
        return;
      }

      // Handle new user prompt
      if (loginState.current === 'new-user-prompt') {
        if (key.toLowerCase() === 'y') {
          term.write('y\r\n\r\nPassword: ');
          loginState.current = 'password';
          password.current = '';
        } else if (key.toLowerCase() === 'n') {
          term.write('n\r\n\r\nUsername: ');
          loginState.current = 'username';
          username.current = '';
          password.current = '';
        }
        return;
      }

      // Track key state for doors
      const keyCode = domEvent.code || domEvent.key;
      keyState.current[keyCode] = true;

      // Send to BBS backend
      socket.emit('command', key);
    });

    // Note: onData handler removed to prevent double character input
    // onKey already handles all input and provides domEvent access for door key tracking

    // Focus terminal on mount
    term.focus();

    // Cleanup
    return () => {
      socket.disconnect();
      term.dispose();
      terminalInstance.current = null;
      socketRef.current = null;
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
      className={`h-full w-full flex items-center justify-center ${className}`}
      style={{
        backgroundColor: '#000000'
      }}
    >
      <div
        ref={terminalRef}
        onClick={handleClick}
        tabIndex={0}
        style={{
          overflow: 'hidden',
          position: 'relative',
          outline: 'none'
        }}
      />
    </div>
  );
});

// Add display name for debugging
BBSTerminal.displayName = 'BBSTerminal';
