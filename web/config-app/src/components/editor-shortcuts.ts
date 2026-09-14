/**
 * Keyboard shortcuts for the admin ANSI editor, after Moebius
 * (hlotvonen/moebiusXBIN, app/document/input/keyboard.js).
 *
 * Pure decision table: the component executes the answer, like
 * key-overrides.ts does for the terminal. What maps and what does not:
 *
 * - Undo/redo: Ctrl/Cmd+Z, Ctrl+Shift+Z, Ctrl+Y (Moebius: Ctrl+Z/Y).
 * - Colours: Ctrl+Digit0-7 foreground, Alt+Digit0-7 background (Moebius
 *   number-keys-for-colours). Digits beyond 7 have no Moebius meaning.
 * - Tools: Alt+D/L/B/E/F/S/T/P (draw, line, box, ellipse, fill, select,
 *   text, pick), Alt+Shift+B/E for the filled variants. Moebius itself
 *   has no tool letters (tools are toolbar/mouse there); letters alone
 *   would eat typing, so Alt it is.
 * - Cursor: arrows (existing behaviour, now in every mode), Home/End row
 *   ends, PageUp/PageDown ten rows, Delete erases the cell.
 * - Clipboard: Alt+C/X/V everywhere; Cmd+C/X/V too on the Mac, where
 *   Option+letter types special characters and every program cuts with
 *   Command. The component lets a real page-text selection through first,
 *   so Cmd+C on highlighted help text still copies the text.
 * - Delete: both Delete and Backspace erase the cell. Mac keyboards have
 *   no forward-delete key - the key labelled Delete sends Backspace.
 * - Insert: toggles insert mode, where typing pushes the rest of the row
 *   right instead of overwriting it. Moebius spells this Q; the Insert key
 *   is what the artists reached for, and nothing else here wants it.
 * - Alt+Shift+C: centre the ink on the cursor's row. Beside Alt+C, which
 *   copies, because that is the key an artist's hand is already on.
 * - Deliberately absent (no counterpart here): F-keys (Moebius font
 *   slots), H/J/K/L charlist, Alt+Numpad ascii entry, Alt+arrows
 *   row/column ops, Alt+letter menu ops, Ctrl+arrows.
 */
import type { DrawingTool } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';

export interface ShortcutKey {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export type EditorShortcut =
  | { action: 'undo' }
  | { action: 'redo' }
  | { action: 'tool'; tool: DrawingTool }
  | { action: 'fg'; index: number }
  | { action: 'bg'; index: number }
  | { action: 'move'; dx: number; dy: number }
  | { action: 'row'; edge: 'start' | 'end' }
  | { action: 'page'; dy: number }
  | { action: 'delete' }
  | { action: 'copy' }
  | { action: 'cut' }
  | { action: 'paste' }
  /** Insert key: typing pushes the row right instead of overwriting it. */
  | { action: 'insert-mode' }
  /** Alt+Shift+C: centre the ink on the cursor's row between the edges. */
  | { action: 'centre-line' }
  /** Ctrl+K: take the cursor's line out, pulling the rest up. */
  | { action: 'remove-line' }
  /** Ctrl+Shift+K: push a blank line in, moving the rest down. */
  | { action: 'insert-line' }
  | { action: 'none' };

const DIGIT_INDEX: Record<string, number> = {
  Digit0: 0, Digit1: 1, Digit2: 2, Digit3: 3,
  Digit4: 4, Digit5: 5, Digit6: 6, Digit7: 7,
};

const ALT_TOOLS: Record<string, DrawingTool> = {
  KeyD: 'draw', KeyL: 'line', KeyB: 'box', KeyE: 'ellipse',
  KeyF: 'fill', KeyS: 'select', KeyT: 'text', KeyP: 'pick',
};

/** The decision: what, if anything, this keystroke does in the editor. */
export function editorShortcut(ev: ShortcutKey): EditorShortcut {
  const mod = Boolean(ev.ctrlKey || ev.metaKey);

  if (mod && !ev.altKey) {
    const k = ev.key.toLowerCase();
    if (k === 'z') return ev.shiftKey ? { action: 'redo' } : { action: 'undo' };
    if (k === 'y') return { action: 'redo' };
    // Mac hands: Cmd+C/X/V cut and paste like every native program. Ctrl
    // does the same on Linux/Windows, where the browser cannot spare Cmd.
    // (Cmd+letter tools stay Alt-only: Cmd+S/T/D/F/P belong to the browser.)
    /*
     * LINES. `Ctrl+K` is the sysop's own choice ("ctrl+k to remove but i dont
     * remember which one is used to add", 2026-09-14), and it is free here.
     *
     * Worth knowing it is NOT free everywhere: the board's own door-side ANSI
     * editor binds Ctrl+K to "delete to end of line" and Ctrl+D to "delete
     * line" (sdk/engines/ui/ansi-editor/input/keyboard-handler.ts:260-268), so
     * the two editors now disagree about Ctrl+K. That is the sysop's call and
     * it is recorded here rather than silently resolved.
     *
     * Ctrl+Shift+K for the opposite, rather than the DOS-era pairing: TheDraw
     * and its descendants used Ctrl+N to insert, and a browser keeps Ctrl+N
     * for a new window - a shortcut the page never receives is worse than an
     * unfamiliar one. Shift on the same key cannot be taken away and cannot be
     * mistaken for something else.
     */
    if (k === 'k') return ev.shiftKey ? { action: 'insert-line' } : { action: 'remove-line' };
    if (k === 'c') return { action: 'copy' };
    if (k === 'x') return { action: 'cut' };
    if (k === 'v') return { action: 'paste' };
    if (ev.code && ev.code in DIGIT_INDEX) return { action: 'fg', index: DIGIT_INDEX[ev.code] };
    return { action: 'none' };
  }

  if (ev.altKey && !ev.ctrlKey && !ev.metaKey && ev.code) {
    if (ev.code in DIGIT_INDEX) return { action: 'bg', index: DIGIT_INDEX[ev.code] };
    // Shift first: Alt+C copies, and Alt+Shift+C centres the row - the
    // artists asked for centring beside the thing they already reach for.
    if (ev.code === 'KeyC') return ev.shiftKey ? { action: 'centre-line' } : { action: 'copy' };
    if (ev.code === 'KeyX') return { action: 'cut' };
    if (ev.code === 'KeyV') return { action: 'paste' };
    const tool = ALT_TOOLS[ev.code];
    if (tool) {
      if (ev.shiftKey && ev.code === 'KeyB') return { action: 'tool', tool: 'box-fill' };
      if (ev.shiftKey && ev.code === 'KeyE') return { action: 'tool', tool: 'ellipse-fill' };
      return { action: 'tool', tool };
    }
    return { action: 'none' };
  }

  if (!mod && !ev.altKey) {
    switch (ev.key) {
      case 'ArrowLeft': return { action: 'move', dx: -1, dy: 0 };
      case 'ArrowRight': return { action: 'move', dx: 1, dy: 0 };
      case 'ArrowUp': return { action: 'move', dx: 0, dy: -1 };
      case 'ArrowDown': return { action: 'move', dx: 0, dy: 1 };
      case 'Home': return { action: 'row', edge: 'start' };
      case 'End': return { action: 'row', edge: 'end' };
      case 'PageUp': return { action: 'page', dy: -10 };
      case 'PageDown': return { action: 'page', dy: 10 };
      case 'Insert': return { action: 'insert-mode' };
      case 'Delete':
      case 'Backspace':
        return { action: 'delete' };
      default: return { action: 'none' };
    }
  }

  return { action: 'none' };
}
