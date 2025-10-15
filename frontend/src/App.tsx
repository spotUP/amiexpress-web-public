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

    // Connect to backend WebSocket (supports Render.com deployment)
    const backendUrl = (import.meta as any).env?.VITE_API_URL || 'https://amiexpress-web-three.vercel.app';
    const ws = io(backendUrl, {
      transports: ['websocket', 'polling'], // Prefer WebSocket, fallback to polling
      upgrade: true, // Allow transport upgrades
      rememberUpgrade: true, // Remember successful upgrades
      timeout: 20000, // Connection timeout
      forceNew: true // Force new connection to avoid stale connections
    });
    socket.current = ws;

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
      if (loginState.current === 'username' || loginState.current === 'password') {
        // Handle login input
        handleLoginInput(data, ws, term);
      } else {
        // Send input to server
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
  if (data === '\r' || data === '\n') {
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
      // Attempt login
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