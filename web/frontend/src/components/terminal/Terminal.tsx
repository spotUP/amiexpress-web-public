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
      scrollback: 0,
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
      term.write(data);
      // Ensure terminal updates and scrolls to show new content even without focus
      term.scrollToBottom();
      term.refresh(0, term.rows - 1);
    });

    ws.on('login-success', (data: any) => {
      console.log('Login successful:', data);
      if (data && data.token) {
        localStorage.setItem('bbs_auth_token', data.token);
      }
      ws.emit('get-font-preference');
      term.focus();
    });

    ws.on('login-failed', (reason: string) => {
      console.log('Login failed:', reason);
      localStorage.removeItem('bbs_auth_token');
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
      term.options.fontFamily = `${data.font}, "Courier New", monospace`;
      term.options.fontSize = metrics.size;
      term.options.lineHeight = metrics.lineHeight;
      term.refresh(0, term.rows - 1);
    });

    ws.on('font-changed', (data: { font: string }) => {
      const metrics = fontMetrics[data.font] || { size: 16, lineHeight: 1.0 };
      term.options.fontFamily = `${data.font}, "Courier New", monospace`;
      term.options.fontSize = metrics.size;
      term.options.lineHeight = metrics.lineHeight;
      term.refresh(0, term.rows - 1);
      term.write(`\r\n\x1b[32mFont changed to ${data.font}\x1b[0m\r\n`);
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
    });

    ws.on('mouse-mode', (data: { enabled: boolean }) => {
      const termElement = terminalRef.current?.querySelector('.xterm');
      if (termElement) {
        const style = (termElement as HTMLElement).style as any;
        style.cursor = data.enabled ? 'none' : 'default';
      }
    });

    term.onData((data: string) => {
      if (loginState.current === 'username' || loginState.current === 'password' || loginState.current === 'new-user-prompt') {
        handleLoginInput(data, ws, term);
      } else if (doorActive.current) {
        ws.emit('command', data);
      } else {
        ws.emit('command', data);
      }
    });

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
      if (loginState.current === 'loggedin') {
        if (event.key === 'F1' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          ws.emit('command', '\x1b[OP');
          return false;
        }
      }
      return true;
    });

    ws.on('prompt-login', () => {
      term.write('Username: ');
      loginState.current = 'username';
      term.focus();
    });

    return () => {
      term.dispose();
      ws.disconnect();
    };
  }, []);

  return (
    <div ref={terminalRef} style={{
      width: '100%',
      height: '100vh',
      fontSize: '16px',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      MozUserSelect: 'none',
      msUserSelect: 'none'
    }} />
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
