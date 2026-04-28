import { useCallback } from 'react';
import { useMouse, type MouseClick } from './useMouse.js';

/**
 * Parse "[k]ick  [c]hat  [↑↓] select" into clickable hotkey ranges.
 * Each `[X]` plus the non-space text immediately following it is treated
 * as one clickable target — so `[k]ick` is fully clickable, not just `[k]`.
 *
 * Multi-character bracketed labels (like the arrow nav `[↑↓]`) are skipped.
 * If the word after the bracket is empty (e.g. `[/]search` has space-separated
 * tokens), the next non-space token is included too if it appears glued.
 */
export function parseHotkeys(label: string, startCol: number):
  Array<{ key: string; from: number; to: number }> {
  const out: Array<{ key: string; from: number; to: number }> = [];
  // Single-character key inside [], optionally followed by non-space chars.
  const re = /\[([A-Za-z0-9/?!])\](\S*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(label)) !== null) {
    const from = startCol + m.index;
    const len = m[0].length;          // covers '[X]' + trailing word
    out.push({ key: m[1]!, from, to: from + len - 1 });
  }
  return out;
}

/**
 * Fake a keypress so existing `useInput` hooks pick it up.
 *
 * Ink listens for the `readable` event on stdin and calls `stdin.read()`
 * until it returns null. So we need to:
 *   1. Push our character back into the stream's internal read buffer
 *      (`unshift` keeps it next-in-line for the very next `read()`)
 *   2. Emit `readable` so Ink wakes up and calls `read()`
 *
 * `setImmediate` defers to the next tick — combined with the buffer-slice
 * in useMouse, this guarantees the synthetic key cannot re-enter the
 * mouse parser mid-loop.
 */
export function dispatchKey(key: string): void {
  setImmediate(() => {
    try {
      process.stdin.unshift(key);
      process.stdin.emit('readable');
    } catch {
      // fall back to data event if unshift isn't supported on this stream
      process.stdin.emit('data', key);
    }
  });
}

/**
 * Subscribe to mouse clicks within a single row. If the click lands on any
 * parsed hotkey range, dispatch the corresponding key.
 */
export function useHotkeyClicks(
  label: string,
  row: number,
  startCol: number,
  enabled = true,
): void {
  const handler = useCallback((e: MouseClick) => {
    if (!enabled || e.button !== 0 || e.row !== row) return;
    for (const r of parseHotkeys(label, startCol)) {
      if (e.col >= r.from && e.col <= r.to) { dispatchKey(r.key); return; }
    }
  }, [label, row, startCol, enabled]);
  useMouse(handler);
}
