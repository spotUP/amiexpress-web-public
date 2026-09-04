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

export interface MouseEvent {
  col: number;   // 1-indexed
  row: number;   // 1-indexed
  button: number; // 0=left, 1=middle, 2=right, 32=motion, 64=wheel-up, 65=wheel-down
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

/** Backward-compat alias. */
export type MouseClick = MouseEvent;

type ClickListener = (event: MouseEvent) => void;
type HoverListener = (event: { col: number; row: number }) => void;

let clickListeners: ClickListener[] = [];
let hoverListeners: HoverListener[] = [];
let initialized = false;
let buffer = '';
let lastPos = { col: 0, row: 0 };

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;

  // Enable button events (1000) + motion-on-button (1002 = press/release/motion
  // while a button is held). 1002 is enough for hover while clicking; if
  // someone wants pure hover they can change this to 1003.
  process.stdout.write('\x1b[?1000h\x1b[?1002h\x1b[?1006h');
  dbg('mouse mode enabled (1000h, 1002h, 1006h)');

  // Make sure to disable on exit/signals
  const cleanup = () => {
    process.stdout.write('\x1b[?1000l\x1b[?1002l\x1b[?1006l');
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });

  // SGR mouse: ESC [ < Cb ; Cx ; Cy M (press / motion) or m (release)
  // Use a buffer because escape sequences may arrive split across reads.
  process.stdin.on('data', (chunk: Buffer | string) => {
    const incoming = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (DEBUG_LOG) dbg(`stdin data: ${JSON.stringify(incoming)}`);
    buffer += incoming;
    const re = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

    const clicks: MouseEvent[] = [];
    const hovers: { col: number; row: number }[] = [];
    let match: RegExpExecArray | null;
    let lastIdx = 0;
    while ((match = re.exec(buffer)) !== null) {
      lastIdx = match.index + match[0].length;
      const cb = parseInt(match[1]!, 10);
      const col = parseInt(match[2]!, 10);
      const row = parseInt(match[3]!, 10);
      const isPress = match[4] === 'M';
      const isMotion = (cb & 0x20) !== 0;

      if (isMotion) {
        // Motion events: just track position, no click dispatch
        if (col !== lastPos.col || row !== lastPos.row) {
          lastPos = { col, row };
          hovers.push({ col, row });
        }
      } else if (isPress) {
        clicks.push({
          col,
          row,
          button: cb & 0x43,
          shift: (cb & 0x04) !== 0,
          meta:  (cb & 0x08) !== 0,
          ctrl:  (cb & 0x10) !== 0,
        });
      }
    }
    buffer = buffer.slice(lastIdx);
    if (buffer.length > 1024) buffer = buffer.slice(-256);

    // Dispatch hovers first, then clicks. Listeners that re-emit to stdin
    // (e.g. a hotkey-click handler) won't recurse into the same event.
    for (const h of hovers) {
      for (const l of [...hoverListeners]) l(h);
    }
    for (const ev of clicks) {
      for (const l of [...clickListeners]) l(ev);
    }
  });
}

export function useMouse(handler: ClickListener): void {
  useEffect(() => {
    ensureInitialized();
    clickListeners.push(handler);
    return () => {
      clickListeners = clickListeners.filter(l => l !== handler);
    };
  }, [handler]);
}

export function useHover(handler: HoverListener): void {
  useEffect(() => {
    ensureInitialized();
    hoverListeners.push(handler);
    return () => {
      hoverListeners = hoverListeners.filter(l => l !== handler);
    };
  }, [handler]);
}

export function getMousePos(): { col: number; row: number } {
  return lastPos;
}