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
        cursor: '#ffffff',
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
      scrollback: 1000,
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
        // Add padding to prevent text from drawing at screen edge
        style.padding = '0 2ch'; // 2 character width padding on left/right
      }
      term.refresh(0, term.rows - 1);
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
    });

    // Handle login failure
    ws.on('login-failed', (reason: string) => {
      console.log('Login failed:', reason);
    });

    // Handle terminal input
    term.onData((data: string) => {
      console.log('📝 Terminal input received:', JSON.stringify(data), 'charCode:', data.charCodeAt ? data.charCodeAt(0) : 'N/A');
      if (loginState.current === 'username' || loginState.current === 'password') {
        // Handle login input
        handleLoginInput(data, ws, term);
      } else {
        // Send input to server
        console.log('📤 Sending command to server:', JSON.stringify(data));
        ws.emit('command', data);
      }
    });

    // Handle special keys (F1 for chat, etc.)
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Handle F1 key for chat
      if (event.key === 'F1' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        ws.emit('command', '\x1b[OP'); // F1 key sequence
        return false;
      }
      return true;
    });

    // Display welcome message and wait for user input
    setTimeout(() => {
      term.write('\r\n\x1b[32mWelcome to AmiExpress Web BBS!\x1b[0m\r\n');
      term.write('Please login with your username and password.\r\n\r\n');
      term.write('Username: ');
      // Focus the terminal for input
      term.focus();
    }, 500);

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