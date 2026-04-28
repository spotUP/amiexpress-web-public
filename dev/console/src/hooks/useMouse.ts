import { useEffect } from 'react';
import * as fs from 'fs';

const DEBUG_LOG = process.env['CONSOLE_MOUSE_DEBUG']
  ? '/tmp/console-mouse-debug.log'
  : null;
function dbg(msg: string) {
  if (DEBUG_LOG) {
    try { fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${msg}\n`); } catch {}
  }
}

export interface MouseClick {
  col: number;   // 1-indexed
  row: number;   // 1-indexed
  button: number; // 0=left, 1=middle, 2=right, 64=wheel-up, 65=wheel-down
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

type Listener = (event: MouseClick) => void;

let listeners: Listener[] = [];
let initialized = false;
let buffer = '';

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;

  // Enable mouse press tracking + SGR extended coords (handles cols > 95 cleanly)
  // 1000 = button-event, 1006 = SGR extended mode
  process.stdout.write('\x1b[?1000h\x1b[?1006h');
  dbg('mouse mode enabled (1000h, 1006h)');

  // Make sure to disable on exit/signals
  const cleanup = () => {
    process.stdout.write('\x1b[?1000l\x1b[?1006l');
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });

  // SGR mouse: ESC [ < Cb ; Cx ; Cy M (press) or m (release)
  // Use a buffer because escape sequences may arrive split across reads.
  process.stdin.on('data', (chunk: Buffer | string) => {
    const incoming = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (DEBUG_LOG) dbg(`stdin data: ${JSON.stringify(incoming)}`);
    buffer += incoming;
    const re = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

    // First pass: collect all complete events from the buffer.
    // Critically: we slice the buffer BEFORE dispatching, so that any
    // listener that re-emits to stdin (e.g. a hotkey-click handler that
    // pushes a key character) does NOT re-match the mouse event we are
    // currently dispatching. Without this, a click on a hotkey hint
    // recurses until the JS stack overflows.
    const events: MouseClick[] = [];
    let match: RegExpExecArray | null;
    let lastIdx = 0;
    while ((match = re.exec(buffer)) !== null) {
      lastIdx = match.index + match[0].length;
      if (match[4] !== 'M') continue; // only fire on press, not release
      const cb = parseInt(match[1]!, 10);
      events.push({
        col: parseInt(match[2]!, 10),
        row: parseInt(match[3]!, 10),
        button: cb & 0x43,
        shift: (cb & 0x04) !== 0,
        meta:  (cb & 0x08) !== 0,
        ctrl:  (cb & 0x10) !== 0,
      });
    }
    buffer = buffer.slice(lastIdx);
    if (buffer.length > 1024) buffer = buffer.slice(-256);

    // Second pass: dispatch with a clean buffer.
    for (const ev of events) {
      for (const l of [...listeners]) l(ev);
    }
  });
}

export function useMouse(handler: Listener): void {
  useEffect(() => {
    ensureInitialized();
    listeners.push(handler);
    return () => {
      listeners = listeners.filter(l => l !== handler);
    };
  }, [handler]);
}
