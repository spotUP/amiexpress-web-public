import { useEffect, useRef } from 'react';
import { Terminal as XTermTerminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { io, Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';

function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<XTermTerminal | null>(null);
  const socket = useRef<Socket | null>(null);
  const doorActive = useRef<boolean>(false);
  const keyState = useRef<Record<string, boolean>>({});
  const normalFont = useRef<string>('mosoul, "Courier New", monospace');

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js terminal with canvas renderer for authentic BBS display
    const term = new XTermTerminal({
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
      scrollback: 2000,
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      allowProposedApi: true
    });

    term.open(terminalRef.current);
    terminal.current = term;

    const canvasAddon = new CanvasAddon();
    term.loadAddon(canvasAddon);

    // Force cursor blinking immediately after open
    term.options.cursorBlink = true;
    term.options.cursorStyle = 'block';
    term.options.cursorInactiveStyle = 'block';

    setTimeout(() => {
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

    // Connect to backend
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const backendUrl = isDevelopment ? 'http://localhost:3001' : (import.meta.env.VITE_API_URL || 'https://amiexpress-backend.onrender.com');

    console.log('🔌 Connecting to backend:', backendUrl);

    const ws = io(backendUrl, {
      transports: ['websocket'],
      timeout: 60000,
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: isDevelopment ? 5 : 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000
    });
    socket.current = ws;

    // Socket event handlers
    ws.on('connect', () => {
      console.log(`✅ Connected to BBS backend`);
      if (loginState.current === 'password' && newUserPromptUsername.current && password.current) {
        ws.emit('login', { username: newUserPromptUsername.current, password: password.current });
        loginState.current = 'loggedin';
      }
    });

    ws.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
    });

    ws.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from BBS backend:', reason);
      if (reason === 'io client disconnect') {
        localStorage.removeItem('bbs_auth_token');
      }
    });

    ws.on('ansi-output', (data: string) => {
      // Regular ANSI output - restore normal BBS font if we were in PETSCII mode
      // BUT only when we're clearing the screen or starting fresh content
      const currentFont = term.options.fontFamily;
      if (currentFont && currentFont.includes('PetMe64')) {
        // Check if this output contains screen clear or home cursor codes
        if (data.includes('\x1b[2J') || data.includes('\x1b[H\x1b[2J') || data.includes('\x1b[0m\x1b[2J')) {
          // Screen is being cleared, safe to switch back to normal font
          term.options.fontFamily = normalFont.current;
          console.log('[ANSI] Screen clear detected, restored font from PetMe64 to', normalFont.current);
        }
        // Otherwise, leave font as PetMe64 so existing PETSCII graphics stay visible
      }
      term.write(data);
      // Only refresh, don't force scroll - let user control scrolling
      term.refresh(0, term.rows - 1);
    });

    ws.on('petscii-output', (data: string) => {
      // PETSCII content - use PetMe64 C64 font
      console.log('[PETSCII] Received petscii-output, length:', data.length);
      const currentFont = term.options.fontFamily;
      // Save current font before switching (unless already in PetMe64)
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

    ws.on('login-success', (data: any) => {
      console.log('Login successful:', data);
      if (data && data.token) {
        localStorage.setItem('bbs_auth_token', data.token);
      }

      // Save credentials if auto-login is enabled
      const autoLoginEnabled = localStorage.getItem('bbs_auto_login_enabled') === 'true';
      if (autoLoginEnabled && newUserPromptUsername.current) {
        // Encode credentials with base64 (basic obfuscation)
        const encodedUsername = btoa(newUserPromptUsername.current);
        const encodedPassword = btoa(password.current || '');

        localStorage.setItem('bbs_saved_username', encodedUsername);
        localStorage.setItem('bbs_saved_password', encodedPassword);

        console.log('[Quick Connect] Credentials saved for future auto-login');
      }

      ws.emit('get-font-preference');
      term.focus();
    });

    ws.on('login-failed', (reason: string) => {
      console.log('Login failed:', reason);
      localStorage.removeItem('bbs_auth_token');

      // Clear saved credentials if auto-login was attempted
      const autoLoginEnabled = localStorage.getItem('bbs_auto_login_enabled') === 'true';
      if (autoLoginEnabled) {
        localStorage.removeItem('bbs_saved_username');
        localStorage.removeItem('bbs_saved_password');
        term.write('\r\n\x1b[33m[Quick Connect] Saved credentials cleared due to login failure\x1b[0m\r\n');
      }
    });

    ws.on('user-not-found', (data: { username: string; prompt: string }) => {
      term.write('\x1b[33m' + data.prompt + '\x1b[0m');
      loginState.current = 'new-user-prompt';
      newUserPromptUsername.current = data.username;
      username.current = '';
    });

    ws.on('retry-login', () => {
      term.write('\r\n\r\nUsername: ');
      loginState.current = 'username';
      username.current = '';
      password.current = '';
    });

    ws.on('prompt-password', () => {
      loginState.current = 'password';
      term.write('Password: ');
    });

    ws.on('password-mode', (enabled: boolean) => {
      passwordMode.current = enabled;
    });

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

    ws.on('font-preference', (data: { font: string }) => {
      const metrics = fontMetrics[data.font] || { size: 16, lineHeight: 1.0 };
      const newFont = `${data.font}, "Courier New", monospace`;
      term.options.fontFamily = newFont;
      term.options.fontSize = metrics.size;
      term.options.lineHeight = metrics.lineHeight;
      term.refresh(0, term.rows - 1);
      // Update normal font reference
      normalFont.current = newFont;
    });

    ws.on('font-changed', (data: { font: string }) => {
      const metrics = fontMetrics[data.font] || { size: 16, lineHeight: 1.0 };
      const newFont = `${data.font}, "Courier New", monospace`;
      term.options.fontFamily = newFont;
      term.options.fontSize = metrics.size;
      term.options.lineHeight = metrics.lineHeight;
      term.refresh(0, term.rows - 1);
      term.write(`\r\n\x1b[32mFont changed to ${data.font}\x1b[0m\r\n`);
      // Update normal font reference
      normalFont.current = newFont;
    });

    ws.on('show-file-upload', (options: any) => {
      handleFileUpload(options, ws, term);
    });

    ws.on('show-file-download', (options: any) => {
      handleFileDownload(options, ws, term);
    });

    ws.on('file-uploaded', (data: any) => {
      ws.emit('file-uploaded', data);
    });

    ws.on('door:status', (data: { status: string }) => {
      doorActive.current = (data.status === 'running');

      // Reset key state when door closes
      if (data.status !== 'running') {
        keyState.current = {};
      }
    });

    // Handle client door loading (browser-based doors)
    ws.on('door:load-client', async (data: { doorId: string; sessionId: string; bundleUrl: string; manifest: any }) => {
      console.log(`[ClientDoor] Loading door: ${data.doorId}`);
      console.log(`[ClientDoor] Bundle URL: ${data.bundleUrl}`);
      console.log(`[ClientDoor] Session ID: ${data.sessionId}`);

      try {
        // Show loading message
        term.write(`\r\n\x1b[36mLoading ${data.manifest.name}...\x1b[0m\r\n`);
        doorActive.current = true;

        // Expose BBS socket globally for the door to use
        // The ClientDoor will use this instead of creating a new connection
        (window as any).__BBS__ = {
          socket: ws,
          sessionId: data.sessionId,
          backendUrl: backendUrl
        };

        // Set up listener for door messages from this session
        const doorMessageListener = (message: any) => {
          // Door sent a message, forward it to backend
          ws.emit(`door:message:${data.sessionId}`, message);
        };

        // Listen for messages FROM the backend for this door session
        ws.on(`door:message:${data.sessionId}`, (message: any) => {
          // Backend sent message to door, dispatch custom event
          window.dispatchEvent(new CustomEvent('bbs:door:message', {
            detail: { sessionId: data.sessionId, message }
          }));
        });

        // Create script element to load the bundled door
        const script = document.createElement('script');
        script.id = `door-${data.doorId}`;
        script.src = `${backendUrl}${data.bundleUrl}`;
        script.type = 'text/javascript';

        // Store session info for cleanup
        (script as any).__sessionId = data.sessionId;
        (script as any).__doorMessageListener = doorMessageListener;

        // Handle script load success
        script.onload = () => {
          console.log(`[ClientDoor] Bundle loaded successfully: ${data.doorId}`);
          term.write(`\x1b[32m✓ Door loaded\x1b[0m\r\n\r\n`);

          // The door bundle is now loaded and will auto-start
          // It will use window.__BBS__.socket to communicate
        };

        // Handle script load error
        script.onerror = (error) => {
          console.error(`[ClientDoor] Failed to load bundle:`, error);
          term.write(`\r\n\x1b[31mError loading door: Failed to fetch bundle\x1b[0m\r\n`);
          term.write(`\x1b[32mPress any key to continue...\x1b[0m`);
          doorActive.current = false;

          // Cleanup
          delete (window as any).__BBS__;
          ws.off(`door:message:${data.sessionId}`);
        };

        // Append script to document
        document.body.appendChild(script);

        console.log(`[ClientDoor] Door script appended to document`);

      } catch (error) {
        console.error(`[ClientDoor] Error loading door:`, error);
        term.write(`\r\n\x1b[31mError: ${(error as Error).message}\x1b[0m\r\n`);
        term.write(`\x1b[32mPress any key to continue...\x1b[0m`);
        doorActive.current = false;

        // Cleanup
        delete (window as any).__BBS__;
      }
    });

    // Handle client door unload
    ws.on('door:unload-client', (data: { doorId: string }) => {
      console.log(`[ClientDoor] Unloading door: ${data.doorId}`);

      // Remove the door script from document
      const script = document.getElementById(`door-${data.doorId}`);
      if (script) {
        document.body.removeChild(script);
      }

      doorActive.current = false;
      term.write(`\r\n\x1b[32mDoor closed\x1b[0m\r\n`);
    });

    ws.on('mouse-mode', (data: { enabled: boolean }) => {
      const termElement = terminalRef.current?.querySelector('.xterm');
      if (termElement) {
        const style = (termElement as HTMLElement).style as any;
        style.cursor = data.enabled ? 'none' : 'default';
      }
    });

    // Handle keyboard input with raw key events for doors
    term.onKey(({ key }) => {
      // For login states, use processed data via onData
      if (loginState.current === 'username' || loginState.current === 'password' || loginState.current === 'new-user-prompt') {
        // Let onData handler below handle login input
        return;
      }

      // For doors, send raw key events with proper names
      if (doorActive.current) {
        ws.emit('command', key);
        return;
      }

      // For regular BBS commands, send the key data
      ws.emit('command', key);
    });

    // Keep onData for login handling
    term.onData((data: string) => {
      if (loginState.current === 'username' || loginState.current === 'password' || loginState.current === 'new-user-prompt') {
        handleLoginInput(data, ws, term);
      }
    });

    // Click-to-focus handler - focus terminal when clicked but don't force scroll
    if (terminalRef.current) {
      const terminalElement = terminalRef.current;
      terminalElement.addEventListener('click', () => {
        if (terminal.current) {
          terminal.current.focus();
        }
      });
    }

    // Mouse handling
    if (terminalRef.current) {
      const terminalElement = terminalRef.current;
      let mouseButtonDown = false;
      let lastButton = -1;
      let lastCol = -1;
      let lastRow = -1;

      const convertToCell = (event: MouseEvent): { col: number; row: number } => {
        const canvas = terminalElement.querySelector('.xterm-screen canvas') as HTMLCanvasElement;
        if (!canvas) {
          const rect = terminalElement.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const cellWidth = rect.width / term.cols;
          const cellHeight = rect.height / term.rows;
          return {
            col: Math.floor(x / cellWidth),
            row: Math.floor(y / cellHeight)
          };
        }

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const cellWidth = rect.width / term.cols;
        const cellHeight = rect.height / term.rows;

        return {
          col: Math.floor(x / cellWidth),
          row: Math.floor(y / cellHeight)
        };
      };

      terminalElement.addEventListener('mousedown', (event: MouseEvent) => {
        event.preventDefault();
        const { col, row } = convertToCell(event);
        if (col >= 0 && col < term.cols && row >= 0 && row < term.rows) {
          mouseButtonDown = true;
          lastButton = event.button;
          lastCol = col;
          lastRow = row;
          ws.emit('mouse-click', {
            x: col,
            y: row,
            button: event.button,
            shift: event.shiftKey,
            ctrl: event.ctrlKey,
            alt: event.altKey
          });
        }
      });

      terminalElement.addEventListener('mousemove', (event: MouseEvent) => {
        const { col, row } = convertToCell(event);
        if (col !== lastCol || row !== lastRow) {
          if (col >= 0 && col < term.cols && row >= 0 && row < term.rows) {
            lastCol = col;
            lastRow = row;
            if (mouseButtonDown) {
              ws.emit('mouse-drag', {
                x: col,
                y: row,
                button: lastButton,
                shift: event.shiftKey,
                ctrl: event.ctrlKey,
                alt: event.altKey
              });
            } else {
              ws.emit('mouse-hover', {
                x: col,
                y: row,
                shift: event.shiftKey,
                ctrl: event.ctrlKey,
                alt: event.altKey
              });
            }
          }
        }
      });

      terminalElement.addEventListener('mouseup', (event: MouseEvent) => {
        if (mouseButtonDown) {
          const { col, row } = convertToCell(event);
          ws.emit('mouse-up', {
            x: col,
            y: row,
            button: event.button,
            shift: event.shiftKey,
            ctrl: event.ctrlKey,
            alt: event.altKey
          });
          mouseButtonDown = false;
          lastButton = -1;
        }
      });

      terminalElement.addEventListener('mouseleave', (event: MouseEvent) => {
        if (mouseButtonDown) {
          ws.emit('mouse-up', {
            x: lastCol,
            y: lastRow,
            button: lastButton,
            shift: event.shiftKey,
            ctrl: event.ctrlKey,
            alt: event.altKey
          });
          mouseButtonDown = false;
          lastButton = -1;
        }
      });
    }

    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Handle F1 key for help
      if (loginState.current === 'loggedin') {
        if (event.key === 'F1' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          ws.emit('command', '\x1b[OP');
          return false;
        }
      }

      // Track key state for simultaneous input (for doors/games)
      // Only track game-relevant keys to avoid overhead
      const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Space',
                        'w', 'a', 's', 'd', 'W', 'A', 'S', 'D',
                        'Enter', 'Escape', 'Shift', 'Control', 'Alt'];

      if (loginState.current === 'loggedin' && doorActive.current && gameKeys.includes(event.key)) {
        if (event.type === 'keydown') {
          // Key pressed - update state and emit if new press (not a repeat)
          if (!keyState.current[event.key]) {
            keyState.current[event.key] = true;
            ws.emit('keys:state', {
              key: event.key,
              pressed: true,
              keyState: { ...keyState.current }
            });
          }

          // Prevent default for arrow keys to avoid scrolling
          if (event.key.startsWith('Arrow')) {
            event.preventDefault();
            return false;
          }
        } else if (event.type === 'keyup') {
          // Key released - update state and emit
          if (keyState.current[event.key]) {
            keyState.current[event.key] = false;
            ws.emit('keys:state', {
              key: event.key,
              pressed: false,
              keyState: { ...keyState.current }
            });
          }
        }
      }

      return true;
    });

    ws.on('prompt-login', () => {
      // Check if auto-login is enabled
      const autoLoginEnabled = localStorage.getItem('bbs_auto_login_enabled') === 'true';
      const savedUsername = localStorage.getItem('bbs_saved_username');
      const savedPassword = localStorage.getItem('bbs_saved_password');

      if (autoLoginEnabled && savedUsername && savedPassword) {
        // Auto-login with saved credentials
        const decodedUsername = atob(savedUsername);
        const decodedPassword = atob(savedPassword);

        term.write(`\x1b[36m[Quick Connect] Logging in as ${decodedUsername}...\x1b[0m\r\n`);

        // Skip username prompt, go straight to password check
        newUserPromptUsername.current = decodedUsername;
        ws.emit('check-username', { username: decodedUsername });
        loginState.current = 'checking-username';

        // Wait for password prompt, then auto-submit
        const autoLoginHandler = () => {
          if (loginState.current === 'password') {
            password.current = decodedPassword;
            ws.emit('login', { username: decodedUsername, password: decodedPassword });
            loginState.current = 'loggedin';
            ws.off('prompt-password', autoLoginHandler);
          }
        };

        ws.on('prompt-password', autoLoginHandler);
      } else {
        // Normal login flow
        term.write('Username: ');
        loginState.current = 'username';
      }

      term.focus();
    });

    return () => {
      term.dispose();
      ws.disconnect();
    };
  }, []);

  return (
    <div
      ref={terminalRef}
      id="terminal"
      style={{
        width: '100%',
        height: '100vh',
        fontSize: '16px',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none'
      }}
    />
  );
}

// Global refs for login state
const loginState = { current: 'connecting' as 'connecting' | 'username' | 'checking-username' | 'password' | 'new-user-prompt' | 'loggedin' };
const username = { current: '' };
const password = { current: '' };
const newUserPromptUsername = { current: '' };
const passwordMode = { current: false };

// Handle file upload
function handleFileUpload(options: any, ws: Socket, term: XTermTerminal) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = options.accept;
  input.style.display = 'none';
  document.body.appendChild(input);

  input.onchange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) {
      document.body.removeChild(input);
      return;
    }

    if (file.size > options.maxSize) {
      term.write(`\r\n\x1b[31m✗ Error: File too large (max ${Math.round(options.maxSize / 1024 / 1024)}MB)\x1b[0m\r\n`);
      document.body.removeChild(input);
      return;
    }

    term.write(`\r\n\x1b[36mUploading ${file.name}...\x1b[0m\r\n`);

    try {
      const formData = new FormData();
      formData.append(options.fieldName, file);

      const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const backendUrl = isDevelopment ? 'http://localhost:3001' : (import.meta.env.VITE_API_URL || 'https://amiexpress-backend.onrender.com');
      const uploadUrl = `${backendUrl}${options.uploadUrl}`;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      ws.emit('file-uploaded', {
        filename: result.filename,
        originalname: result.originalname,
        size: result.size,
        path: result.path
      });

      term.write(`\x1b[32m✓ Upload complete\x1b[0m\r\n`);
    } catch (error) {
      term.write(`\r\n\x1b[31m✗ Upload failed: ${(error as Error).message}\x1b[0m\r\n`);
    }

    document.body.removeChild(input);
  };

  input.click();
}

// Handle file download
function handleFileDownload(options: any, ws: Socket, term: XTermTerminal) {
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const backendUrl = isDevelopment ? 'http://localhost:3001' : (import.meta.env.VITE_API_URL || 'https://amiexpress-backend.onrender.com');
  const downloadUrl = `${backendUrl}${options.downloadUrl}`;

  term.write(`\r\n\x1b[36mStarting download: ${options.filename}\x1b[0m\r\n`);
  term.write(`\x1b[32mSize: ${Math.ceil(options.size / 1024)}KB\x1b[0m\r\n\r\n`);

  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = options.filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);

  anchor.click();

  ws.emit('file-download-started', {
    filename: options.filename,
    fileId: options.fileId
  });

  term.write(`\x1b[32m✓ Download started - check your browser's download folder\x1b[0m\r\n`);

  setTimeout(() => {
    document.body.removeChild(anchor);
  }, 100);
}

// Handle login input
function handleLoginInput(data: string, ws: Socket, term: XTermTerminal) {
  if (data === '\r' || data === '\n') {
    if (loginState.current === 'new-user-prompt') {
      const response = username.current.trim().toUpperCase();
      username.current = '';
      loginState.current = 'loggedin';
      ws.emit('new-user-response', {
        response: response || 'C',
        username: newUserPromptUsername.current
      });
      term.write('\r\n');
      return;
    } else if (loginState.current === 'username') {
      if (username.current.trim().length === 0) {
        term.write('\r\nUsername cannot be empty. Username: ');
        return;
      }
      const submittedUsername = username.current;
      ws.emit('check-username', { username: submittedUsername });
      username.current = '';
      loginState.current = 'checking-username';
      newUserPromptUsername.current = submittedUsername;
      term.write('\r\n');
    } else if (loginState.current === 'password') {
      const pwd = password.current;
      password.current = '';
      if (pwd.trim().length === 0) {
        term.write('\r\nPassword cannot be empty. Password: ');
        return;
      }
      if (!ws.connected) {
        term.write('\r\n\x1b[33mConnecting to BBS server...\x1b[0m\r\n');
        const connectionTimeout = setTimeout(() => {
          if (!ws.connected) {
            term.write('\r\n\x1b[31mConnection timeout. Please refresh the page and try again.\x1b[0m\r\n');
            term.write('Username: ');
            loginState.current = 'username';
            username.current = '';
            password.current = '';
          }
        }, 30000);

        const onConnect = () => {
          clearTimeout(connectionTimeout);
          term.write('\r\n\x1b[32mConnected! Logging in...\x1b[0m\r\n');
          ws.emit('login', { username: newUserPromptUsername.current, password: pwd });
          loginState.current = 'loggedin';
          ws.off('connect', onConnect);
        };

        ws.on('connect', onConnect);
        return;
      }

      ws.emit('login', { username: newUserPromptUsername.current, password: pwd });
      loginState.current = 'loggedin';
    }
  } else if (data === '\x7f' || data === '\b') {
    if ((loginState.current === 'username' || loginState.current === 'new-user-prompt') && username.current.length > 0) {
      username.current = username.current.slice(0, -1);
      term.write('\b \b');
    } else if (loginState.current === 'password' && password.current.length > 0) {
      password.current = password.current.slice(0, -1);
      term.write('\b \b');
    }
  } else if (data.length === 1 && data >= ' ' && data <= '~') {
    if (loginState.current === 'username' || loginState.current === 'new-user-prompt') {
      username.current += data;
      term.write(data);
    } else if (loginState.current === 'password') {
      password.current += data;
      term.write('*');
    }
  }
}

export default Terminal;
