/**
 * Session-width word wrap (pulled into the petscii-full-canvas plan as
 * Task 10 from the C64/40-col plan's Task 4).
 *
 * The one choke point for prose reflow. Guards keep it provably inert
 * where it must be:
 *  - non-PETSCII session: IDENTITY. `session.petsciiMode === true` is the
 *    single source of truth for "is this a C64 caller" - the same gate
 *    `doorScreenWidth()` (web/backend/src/amiga-emulation/xim/screen-width.util.ts)
 *    uses for door width. That file was landing concurrently with this one
 *    and isn't committed yet, so the gate is inlined here rather than
 *    imported; once it lands this should call it instead of duplicating
 *    the check. Gating on `screenWidth` alone was wrong: socket-handlers.ts
 *    sets `session.screenWidth` from real xterm dimensions for EVERY web
 *    socket, C64 or not, so an ordinary user with a narrow browser window
 *    or on mobile would have gotten help/mail/bulletins word-wrapped -
 *    non-C64 platforms never pay for C64 support.
 *  - width >= 80: IDENTITY (80-col output byte-for-byte unchanged).
 *  - door-owned session: IDENTITY (doors paint their own screens).
 *  - payload with cursor motion/positioning/clear/save-restore: IDENTITY
 *    (positioned UI and ANSI art are never rewrapped - "never squeeze
 *    art"). Detected by `positionsCursorAbsolutely`
 *    (web/backend/src/utils/ascii-art.util.ts) - the same detector
 *    xim/io.ts's line-wrap safety net uses, so there is one definition of
 *    "this line paints a screen," not a second regex that can drift from
 *    it (it did: the previous local regex missed G/d/E/F, which the
 *    blessed engine emits).
 *
 * printableLength/wrapLineToWidth are pure and live in the SDK
 * (sdk/petscii/wrap.ts) so the C64 Door Adapter plan can reuse them without
 * pulling in web/backend. Only the session-aware guards live here.
 */
import { printableLength, wrapLineToWidth } from '@amiexpress/bbs-door-sdk/petscii';
import { doorOwnsTerminal } from './door-owns-terminal';
import { positionsCursorAbsolutely } from './ascii-art.util';
import { doorScreenWidth } from '../amiga-emulation/xim/screen-width.util';

export { printableLength, wrapLineToWidth };

export function wrapForSession(
  text: string,
  session: { screenWidth?: number; petsciiMode?: boolean } | undefined
): string {
  if (!session) return text;
  if (session.petsciiMode !== true) {
    /**
     * A NON-PETSCII CALLER WIDER THAN THE BOARD'S SCREENS (2026-09-07).
     *
     * This board's screens are 80-column documents whose layout is defined by
     * the terminal wrapping at column 80: rows 3 and 4 of Screens/MENU.TXT are
     * 155 and 159 printable columns, and 623 screens in the tree carry a row
     * past 80. On an 80-column terminal every one of them folds where the
     * artist expected. The sysop's telnet window reported `NAWS: 200x66`, so
     * nothing folded, and the menu's logo arrived strung out across the top of
     * the screen with its last row apparently duplicated ("when the menu
     * animation finishes it looks like this").
     *
     * The art is not the wrong level to fix that at - the art is what the
     * artist drew - and neither is the terminal, which is doing exactly what
     * it was asked. The board folds its own screens at 80, the way the
     * 80-column terminal would have, deferred wrap and all (`foldAtColumn`).
     *
     * Only WIDER than 80. Exactly 80 stays byte-identical (the identity gate
     * in tests/server/eighty-col-choke-identity.test.ts), and a narrower
     * non-PETSCII caller is still left alone - a mobile browser's xterm never
     * paid for width support and still does not. A door that owns the screen
     * paints at its own width; a positioned screen does not depend on the
     * wrap and is never touched.
     */
    const reported = session.screenWidth;
    if (typeof reported === 'number' && reported > 80) {
      if (doorOwnsTerminal(session as any)) return text;
      if (positionsCursorAbsolutely(text)) return text;
      return foldAtColumn(text, 80);
    }
    return text;                                       // 80 or narrower: never wrapped
  }
  // doorScreenWidth() - the SAME authority BB_SCRWIDTH, the launch-time
  // lineWrap, BBSApi.getTerminalSize() and wrapDoorTextForSession already
  // use. A local `screenWidth || 80` read the stale 80 a PETSCII session
  // keeps when nothing stamped 40 on it (index.ts's terminal-type listener
  // sets petsciiMode and then calls applyClientReportedGeometry, which
  // REFUSES to write geometry for a PETSCII session), and this file went
  // identity while every other reader answered 40.
  const width = doorScreenWidth(session, 80);
  if (width >= 80) return text;                       // 80-col: byte-identical
  if (doorOwnsTerminal(session as any)) return text;  // door paints the screen
  return wrapPassingArt(text, width);
}

/**
 * The same choke for a TypeScript door's own prose (`BBSApi.write` /
 * `writeLine`) - C64/40-col plan, Task 8.
 *
 * Two things differ from `wrapForSession`, both because the caller here IS
 * the door:
 *  - the door-owned guard is deliberately absent. That guard exists to stop
 *    the BBS painting over a door's screen; a door writing its own prose is
 *    the case it must not swallow, and it swallowed all of it (every TS
 *    door runs with subState DOOR_RUNNING).
 *  - the width is `doorScreenWidth()`, the same authority
 *    `BBSApi.getTerminalSize()` hands the door, so a PETSCII session still
 *    carrying the stale 80 its browser xterm reported before the caller
 *    answered `P` is wrapped at the 40 its screen actually is.
 *
 * Everything else is the same, and the positioned-output guard is what
 * makes this safe for blessed doors: a screen frame carries absolute
 * cursor motion, so it is returned untouched, byte for byte.
 */
export function wrapDoorTextForSession(
  text: string,
  session: { screenWidth?: number; petsciiMode?: boolean } | undefined
): string {
  if (!session) return text;
  if (session.petsciiMode !== true) return text;      // non-C64: never wrapped, at any width
  const width = doorScreenWidth(session, 80);
  if (width >= 80) return text;                       // 80-col: byte-identical
  return wrapPassingArt(text, width);
}

/** Wrap prose to `width`, passing anything that paints a screen untouched. */
function wrapPassingArt(text: string, width: number): string {
  if (positionsCursorAbsolutely(text)) return text;   // positioned UI / art / clears / save-restore
  return text
    .split(/\r\n|\n/)
    .map((l) => wrapLineToWidth(l, width).join('\r\n'))
    .join('\r\n');
}

/**
 * The 80-column terminal's autowrap, done by the board.
 *
 * Walks the bytes the way a terminal reads them and inserts `\r\n` where a
 * terminal `cols` wide would have wrapped: BEFORE the first printable
 * character past the last column, never after the last one - xterm's deferred
 * wrap, which is what keeps a row of exactly `cols` followed by a newline from
 * gaining a blank row. Escape sequences cost no columns and are copied whole;
 * CR and LF return to column 0; backspace steps back one; TAB advances to the
 * next stop. Everything else is copied as it came.
 *
 * Pure and stateless: a column count starts at 0 for the text it is given, so
 * a row split across two `emitText` calls is folded against each call's own
 * count. Screens arrive whole, which is the case this exists for.
 */
export function foldAtColumn(text: string, cols: number): string {
  if (cols <= 0) return text;
  let out = '';
  let col = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '\x1b') {
      // CSI: ESC [ params final. Anything else: ESC + one byte.
      let j = i + 1;
      if (text[j] === '[') {
        j++;
        while (j < n && text.charCodeAt(j) >= 0x20 && text.charCodeAt(j) <= 0x3f) j++;
        if (j < n) j++;
      } else if (j < n) {
        j++;
      }
      out += text.slice(i, j);
      i = j;
      continue;
    }
    const code = text.charCodeAt(i);
    if (ch === '\r' || ch === '\n') { col = 0; out += ch; i++; continue; }
    if (code === 0x08) { if (col > 0) col--; out += ch; i++; continue; }
    if (ch === '\t') {
      const next = (Math.floor(col / 8) + 1) * 8;
      col = Math.min(cols, next);
      out += ch; i++; continue;
    }
    if (code < 0x20 || code === 0x7f) { out += ch; i++; continue; }
    // A printable character: the wrap is owed only now, and only if the row
    // is already full.
    if (col >= cols) { out += '\r\n'; col = 0; }
    out += ch;
    col++;
    i++;
  }
  return out;
}

