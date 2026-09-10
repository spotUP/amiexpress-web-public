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
 * - Deliberately absent (no counterpart here): F-keys (Moebius font
 *   slots), H/J/K/L charlist, Q insert, Alt+Numpad ascii entry, Alt+arrows
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
    if (k === 'c') return { action: 'copy' };
    if (k === 'x') return { action: 'cut' };
    if (k === 'v') return { action: 'paste' };
    if (ev.code && ev.code in DIGIT_INDEX) return { action: 'fg', index: DIGIT_INDEX[ev.code] };
    return { action: 'none' };
  }

  if (ev.altKey && !ev.ctrlKey && !ev.metaKey && ev.code) {
    if (ev.code in DIGIT_INDEX) return { action: 'bg', index: DIGIT_INDEX[ev.code] };
    if (ev.code === 'KeyC') return { action: 'copy' };
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
      case 'Delete':
      case 'Backspace':
        return { action: 'delete' };
      default: return { action: 'none' };
    }
  }

  return { action: 'none' };
}
