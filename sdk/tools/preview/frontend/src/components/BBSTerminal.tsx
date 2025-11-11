import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { io, Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';
import { XTERM_CONFIG } from '../utils/terminal-utils';

interface BBSTerminalProps {
  fontSize?: number;
  className?: string;
}

export interface BBSTerminalRef {
  focus: () => void;
  sendCommand: (command: string) => void;
}

export const BBSTerminal = forwardRef<BBSTerminalRef, BBSTerminalProps>(({
  fontSize = 14,
  className = '',
}, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Expose focus and sendCommand methods to parent components
  useImperativeHandle(ref, () => ({
    focus: () => {
      terminalInstance.current?.focus();
    },
    sendCommand: (command: string) => {
      if (socketRef.current?.connected) {
        console.log('📤 Sending command to BBS:', command);
        socketRef.current.emit('command', command);
      } else {
        console.warn('⚠️ Cannot send command - socket not connected');
      }
    },
  }));

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js terminal for BBS connection (fixed 80x25 for BBS compatibility)
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

    // Load canvas addon for better performance
    const canvasAddon = new CanvasAddon();
    term.loadAddon(canvasAddon);

    // Connect to BBS backend on port 3001
    const bbsUrl = 'http://localhost:3001';
    console.log('🔌 BBS Tab: Connecting to BBS backend:', bbsUrl);

    const socket = io(bbsUrl, {
      transports: ['websocket'],
      timeout: 60000,
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000
    });
    socketRef.current = socket;

    // Auto-login state
    let loginState: 'waiting' | 'username' | 'password' | 'done' = 'waiting';

    // Socket event handlers
    socket.on('connect', () => {
      console.log('✅ BBS Tab: Connected to BBS backend');
      term.focus();
    });

    socket.on('connect_error', (error: any) => {
      console.error('❌ BBS Tab: Connection error:', error.message);
      term.writeln('\r\n\x1b[31mError: Could not connect to BBS server on port 3001\x1b[0m');
      term.writeln('\x1b[33mMake sure the BBS backend is running.\x1b[0m\r\n');
    });

    socket.on('disconnect', (reason: string) => {
      console.log('🔌 BBS Tab: Disconnected from BBS backend:', reason);
    });

    // Track auto-continue presses (limit to prevent infinite loops)
    let autoContinueCount = 0;
    const MAX_AUTO_CONTINUE = 10;

    socket.on('ansi-output', (data: string) => {
      term.write(data);

      // Auto-login: detect ANSI prompt and auto-answer
      const autoLoginEnabled = localStorage.getItem('bbs_auto_login_enabled') === 'true';

      if (autoLoginEnabled) {
        // Detect ANSI/RIP/No graphics prompt and auto-select ANSI
        if (loginState === 'waiting' && (data.includes('ANSI, RIP or No graphics') || data.includes('(A/r/n)?'))) {
          console.log('🔐 SDK Auto-login: Detected ANSI prompt, sending "A"');
          loginState = 'ansi-prompt';
          setTimeout(() => {
            socket.emit('command', 'A');
            socket.emit('command', '\r');
            // Focus terminal after auto-answer
            term.focus();
          }, 100);
        }

        // Auto-continue: detect "Press any key to continue..." prompts
        // Common patterns: "Press any key", "Hit RETURN", "Press RETURN"
        if (loginState === 'done' && autoContinueCount < MAX_AUTO_CONTINUE) {
          const lowerData = data.toLowerCase();
          if (lowerData.includes('press any key') ||
              lowerData.includes('hit return') ||
              lowerData.includes('press return') ||
              lowerData.includes('press <return>') ||
              lowerData.includes('hit <return>')) {
            autoContinueCount++;
            console.log(`🔐 SDK Auto-continue (${autoContinueCount}/${MAX_AUTO_CONTINUE}): Detected continue prompt, pressing Enter`);
            setTimeout(() => {
              socket.emit('command', '\r');
              term.focus();
            }, 150);
          }
        }
      } else {
        // If auto-login is disabled, focus terminal when any output appears
        // This ensures the terminal is ready for user input
        setTimeout(() => term.focus(), 50);
      }
    });

    // Track login input state
    let usernameBuffer = '';
    let passwordBuffer = '';

    socket.on('prompt-login', () => {
      console.log('🔐 BBS Tab: Received prompt-login event');

      // Check if auto-login is enabled
      const autoLoginEnabled = localStorage.getItem('bbs_auto_login_enabled') === 'true';
      const savedUsername = localStorage.getItem('bbs_saved_username');
      const savedPassword = localStorage.getItem('bbs_saved_password');

      if (autoLoginEnabled && savedUsername && savedPassword && (loginState === 'waiting' || loginState === 'ansi-prompt')) {
        // Auto-login with saved credentials
        const username = atob(savedUsername);
        const password = atob(savedPassword);

        console.log(`🔐 BBS Tab: Auto-login enabled, sending credentials for ${username}`);

        // Send login via socket event (not character-by-character)
        socket.emit('login', { username, password });
        loginState = 'done';
      } else {
        // Normal login - show username prompt and collect input locally
        console.log('🔐 BBS Tab: Normal login flow, showing username prompt');
        term.write('Username: ');
        loginState = 'username';
        usernameBuffer = '';
        passwordBuffer = '';
        term.focus();
      }
    });

    socket.on('login-success', (data: any) => {
      console.log('✅ BBS Tab: Login successful:', data);
    });

    socket.on('error', (error: any) => {
      console.error('❌ BBS Tab: Error:', error);
      term.writeln(`\r\n\x1b[31mError: ${error.message || error}\x1b[0m\r\n`);
    });

    // Handle keyboard input
    term.onKey(({ key }) => {
      console.log('⌨️  Key pressed:', JSON.stringify(key), 'charCode:', key.charCodeAt(0), 'loginState:', loginState);

      if (!socket.connected) {
        console.error('❌ Socket not connected, cannot send key');
        return;
      }

      // Handle login input locally (username/password collection)
      if (loginState === 'username' || loginState === 'password') {
        if (key === '\r') {
          // Enter pressed
          if (loginState === 'username') {
            console.log('🔐 Username entered:', usernameBuffer);
            term.write('\r\nPassword: ');
            loginState = 'password';
          } else if (loginState === 'password') {
            console.log('🔐 Password entered, sending login');
            // Send login with collected credentials
            socket.emit('login', { username: usernameBuffer, password: passwordBuffer });
            loginState = 'done';
            term.write('\r\n');
          }
        } else if (key === '\x7f' || key === '\b') {
          // Backspace
          if (loginState === 'username' && usernameBuffer.length > 0) {
            usernameBuffer = usernameBuffer.slice(0, -1);
            term.write('\b \b');
          } else if (loginState === 'password' && passwordBuffer.length > 0) {
            passwordBuffer = passwordBuffer.slice(0, -1);
            term.write('\b \b');
          }
        } else if (key.length === 1 && key >= ' ') {
          // Regular character
          if (loginState === 'username') {
            usernameBuffer += key;
            term.write(key);
          } else if (loginState === 'password') {
            passwordBuffer += key;
            term.write('*'); // Show asterisks for password
          }
        }
        return;
      }

      // Normal BBS command mode - send to backend
      socket.emit('command', key);
      console.log('✅ Sent command to BBS');
    });

    // Focus terminal on mount
    term.focus();

    // Cleanup
    return () => {
      socket.disconnect();
      term.dispose();
      terminalInstance.current = null;
      socketRef.current = null;
    };
  }, [fontSize]);

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
