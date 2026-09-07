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
  if (session.petsciiMode !== true) return text;      // non-C64: never wrapped here, at any width
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
 * `startCol` is where the cursor already is, and the returned `col` is where
 * it ends up - so the fold can carry across the chunks a screen arrives in.
 */
export function foldFrom(text: string, cols: number, startCol: number): { out: string; col: number } {
  if (cols <= 0) return { out: text, col: startCol };
  let out = '';
  let col = Math.max(0, startCol);
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '\x1b') {
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
    if (ch === '\t') { col = Math.min(cols, (Math.floor(col / 8) + 1) * 8); out += ch; i++; continue; }
    if (code < 0x20 || code === 0x7f) { out += ch; i++; continue; }
    if (col >= cols) { out += '\r\n'; col = 0; }
    out += ch;
    col++;
    i++;
  }
  return { out, col };
}

/** One chunk, from column 0. The stateless form the unit tests read. */
export function foldAtColumn(text: string, cols: number): string {
  return foldFrom(text, cols, 0).out;
}

/** The column the wire fold has reached for this session - carried across chunks. */
interface WireFoldState { wireFoldColumn?: number }

/**
 * THE BOARD'S SCREENS FOLDED AT 80 FOR A WIDER CALLER, at the wire.
 *
 * This board's screens are 80-column documents whose layout is defined by
 * the terminal wrapping at column 80: rows 3 and 4 of Screens/MENU.TXT are
 * 155 and 159 printable columns, and 623 screens in the tree carry a row past
 * 80. A telnet window that negotiated NAWS 200x66 never wraps, and the art
 * arrives strung out to the right (sysop, 2026-09-07, MENU and then BBSTITLE).
 *
 * WHERE IT LIVES, AND WHY NOT IN emitText. It sat in `wrapForSession` first,
 * and the MENU folded while BBSTITLE stayed "wide as ever": a screen with a
 * wipe code goes out through `emitText`, and one without a wipe code goes out
 * through the MCI parser's INLINE mode, which writes to the socket itself -
 * as do the wipe frames and half a dozen direct emits. `emitText` was the
 * choke for prose reflow; it was never the choke for BYTES. The one place
 * every screen string becomes bytes for a byte caller is the connection
 * emitter's `ansi-output` branch, and that is where this is called from.
 *
 * STATEFUL, because a screen arrives in chunks and the terminal's column does
 * not reset between them: `session.wireFoldColumn` is where the fold left the
 * cursor. A chunk that positions the cursor absolutely is passed through
 * untouched - it does not depend on the wrap - and the column is taken as 0
 * after it, which is where every screen of this board's leaves it.
 *
 * Only a NON-PETSCII caller WIDER than 80. Exactly 80 stays byte-identical
 * (tests/server/eighty-col-choke-identity.test.ts), a narrower browser is
 * left alone, and a C64 has its own reflow.
 */
export function foldForWire(
  text: string,
  session: ({ screenWidth?: number; wireWidth?: number; petsciiMode?: boolean } & WireFoldState) | null | undefined,
): string {
  if (!session || session.petsciiMode === true) return text;
  /**
   * The caller's REAL terminal width, which is not `screenWidth`.
   *
   * `screenWidth` is the board's column MODEL - the width its 80-column
   * screens and its doors are drawn for - and the graphics-prompt handler
   * deliberately resets it to 80 for an ANSI caller (pre-login.ts, express.e
   * :29538). The fold is a WIRE concern: it needs how wide the terminal on
   * the other end actually is, so it knows an 80-column screen will stream
   * out to the right instead of wrapping. That is `wireWidth`, set from NAWS
   * / the PTY size at negotiation and never touched by the mode reset. It was
   * conflating the two that made the fold read 80 and never fire for a wide
   * telnet caller (measured 2026-09-07: title emitted at screenWidth 80 while
   * NAWS had reported 200).
   */
  const reported = session.wireWidth ?? session.screenWidth;
  if (typeof reported !== 'number' || reported <= 80) return text;
  if (doorOwnsTerminal(session as any)) { session.wireFoldColumn = 0; return text; }
  /**
   * Every screen of this board's opens `ESC[2J ESC[H` - clear, then home -
   * and that is not the art positioning its rows; it is where the art
   * STARTS. Measured on the live board with a 200x66 probe: the title
   * arrived as one chunk with that preamble and rows of 1427 cells behind it,
   * untouched, because the preamble tripped the check meant for art that
   * addresses the cursor row by row. So the preamble is passed through, the
   * column is 0 after it, and the check is asked about the rest.
   */
  const preamble = leadingClearAndHome(text);
  const body = text.slice(preamble.length);
  if (positionsCursorAbsolutely(body)) { session.wireFoldColumn = 0; return text; }
  const startCol = preamble.length > 0 ? 0 : (session.wireFoldColumn ?? 0);
  const { out, col } = foldFrom(body, 80, startCol);
  session.wireFoldColumn = col;
  return preamble + out;
}

/**
 * The run of screen-clearing and homing sequences a chunk opens with: ED
 * (`ESC[2J`, `ESC[J`), a home (`ESC[H`, `ESC[1;1H`, `ESC[;H`), SGR and DEC
 * private-mode sets, in any order. Stops at the first byte that is not one
 * of those.
 */
export function leadingClearAndHome(text: string): string {
  const re = /^(?:\x1b\[(?:[0-2]?J|(?:1?;?1?)H|f|[0-9;]*m|\?[0-9;]*[hl]))+/;
  const m = re.exec(text);
  return m ? m[0] : '';
}
