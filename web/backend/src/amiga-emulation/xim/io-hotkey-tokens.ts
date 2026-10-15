/**
 * XIM Hotkey Token Processing
 *
 * Pure function: converts raw input tokens (single chars or escape sequences)
 * from web terminal encoding to Amiga-expected key codes.
 * Extracted from XIMIOHandler to keep io.ts under the 2000-line limit.
 */

import { ArrowKeyCodes, NavigationKeyCodes } from './types';
import { debugLog } from '../../utils/debug-log';

/**
 * Convert a single input token to the character the 68K door expects.
 * Returns '' to signal "ignore this token and wait for more input".
 * `navKeys`: the door is an SDK door (secret-input.ts isSdkDoorSession), so Home/End/Page Up/Page Down convert; for any other door they are dropped.
 */
export function processHotkeyToken(token: string, navKeys = false): string {
  if (token.length === 1) {
    const code = token.charCodeAt(0);

    // DEL (0x7F) -> BS (0x08): Web terminals send DEL for backspace, Amiga expects BS
    if (code === 0x7f) {
      debugLog(`[XIMIOHandler] Converting DEL (0x7f) to BS (0x08) for Amiga`);
      return '\x08';
    }

    // NOTE: Do NOT convert CR to LF for hotkeys!
    // express.e expects CR (0x0d) for Enter - see doPause() at line 5147:
    //   UNTIL (ch=13) OR (ch=32) OR (ch<0)
    // Converting CR to LF breaks Enter key in doors like AquaScan and Bulls.

    return token;
  }

  // Cursor and navigation keys - ALWAYS converted to codes.
  // Arrows match express.e behavior where ch:=UPARROW etc regardless of rawArrow.
  // Home/End/Page Up/Page Down have no express.e code; they use the board's
  // NavigationKeyCodes under the same conditions, so a door reads every one of
  // these keys the same way: as a single byte, never as an escape sequence.
  // The spellings: xterm (ESC[H, ESC[F, ESC[5~, ESC[6~) and the VT220/linux
  // telnet forms (ESC[1~ Home, ESC[4~ End, ESC[7~ Home, ESC[8~ End).
  const arrowMap: { [key: string]: number } = {
    '\x1b[A': ArrowKeyCodes.UPARROW,    // 4
    '\x1b[B': ArrowKeyCodes.DOWNARROW,  // 5
    '\x1b[C': ArrowKeyCodes.RIGHTARROW, // 3
    '\x1b[D': ArrowKeyCodes.LEFTARROW,  // 2
    '\x1b[H': NavigationKeyCodes.HOME,
    '\x1b[1~': NavigationKeyCodes.HOME,
    '\x1b[7~': NavigationKeyCodes.HOME,
    '\x1b[F': NavigationKeyCodes.END,
    '\x1b[4~': NavigationKeyCodes.END,
    '\x1b[8~': NavigationKeyCodes.END,
    '\x1b[5~': NavigationKeyCodes.PGUP,
    '\x1b[6~': NavigationKeyCodes.PGDN,
  };

  const navCodes: number[] = Object.values(NavigationKeyCodes);
  if (arrowMap[token] !== undefined && (navKeys || !navCodes.includes(arrowMap[token]))) {
    const arrowCode = arrowMap[token];
    debugLog(`[XIMIOHandler] Cursor/navigation key: ${JSON.stringify(token)} -> code ${arrowCode}`);
    return String.fromCharCode(arrowCode);
  }

  // Ignore unrecognized escape sequences (Insert, Delete, function keys, etc.)
  // These would confuse 68K doors if we passed ESC or partial sequences
  if (token.length > 1 && token.startsWith('\x1b')) {
    debugLog(`[XIMIOHandler] Ignoring unrecognized escape sequence: ${JSON.stringify(token)}`);
    return '';  // Return empty to signal "skip this input"
  }

  // For other multi-char tokens (shouldn't happen), return first char
  if (token.length > 1) {
    debugLog(`[XIMIOHandler] Multi-char token, returning first: ${token.charCodeAt(0)}`);
  }
  return token[0];
}
