import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { SmileyPicker } from './SmileyPicker';

interface ChatMessage {
  id: string;
  pageId: string;
  senderId: string;
  senderHandle: string;
  senderType: 'user' | 'sysop';
  message: string;
  timestamp: number;
  nodeId: number;
}

interface OperatorChatTerminalProps {
  messages: ChatMessage[];
  userHandle: string;
  userTypingBuffer: string;
  onSendMessage: (message: string) => void;
  onEndChat: () => void;
  onKeystroke?: (keystroke: string) => void;
}

export function OperatorChatTerminal({
  messages,
  userHandle,
  userTypingBuffer,
  onSendMessage,
  onEndChat,
  onKeystroke,
}: OperatorChatTerminalProps) {
  // Always the latest callback, without rebuilding the terminal.
  const onKeystrokeRef = useRef(onKeystroke);
  onKeystrokeRef.current = onKeystroke;
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputBufferRef = useRef<string>('');
  const lastMessageCountRef = useRef<number>(0);
  const lastUserTypingRef = useRef<string>('');

  // Format timestamp for display
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // Write a chat message to terminal
  const writeMessage = useCallback((term: Terminal, msg: ChatMessage) => {
    const timeColor = msg.senderType === 'sysop' ? '\x1b[36m' : '\x1b[33m'; // Cyan for sysop, yellow for user
    const nameColor = msg.senderType === 'sysop' ? '\x1b[32m' : '\x1b[34m'; // Green for sysop, blue for user
    const reset = '\x1b[0m';

    term.write(`${timeColor}[${formatTime(msg.timestamp)}]${reset} `);
    term.write(`${nameColor}${msg.senderHandle}:${reset} `);
    term.write(`${msg.message}\r\n`);
  }, []);

  // Update the typing preview line (bottom of terminal)
  const updateTypingPreview = useCallback((term: Terminal, userTyping: string, sysopTyping: string) => {
    // Save cursor position
    term.write('\x1b[s');

    // Move to line 23 (typing preview area) and clear it
    term.write('\x1b[23;1H\x1b[K');

    // Show user typing if they're typing
    if (userTyping) {
      term.write(`\x1b[33m[${userHandle}]\x1b[90m ${userTyping}\x1b[0m`);
    }

    // Move to line 24 (input line) and clear it
    term.write('\x1b[24;1H\x1b[K');

    // Show sysop input prompt
    term.write(`\x1b[32m[Sysop]\x1b[0m ${sysopTyping}\x1b[7m \x1b[0m`); // Block cursor

    // Restore cursor (not needed since we're at the end of input)
  }, [userHandle]);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = new Terminal({
      rows: 24,
      cols: 80,
      cursorBlink: true,
      cursorStyle: 'block',
      theme: {
        background: '#000000',
        foreground: '#00ff00',
        cursor: '#00ff00',
        cursorAccent: '#000000',
        black: '#000000',
        red: '#cd0000',
        green: '#00cd00',
        yellow: '#cdcd00',
        blue: '#0000ee',
        magenta: '#cd00cd',
        cyan: '#00cdcd',
        white: '#e5e5e5',
        brightBlack: '#7f7f7f',
        brightRed: '#ff0000',
        brightGreen: '#00ff00',
        brightYellow: '#ffff00',
        brightBlue: '#5c5cff',
        brightMagenta: '#ff00ff',
        brightCyan: '#00ffff',
        brightWhite: '#ffffff',
      },
      fontFamily: '"mOsOul", "Topaz_a500_v1.0", "Courier New", monospace',
      fontSize: 16,
      lineHeight: 1.2,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Set up scroll region (lines 1-22 for messages, 23-24 for typing/input)
    terminal.write('\x1b[1;22r'); // Set scroll region to lines 1-22

    // Display welcome message
    terminal.write('\x1b[32m*** Operator Chat Terminal ***\x1b[0m\r\n');
    terminal.write('\x1b[36mType your message and press Enter to send.\x1b[0m\r\n');
    terminal.write('\x1b[36mType /quit or /end to exit chat.\x1b[0m\r\n');
    terminal.write('\x1b[90m' + '-'.repeat(78) + '\x1b[0m\r\n');

    // Handle keyboard input via onData (handles all input including paste)
    // We use onData instead of onKey to avoid double-handling of characters
    terminal.onData((data) => {
      // Handle Enter key
      if (data === '\r' || data === '\n') {
        const input = inputBufferRef.current.trim();
        inputBufferRef.current = '';

        if (input) {
          // Check for commands
          if (input.toLowerCase() === '/quit' || input.toLowerCase() === '/end') {
            onEndChat();
            return;
          }

          // Send message
          onSendMessage(input);
        }

        // Send Enter keystroke for real-time transmission
        if (onKeystrokeRef.current) {
          onKeystrokeRef.current('Enter');
        }

        // Update display
        updateTypingPreview(terminal, lastUserTypingRef.current, '');
        return;
      }

      // Handle Backspace (DEL character \x7f or BS \x08)
      if (data === '\x7f' || data === '\x08') {
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          // Send Backspace keystroke for real-time transmission
          if (onKeystrokeRef.current) {
            onKeystrokeRef.current('Backspace');
          }
          updateTypingPreview(terminal, lastUserTypingRef.current, inputBufferRef.current);
        }
        return;
      }

      // Ignore arrow keys and other escape sequences
      if (data.startsWith('\x1b')) {
        return;
      }

      // Ignore other control characters
      if (data.length === 1 && data.charCodeAt(0) < 32) {
        return;
      }

      // Handle printable characters (including paste - multiple chars at once)
      inputBufferRef.current += data;
      // Send keystrokes for real-time transmission (each character)
      if (onKeystrokeRef.current) {
        for (const char of data) {
          onKeystrokeRef.current(char);
        }
      }
      updateTypingPreview(terminal, lastUserTypingRef.current, inputBufferRef.current);
    });

    // Initial typing preview
    updateTypingPreview(terminal, '', '');

    // Handle resize
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
    };
    // onKeystroke is deliberately not a dependency: it is read through
    // onKeystrokeRef, because rebuilding the terminal on every parent render
    // would discard the conversation on screen.
  }, [onSendMessage, onEndChat, updateTypingPreview]);

  // Handle new messages
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;

    // Only process new messages
    const newMessages = messages.slice(lastMessageCountRef.current);
    if (newMessages.length === 0) return;

    lastMessageCountRef.current = messages.length;

    // Move cursor to scroll region and write messages
    term.write('\x1b[s'); // Save cursor
    term.write('\x1b[22;1H'); // Move to end of scroll region

    newMessages.forEach((msg) => {
      writeMessage(term, msg);
    });

    // Restore typing preview
    updateTypingPreview(term, lastUserTypingRef.current, inputBufferRef.current);
  }, [messages, writeMessage, updateTypingPreview]);

  // Handle user typing updates
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;

    if (userTypingBuffer !== lastUserTypingRef.current) {
      lastUserTypingRef.current = userTypingBuffer;
      updateTypingPreview(term, userTypingBuffer, inputBufferRef.current);
    }
  }, [userTypingBuffer, updateTypingPreview]);

  // Handle smiley insertion
  const handleSmileySelect = useCallback((smiley: string) => {
    const term = xtermRef.current;
    if (!term) return;

    // Add smiley to input buffer
    inputBufferRef.current += smiley;

    // Send keystrokes for real-time transmission
    if (onKeystroke) {
      for (const char of smiley) {
        onKeystroke(char);
      }
    }

    // Update the display
    updateTypingPreview(term, lastUserTypingRef.current, inputBufferRef.current);

    // Focus the terminal
    term.focus();
  }, [onKeystroke, updateTypingPreview]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={terminalRef}
        className="w-full h-full bg-surface-0 rounded-lg"
        style={{ minHeight: '500px' }}
      />
      {/* Smiley Picker - positioned at bottom right corner */}
      <div className="absolute bottom-2 right-2 z-10">
        <SmileyPicker onSelect={handleSmileySelect} />
      </div>
    </div>
  );
}
