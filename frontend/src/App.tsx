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
      fontFamily: 'MicroKnight_v1.0, "Courier New", monospace',
      fontSize: 14,
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
      scrollback: 1000
    });

    // Add canvas addon for better performance and authentic rendering
    const canvasAddon = new CanvasAddon();
    term.loadAddon(canvasAddon);

    // Open terminal in the DOM
    term.open(terminalRef.current);
    terminal.current = term;

    // Connect to backend WebSocket
    const ws = io(window.location.origin);
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
      // Send input to server
      ws.emit('command', data);
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

    // Auto-login for demo (replace with proper login UI)
    setTimeout(() => {
      ws.emit('login', { token: 'demo-token' });
    }, 1000);

    // Cleanup
    return () => {
      term.dispose();
      ws.disconnect();
    };
  }, []);

  return (
    <div className="App">
      <div ref={terminalRef} style={{ width: '100%', height: '100vh' }} />
    </div>
  );
}

export default App;