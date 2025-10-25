import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
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
      cursorInactiveStyle: 'block',
      cols: 80,
      rows: 24,
      scrollback: 0,
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      allowProposedApi: true
    });

    // Open terminal in the DOM
    term.open(terminalRef.current);
    terminal.current = term;

    // Add canvas addon for better performance and cursor rendering
    const canvasAddon = new CanvasAddon();
    term.loadAddon(canvasAddon);

    // Force cursor blinking immediately after open
    term.options.cursorBlink = true;
    term.options.cursorStyle = 'block';
    term.options.cursorInactiveStyle = 'block';

    // Force font size and disable smoothing after terminal is opened
    setTimeout(() => {
      // Re-apply theme to ensure cursor colors are applied
      term.options.theme = {
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
      };

      term.options.cursorBlink = true;
      term.options.cursorStyle = 'block';
      term.options.cursorInactiveStyle = 'block';
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
      if (loginState.current === 'password' && newUserPromptUsername.current && password.current) {
        console.log('🔄 Connection established - retrying login automatically');
        ws.emit('login', { username: newUserPromptUsername.current, password: password.current });
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

      // Request user's font preference
      ws.emit('get-font-preference');

      // Focus terminal after login so user can interact immediately
      term.focus();
    });

    // Handle login failure
    ws.on('login-failed', (reason: string) => {
      console.log('Login failed:', reason);

      // Clear token on failed login
      localStorage.removeItem('bbs_auth_token');
    });

    // Handle user not found - new user registration prompt (express.e:29608-29622)
    ws.on('user-not-found', (data: { username: string; prompt: string }) => {
      console.log('👤 User not found, prompting for new user creation:', data.username);
      term.write('\x1b[33m' + data.prompt + '\x1b[0m');

      // Change login state to wait for new user response
      // Clear username buffer and store the attempted username
      loginState.current = 'new-user-prompt';
      newUserPromptUsername.current = data.username;
      username.current = ''; // Clear buffer for response input
    });

    // Handle retry login request
    ws.on('retry-login', () => {
      console.log('🔄 Retrying login');
      term.write('\r\n\r\nUsername: ');
      loginState.current = 'username';
      username.current = '';
      password.current = '';
    });

    // Handle prompt for password (user exists, now ask for password)
    ws.on('prompt-password', () => {
      console.log('🔐 User exists, prompting for password');
      loginState.current = 'password';
      term.write('Password: ');
    });

    // Handle password masking mode (for registration)
    ws.on('password-mode', (enabled: boolean) => {
      console.log('🔒 Password mode:', enabled);
      passwordMode.current = enabled;
    });

    // Handle font preference response
    ws.on('font-preference', (data: { font: string }) => {
      console.log('🔤 Font preference received:', data.font);
      if (terminal.current) {
        terminal.current.options.fontFamily = `${data.font}, "Courier New", monospace`;
        console.log('✅ Font applied:', data.font);
      }
    });

    // Handle font changed event (when user changes font via S command)
    ws.on('font-changed', (data: { font: string }) => {
      console.log('🔤 Font changed:', data.font);
      if (terminal.current) {
        terminal.current.options.fontFamily = `${data.font}, "Courier New", monospace`;
        term.write(`\r\n\x1b[32mFont changed to ${data.font}\x1b[0m\r\n`);
        console.log('✅ Font applied:', data.font);
      }
    });

    // Handle file upload request from server
    ws.on('show-file-upload', (options: { accept: string; maxSize: number; uploadUrl: string; fieldName: string }) => {
      console.log('📂 File upload requested:', options);
      handleFileUpload(options, ws, term);
    });

    // Handle file download request from server
    ws.on('show-file-download', (options: { filename: string; size: number; downloadUrl: string; fileId?: number }) => {
      console.log('📥 File download requested:', options);
      handleFileDownload(options, ws, term);
    });

    // Echo file-uploaded events back to server to trigger processing
    // This allows server-side code to trigger the file-uploaded handler by emitting to client
    ws.on('file-uploaded', (data: any) => {
      console.log('📤 Echoing file-uploaded event back to server:', data);
      ws.emit('file-uploaded', data);
    });

    // Handle terminal input
    term.onData((data: string) => {
      if (loginState.current === 'username' || loginState.current === 'password' || loginState.current === 'new-user-prompt') {
        // Handle login input (has its own echo logic)
        handleLoginInput(data, ws, term);
      } else {
        // LOCAL ECHO: Display character immediately for instant feedback
        // Only echo printable characters and backspace, not control sequences
        if (data.length === 1) {
          if (data >= ' ' && data <= '~') {
            // Printable character - echo immediately (mask with * if in password mode)
            term.write(passwordMode.current ? '*' : data);
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

    // Cleanup on unmount
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
const loginState = { current: 'connecting' as 'connecting' | 'username' | 'checking-username' | 'password' | 'new-user-prompt' | 'loggedin' };
const username = { current: '' };
const password = { current: '' };
const newUserPromptUsername = { current: '' };
const passwordMode = { current: false }; // Track password masking mode during registration

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
        size: result.size,
        path: result.path  // Include path for FILE_ID.DIZ extraction
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

// Handle file download
function handleFileDownload(options: { filename: string; size: number; downloadUrl: string; fileId?: number }, ws: Socket, term: Terminal) {
  console.log('📥 Starting download:', options.filename);

  // Determine backend URL based on environment
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const backendUrl = isDevelopment
    ? 'http://localhost:3001'
    : (import.meta.env.VITE_API_URL || 'https://amiexpress-backend.onrender.com');

  const downloadUrl = `${backendUrl}${options.downloadUrl}`;
  console.log('📥 Download URL:', downloadUrl);

  // Show download starting message
  term.write(`\r\n\x1b[36mStarting download: ${options.filename}\x1b[0m\r\n`);
  term.write(`\x1b[32mSize: ${Math.ceil(options.size / 1024)}KB\x1b[0m\r\n\r\n`);

  // Create hidden anchor element for download
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = options.filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);

  // Trigger download
  anchor.click();

  // Notify backend that download was initiated
  ws.emit('file-download-started', {
    filename: options.filename,
    fileId: options.fileId
  });

  term.write(`\x1b[32m✓ Download started - check your browser's download folder\x1b[0m\r\n`);

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(anchor);
  }, 100);
}

// Handle login input (username/password collection)
function handleLoginInput(data: string, ws: Socket, term: Terminal) {
  console.log('🔐 Login input received:', JSON.stringify(data), 'state:', loginState.current);
  if (data === '\r' || data === '\n') {
    console.log('🔐 ENTER pressed in login state:', loginState.current);
    // Enter pressed - process current input
    if (loginState.current === 'new-user-prompt') {
      // Handle new user response (express.e:29622)
      // Empty or 'C' = Continue as new user, 'R' = Retry login
      const response = username.current.trim().toUpperCase();
      console.log('👤 New user response:', response, 'for username:', newUserPromptUsername.current);

      // Clear buffer and transition to loggedin state
      username.current = '';
      loginState.current = 'loggedin';

      // Send response to backend
      ws.emit('new-user-response', {
        response: response || 'C', // Default to Continue if empty
        username: newUserPromptUsername.current
      });

      term.write('\r\n');
      return;
    } else if (loginState.current === 'username') {
      if (username.current.trim().length === 0) {
        term.write('\r\nUsername cannot be empty. Username: ');
        return;
      }

      // Send username to backend first to check if user exists
      // Backend will emit 'user-not-found' or 'prompt-password'
      console.log('🔐 Sending username to backend for validation:', username.current);
      const submittedUsername = username.current; // Store for later login attempt
      ws.emit('check-username', { username: submittedUsername });
      username.current = ''; // Clear input buffer for next input (password or retry)
      loginState.current = 'checking-username';
      // Store the submitted username in a separate variable for login
      newUserPromptUsername.current = submittedUsername;
      term.write('\r\n');
    } else if (loginState.current === 'password') {
      const pwd = password.current;
      password.current = ''; // Clear buffer after reading to prevent accumulation
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
          const usernameToLogin = newUserPromptUsername.current; // Use stored username
          ws.emit('login', { username: usernameToLogin, password: pwd });
          loginState.current = 'loggedin';
          ws.off('connect', onConnect);
        };

        ws.on('connect', onConnect);
        return;
      }

      // Attempt login using stored username from check-username
      const usernameToLogin = newUserPromptUsername.current; // Use stored username
      console.log('🔐 Attempting login with username:', usernameToLogin, 'password length:', pwd.length);
      console.log('🔐 Socket connected:', ws.connected, 'readyState:', ws.io?.engine?.readyState);
      ws.emit('login', { username: usernameToLogin, password: pwd });
      loginState.current = 'loggedin';
    }
  } else if (data === '\x7f' || data === '\b') {
    // Backspace
    if ((loginState.current === 'username' || loginState.current === 'new-user-prompt') && username.current.length > 0) {
      username.current = username.current.slice(0, -1);
      term.write('\b \b'); // Erase character
    } else if (loginState.current === 'password' && password.current.length > 0) {
      password.current = password.current.slice(0, -1);
      term.write('\b \b'); // Erase character
    }
  } else if (data.length === 1 && data >= ' ' && data <= '~') {
    // Regular character
    if (loginState.current === 'username' || loginState.current === 'new-user-prompt') {
      username.current += data;
      term.write(data);
    } else if (loginState.current === 'password') {
      password.current += data;
      term.write('*'); // Show asterisk for password
    }
  }
}

export default App;