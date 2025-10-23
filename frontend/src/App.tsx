import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { io, Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';

function App() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const socket = useRef<Socket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js terminal with canvas renderer for authentic BBS display
    const term = new Terminal({
      fontFamily: 'mosoul, "Courier New", monospace',
      fontSize: 16,
      lineHeight: 1.2,
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ff0000',
        black: '#000000',
        red: '#ff0000',
        green: '#00ff00',
        yellow: '#ffff00',
        blue: '#0000ff',
        magenta: '#ff00ff',
        cyan: '#00ffff',
        white: '#ffffff',
        brightBlack: '#808080',
        brightRed: '#ff8080',
        brightGreen: '#80ff80',
        brightYellow: '#ffff80',
        brightBlue: '#8080ff',
        brightMagenta: '#ff80ff',
        brightCyan: '#80ffff',
        brightWhite: '#ffffff'
      },
      allowTransparency: false,
      cursorBlink: true,
      cursorStyle: 'block',
      cols: 80,
      rows: 24,
      scrollback: 0,
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      allowProposedApi: true
    });

    // Add canvas addon for better performance and authentic rendering
    // const canvasAddon = new CanvasAddon();
    // term.loadAddon(canvasAddon);

    // Open terminal in the DOM
    term.open(terminalRef.current);
    terminal.current = term;

    // Force font size and disable smoothing after terminal is opened
    setTimeout(() => {
      term.options.fontSize = 16;
      // Try to disable font smoothing programmatically
      const termElement = terminalRef.current?.querySelector('.xterm');
      if (termElement) {
        const style = (termElement as HTMLElement).style as any;
        style.fontSmooth = 'never';
        style.webkitFontSmoothing = 'none';
        style.MozOsxFontSmoothing = 'none';
        // No padding - screens are designed for full 80-column display
      }
      term.refresh(0, term.rows - 1);
      // Autofocus terminal so user can interact immediately without clicking
      term.focus();
    }, 100);

    // Connect to backend (environment-aware configuration)
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const backendUrl = isDevelopment ? 'http://localhost:3001' : (import.meta.env.VITE_API_URL || 'https://amiexpress-backend.onrender.com');

    console.log('🔌 Connecting to backend:', backendUrl, 'Environment:', isDevelopment ? 'development' : 'production');
    console.log('🔍 User Agent:', navigator.userAgent);
    console.log('🔍 Protocol:', window.location.protocol);
    console.log('🔍 Hostname:', window.location.hostname);

    // Use WebSocket in production (Render.com supports persistent connections)
    const allowedTransports = ['websocket'];

    const ws = io(backendUrl, {
      transports: allowedTransports,
      timeout: 60000, // Increased timeout for Render.com cold starts (60 seconds)
      forceNew: true,
      upgrade: true, // Always allow upgrades for WebSocket connections
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: isDevelopment ? 5 : 10, // More attempts for production cold starts
      reconnectionDelay: 2000, // Longer delay between attempts
      reconnectionDelayMax: 10000 // Max delay of 10 seconds
    });
    socket.current = ws;

    // Connection handling
    ws.on('connect', () => {
      const transport = ws.io.engine.transport.name;
      console.log(`✅ Connected to BBS backend via ${transport}`);
      console.log(`🔍 Transport details:`, {
        name: transport,
        writable: ws.io.engine.transport.writable
      });
      if (transport === 'polling') {
        console.log('ℹ️ Using HTTP polling - real-time features limited but functional');
      }

      // If we were waiting for connection to login, retry login now
      if (loginState.current === 'password' && username.current && password.current) {
        console.log('🔄 Connection established - retrying login automatically');
        ws.emit('login', { username: username.current, password: password.current });
        loginState.current = 'loggedin';
      }
    });

    ws.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
      console.error('🔍 Error details:', error);
      if (isDevelopment) {
        console.log('💡 Make sure backend is running: cd backend && npm run dev');
      } else {
        console.log('💡 Production mode: Render.com may be cold-starting (up to 50 seconds)');
        console.log('🔍 Will retry connection automatically...');
      }
    });

    ws.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from BBS backend:', reason);
      console.log('🔍 Disconnect details:', {
        reason: reason,
        wasConnected: ws.connected,
        transport: ws.io?.engine?.transport?.name
      });

      // Clear token on disconnect if it was a logout
      if (reason === 'io client disconnect') {
        localStorage.removeItem('bbs_auth_token');
        console.log('🔐 Auth token cleared on logout');
      }
    });

    // Add transport upgrade/downgrade logging
    ws.on('ping', () => console.log('🏓 Ping sent'));
    ws.on('pong', () => console.log('🏓 Pong received'));
    ws.on('reconnect', (attempt) => console.log(`🔄 Reconnected after ${attempt} attempts`));
    ws.on('reconnect_attempt', (attempt) => console.log(`🔄 Reconnection attempt ${attempt}`));
    ws.on('reconnect_error', (error) => console.error('🔄 Reconnection error:', error));
    ws.on('reconnect_failed', () => console.error('🔄 Reconnection failed'));

    // Handle terminal output from server
    ws.on('ansi-output', (data: string) => {
      term.write(data);
    });

    // Handle login success
    ws.on('login-success', (data: any) => {
      console.log('Login successful:', data);

      // Store JWT token in localStorage for persistent login
      if (data && data.token) {
        localStorage.setItem('bbs_auth_token', data.token);
        console.log('🔐 Auth token stored in localStorage');
      }

      // Focus terminal after login so user can interact immediately
      term.focus();
    });

    // Handle login failure
    ws.on('login-failed', (reason: string) => {
      console.log('Login failed:', reason);

      // Clear token on failed login
      localStorage.removeItem('bbs_auth_token');
    });

    // Handle file upload request from server
    ws.on('show-file-upload', (options: { accept: string; maxSize: number; uploadUrl: string; fieldName: string }) => {
      console.log('📂 File upload requested:', options);
      handleFileUpload(options, ws, term);
    });

    // Handle terminal input
    term.onData((data: string) => {
      if (loginState.current === 'username' || loginState.current === 'password') {
        // Handle login input (has its own echo logic)
        handleLoginInput(data, ws, term);
      } else {
        // LOCAL ECHO: Display character immediately for instant feedback
        // Only echo printable characters and backspace, not control sequences
        if (data.length === 1) {
          if (data >= ' ' && data <= '~') {
            // Printable character - echo immediately
            term.write(data);
          } else if (data === '\x7f' || data === '\b') {
            // Backspace - erase immediately
            term.write('\b \b');
          } else if (data === '\r') {
            // Enter - echo newline
            term.write('\r\n');
          }
        }

        // Send input to server (async, no waiting for echo)
        ws.emit('command', data);
      }
    });

    // Handle special keys (F1 for chat, etc.)
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Only handle special keys when logged in and not in login/signup mode
      if (loginState.current === 'loggedin') {
        // Handle F1 key for chat
        if (event.key === 'F1' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          ws.emit('command', '\x1b[OP'); // F1 key sequence
          return false;
        }
      }
      return true;
    });

    // TEMPORARY: Auto-login disabled to show connection screens
    // Connection screens (AWAITSCREEN/ANSI/BBSTITLE) are handled by backend
    // Frontend should NOT write any output - let the backend control the flow

    // Listen for prompt-login event from backend after connection screens
    ws.on('prompt-login', () => {
      console.log('🔐 Backend requests login prompt');
      term.write('Username: ');
      loginState.current = 'username';
      term.focus();
    });

    // Cleanup
    return () => {
      term.dispose();
      ws.disconnect();
    };
  }, []);

  return (
    <div className="App">
      <div ref={terminalRef} style={{
        width: '100%',
        height: '100vh',
        fontSize: '16px'
      }} />
    </div>
  );
}

// Global refs for login state (accessible from handleLoginInput)
const loginState = { current: 'username' as 'username' | 'password' | 'loggedin' };
const username = { current: '' };
const password = { current: '' };

// Handle file upload
function handleFileUpload(options: { accept: string; maxSize: number; uploadUrl: string; fieldName: string }, ws: Socket, term: Terminal) {
  // Create hidden file input
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = options.accept;
  input.style.display = 'none';
  document.body.appendChild(input);

  input.onchange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) {
      console.log('📂 No file selected');
      document.body.removeChild(input);
      return;
    }

    console.log('📂 File selected:', file.name, `(${file.size} bytes)`);

    // Check file size
    if (file.size > options.maxSize) {
      term.write(`\r\n\x1b[31m✗ Error: File too large (max ${Math.round(options.maxSize / 1024 / 1024)}MB)\x1b[0m\r\n`);
      document.body.removeChild(input);
      return;
    }

    // Show upload progress
    term.write(`\r\n\x1b[36mUploading ${file.name}...\x1b[0m\r\n`);

    try {
      // Prepare form data
      const formData = new FormData();
      formData.append(options.fieldName, file);

      // Determine backend URL based on environment
      const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const backendUrl = isDevelopment
        ? 'http://localhost:3001'
        : (import.meta.env.VITE_API_URL || 'https://amiexpress-backend.onrender.com');

      const uploadUrl = `${backendUrl}${options.uploadUrl}`;
      console.log('📤 Uploading to:', uploadUrl);

      // Upload file
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('📦 Upload successful:', result);

      // Notify server of successful upload
      ws.emit('file-uploaded', {
        filename: result.filename,
        originalname: result.originalname,
        size: result.size
      });

      term.write(`\x1b[32m✓ Upload complete\x1b[0m\r\n`);

    } catch (error) {
      console.error('📂 Upload error:', error);
      term.write(`\r\n\x1b[31m✗ Upload failed: ${(error as Error).message}\x1b[0m\r\n`);
    }

    // Cleanup
    document.body.removeChild(input);
  };

  // Trigger file picker
  input.click();
}

// Handle login input (username/password collection)
function handleLoginInput(data: string, ws: Socket, term: Terminal) {
  console.log('🔐 Login input received:', JSON.stringify(data), 'state:', loginState.current);
  if (data === '\r' || data === '\n') {
    console.log('🔐 ENTER pressed in login state:', loginState.current);
    // Enter pressed - process current input
    if (loginState.current === 'username') {
      if (username.current.trim().length === 0) {
        term.write('\r\nUsername cannot be empty. Username: ');
        return;
      }
      loginState.current = 'password';
      term.write('\r\nPassword: ');
    } else if (loginState.current === 'password') {
      const pwd = password.current;
      if (pwd.trim().length === 0) {
        term.write('\r\nPassword cannot be empty. Password: ');
        return;
      }
      // Check if socket is connected before attempting login
      if (!ws.connected) {
        console.log('🔐 Socket not connected yet, waiting for connection...');
        term.write('\r\n\x1b[33mConnecting to BBS server...\x1b[0m\r\n');

        // Wait for connection or show error after timeout
        const connectionTimeout = setTimeout(() => {
          if (!ws.connected) {
            console.error('🔐 Connection timeout - socket still not connected');
            term.write('\r\n\x1b[31mConnection timeout. Please refresh the page and try again.\x1b[0m\r\n');
            term.write('Username: ');
            loginState.current = 'username';
            username.current = '';
            password.current = '';
          }
        }, 30000); // 30 second timeout

        // Listen for connection success
        const onConnect = () => {
          clearTimeout(connectionTimeout);
          console.log('🔐 Socket connected! Retrying login...');
          term.write('\r\n\x1b[32mConnected! Logging in...\x1b[0m\r\n');
          ws.emit('login', { username: username.current, password: pwd });
          loginState.current = 'loggedin';
          ws.off('connect', onConnect);
        };

        ws.on('connect', onConnect);
        return;
      }

      // Attempt login
      console.log('🔐 Attempting login with username:', username.current, 'password length:', pwd.length);
      console.log('🔐 Socket connected:', ws.connected, 'readyState:', ws.io?.engine?.readyState);
      ws.emit('login', { username: username.current, password: pwd });
      loginState.current = 'loggedin';
    }
  } else if (data === '\x7f' || data === '\b') {
    // Backspace
    if (loginState.current === 'username' && username.current.length > 0) {
      username.current = username.current.slice(0, -1);
      term.write('\b \b'); // Erase character
    } else if (loginState.current === 'password' && password.current.length > 0) {
      password.current = password.current.slice(0, -1);
      term.write('\b \b'); // Erase character
    }
  } else if (data.length === 1 && data >= ' ' && data <= '~') {
    // Regular character
    if (loginState.current === 'username') {
      username.current += data;
      term.write(data);
    } else if (loginState.current === 'password') {
      password.current += data;
      term.write('*'); // Show asterisk for password
    }
  }
}

export default App;