/**
 * ANSI/UTF-8/PUA text stream -> PETSCII byte stream.
 *
 * Stateful and KERNAL-exact: every byte this class emits is also fed to its
 * own PetsciiMachine (`machine`), so cursor moves, color and reverse-video
 * bytes are computed against the state a real C64 (or the web canvas fed
 * the same bytes) is in - not against what the ANSI stream assumes. Raw
 * PETSCII that bypasses the transducer (.seq screens) must be `observe()`d
 * so the oracle stays in step.
 *
 * One instance per session. Backend: connection-emitter.ts keeps one on the
 * BBSSession for real C64 telnet callers. Frontend: BBSTerminal.tsx keeps
 * one per web 'P' session and feeds its output to the display machine.
 *
 * Reference: thoughts/shared/research/2026-09-01_true-petscii-reference.md
 * sections 1.1 (control codes), 1.2-1.3 (KERNAL semantics), 3 (palette).
 */
import { PetsciiMachine, type PetsciiMachineState } from './petscii-machine';
import { C64_PALETTE_COLODORE, PETSCII_COLOR_TO_VIC, hexToRgb } from './c64-palette';
import { printablePetsciiToScreenCode, screenCodeToPetscii } from './screen-codes';
import { asciiToPetsciiByte } from './ascii-to-petscii';

const COLS = 40;
const ROWS = 25;
const ESC = '\x1b';
/**
 * Longest OSC/DCS/APC/PM/SOS string held across chunks while waiting for a
 * BEL or ESC \ terminator. A sender that loses its terminator would
 * otherwise make `pending` grow without bound and be rescanned from the top
 * on every chunk (quadratic), with nothing after it ever reaching the wire.
 */
const STRING_SEQUENCE_MAX = 256;

/**
 * CSI finals whose behaviour depends on where the cursor IS, so the deferred
 * wrap has to be settled before they run. See `csi()` for why the rest must not.
 */
const SETTLES_THE_WRAP = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'd', 'J', 'K', 'X']);

export interface AnsiToPetsciiOptions {
  /** VIC-II palette used for truecolor/256-color nearest matching. Defaults to Colodore. */
  palette?: readonly string[];
}

/** VIC index -> PETSCII color control byte (inverse of PETSCII_COLOR_TO_VIC; every index has exactly one byte). */
const VIC_TO_PETSCII_COLOR: number[] = (() => {
  const table = new Array<number>(16).fill(0x05);
  for (const [byte, vic] of Object.entries(PETSCII_COLOR_TO_VIC)) table[vic] = Number(byte);
  return table;
})();

export function vicColorToPetscii(vic: number): number {
  return VIC_TO_PETSCII_COLOR[vic & 0x0F];
}

/** Nearest VIC index by squared RGB distance; an exact palette match wins immediately. */
export function nearestVicForRgb(r: number, g: number, b: number, palette: readonly string[] = C64_PALETTE_COLODORE): number {
  let best = 0;
  let bestDist = Infinity;
  for (let vic = 0; vic < 16; vic++) {
    const [pr, pg, pb] = hexToRgb(palette[vic]);
    if (pr === r && pg === g && pb === b) return vic;
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (d < bestDist) { bestDist = d; best = vic; }
  }
  return best;
}

// SGR 30-37 -> VIC (dim), 90-97 -> VIC (bright). 33/93 both yellow (C64 has one), 37 -> light grey, 97 -> white.
const SGR_DIM: number[] = [0, 2, 5, 7, 6, 4, 3, 15];
const SGR_BRIGHT: number[] = [11, 10, 13, 7, 14, 4, 3, 1];

export function sgrColorToVic(code: number, bold: boolean): number | null {
  if (code === 39) return 1;
  if (code >= 30 && code <= 37) return (bold ? SGR_BRIGHT : SGR_DIM)[code - 30];
  if (code >= 90 && code <= 97) return SGR_BRIGHT[code - 90];
  return null;
}

/** xterm 256-color index -> RGB: 0-15 via the SGR tables against `palette` (the transducer passes its own), 16-231 the 6x6x6 cube, 232-255 the grey ramp. */
export function xterm256ToRgb(n: number, palette: readonly string[] = C64_PALETTE_COLODORE): [number, number, number] {
  if (n < 16) {
    const vic = n < 8 ? SGR_DIM[n] : SGR_BRIGHT[n - 8];
    return hexToRgb(palette[vic]);
  }
  if (n <= 231) {
    const i = n - 16;
    const v = (c: number) => (c === 0 ? 0 : 55 + c * 40);
    return [v(Math.floor(i / 36)), v(Math.floor(i / 6) % 6), v(i % 6)];
  }
  const grey = 8 + 10 * (Math.min(n, 255) - 232);
  return [grey, grey, grey];
}

/**
 * The ONE absolute-cursor walk: HOME ($13) when the target is (0,0), else
 * $11/$91 runs to the row followed by $1D/$9D runs to the column, appended to
 * `out`. Extracted from the transducer's `moveTo` so the PETSCII `~x`/`~y`
 * renderer walks with the same bytes instead of growing a second writer.
 *
 * `state` is READ, never fed - the caller owns the machine and feeds the
 * bytes this appends. Deltas never wrap or scroll: the target is inside
 * 40x25, so $1D stops before column 40, $11 stops before row 25, and $9D/$91
 * are only emitted when the cursor is right of / below the target.
 */
export function petsciiMoveTo(state: PetsciiMachineState, x: number, y: number, out: number[]): void {
  if (x === 0 && y === 0) {
    if (state.cursorX !== 0 || state.cursorY !== 0) out.push(0x13);
    return;
  }
  for (let row = state.cursorY; row < y; row++) out.push(0x11);
  for (let row = state.cursorY; row > y; row--) out.push(0x91);
  for (let col = state.cursorX; col < x; col++) out.push(0x1D);
  for (let col = state.cursorX; col > x; col--) out.push(0x9D);
}

/** State of the deferred-wrap latch; see `AnsiToPetsciiTransducer.pendingWrap`. */
type PendingWrap = 'none' | 'wrapped' | 'held';

export class AnsiToPetsciiTransducer {
  readonly machine = new PetsciiMachine();
  private readonly palette: readonly string[];
  /** Incomplete escape sequence or trailing CR held until the next chunk. */
  private pending = '';
  private bold = false;
  /** What the ANSI stream asked for (SGR 7 latched); the oracle's `reverse` is what the C64 currently has. */
  private ansiReverse = false;
  private savedCursor: { x: number; y: number } | null = null;
  /**
   * Deferred wrap, xterm's "pending wrap" latch. Printing into column 39
   * moves the KERNAL cursor immediately to column 0 of the row below; ANSI
   * terminals instead stay at column 39 with a flag and only cross the
   * boundary on the NEXT printable. A newline that arrives while the flag is
   * set must therefore land on the row the wrap already reached, not the one
   * after it - otherwise every line that is exactly a multiple of 40 columns
   * long eats a blank row.
   *
   * Three states, because the two ways a row can end differ in WHERE the
   * KERNAL cursor is left:
   *  - 'none'    nothing held.
   *  - 'wrapped' a printable filled column 39 of a row above the bottom. The
   *              KERNAL cursor has ALREADY crossed to (0, r+1) while an ANSI
   *              terminal still sits on (39, r), so every operation that walks
   *              from the cursor owes one extra step back.
   *  - 'held'    a printable filled column 39 of the BOTTOM row. `printAtBottomRight`
   *              kept the KERNAL cursor on (39,24) - crossing there would scroll,
   *              and an ANSI terminal never scrolls on a printable - so both
   *              cursors agree and the scroll ANSI owes is still to come.
   * Cleared by any cursor-moving operation; consumed by newline() and by the
   * next printable.
   */
  private pendingWrap: PendingWrap = 'none';
  /**
   * VIC index the ANSI stream currently asks the BACKGROUND to be (SGR
   * 40-47/100-107/48;5/48;2), or null for "default". Per-cell background has
   * no C64 equivalent and is dropped (plan decision 5); this latch only
   * matters at the moment of a full clear.
   */
  private ansiBg: number | null = null;
  /**
   * The screen-level background committed by the last full clear (or reset).
   * Never null: "no ANSI background" is not "no opinion", it is the TERMINAL
   * DEFAULT, which on CCGMS/PyCGMS is black (0) - so a clear under SGR 0/49
   * takes the screen back to black rather than stranding whatever colour a
   * previous clear left there for an arbitrary later `$0E` to drop.
   *
   * It is an INTENT, not a mirror: whether the C64 currently has it is read
   * from the oracle (`machine.state.background`), because `$0E` blacks the
   * screen behind our back on CCGMS and must be undone.
   */
  private screenBg = 0;

  constructor(opts: AnsiToPetsciiOptions = {}) {
    this.palette = opts.palette ?? C64_PALETTE_COLODORE;
  }

  reset(): void {
    this.machine.reset();
    this.pending = '';
    this.bold = false;
    this.ansiReverse = false;
    this.savedCursor = null;
    this.pendingWrap = 'none';
    this.ansiBg = null;
    this.screenBg = 0;
  }

  /**
   * Raw PETSCII bytes that reached the terminal without passing through
   * transduce().
   *
   * `screenBg` is deliberately NOT resynced from the machine afterwards: it
   * is an INTENT (what the last full clear committed), while the machine
   * holds what the C64 actually has. A `$0E` inside these bytes blacks both
   * sides identically - the machine's background goes to 0, and the intent
   * is already 0 unless a clear committed a colour, in which case
   * restoreScreenBg() (ensureBank, and every clear) sees the divergence
   * against the oracle and re-sends `$02 <colour>`. Copying the machine's
   * value in here would do the opposite: it would ADOPT the `$0E` as the new
   * intent and silently forget the colour the door asked for.
   */
  observe(bytes: Uint8Array | number[]): void {
    this.machine.feed(bytes);
    this.pendingWrap = 'none';
  }

  /** Resolve anything held across chunks (a trailing CR becomes a lone CR; a partial escape is dropped). */
  flush(): Uint8Array {
    const out: number[] = [];
    if (this.pending === '\r') this.carriageOnly(out);
    this.pending = '';
    return Uint8Array.from(out);
  }

  transduce(text: string): Uint8Array {
    const out: number[] = [];
    const s = this.pending + text;
    this.pending = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      const code = s.codePointAt(i) as number;
      if (ch === ESC) {
        const consumed = this.escape(s, i, out);
        if (consumed === 0) { this.pending = s.slice(i); break; }
        i += consumed;
        continue;
      }
      if (ch === '\r') {
        if (i + 1 >= s.length) { this.pending = '\r'; break; }
        if (s[i + 1] === '\n') { this.newline(out); i += 2; continue; }
        this.carriageOnly(out);
        i++;
        continue;
      }
      if (ch === '\n') { this.newline(out); i++; continue; }
      if (code === 0x08 || code === 0x7F) {
        // xterm clears the pending wrap and steps ONE cell left from column 39.
        this.settleWrap(out);
        // ...but it STOPS at column 0 (`frame/ansi-screen.ts`: `if (this.x > 0)
        // this.x--`), where the KERNAL's cursor-left wraps back to (39, y-1)
        // (E858 -> E701). Emitting the byte there would walk the caller onto the
        // end of the row above: "\n\bR" put R on (39,0) instead of (0,1).
        if (this.machine.state.cursorX > 0) this.emit(out, 0x9D);
        i++;
        continue;
      }
      if (ch === '\t') {
        // A tab settles the latch without crossing the boundary: xterm stops at
        // column 39, so from 'wrapped' the walk back is all the move there is.
        this.settleWrap(out);
        const x = this.machine.state.cursorX;
        const next = Math.min(COLS - 1, (Math.floor(x / 8) + 1) * 8);
        for (let k = x; k < next; k++) this.printByte(out, 0x20);
        i++;
        continue;
      }
      if (code < 0x20) { i++; continue; }
      if (code >= 0xE000 && code <= 0xE1FF) { this.printPua(out, code); i++; continue; }
      this.printChar(out, code);
      i += code > 0xFFFF ? 2 : 1;
    }
    return Uint8Array.from(out);
  }

  // ---- byte emission against the oracle -------------------------------

  private emit(out: number[], byte: number): void {
    out.push(byte);
    this.machine.feed([byte]);
  }

  /**
   * `$0E` is both the lowercase-charset switch and, on CCGMS, a
   * background/border reset to black - so every bank-1 switch is followed by
   * re-asserting the screen background the last clear committed.
   */
  private ensureBank(bank: 0 | 1, out: number[]): void {
    if (this.machine.state.charsetBank === bank) return;
    this.emit(out, bank === 1 ? 0x0E : 0x8E);
    this.restoreScreenBg(out);
  }

  /**
   * Send `$02 <colour>` when the oracle's background is not the one `screenBg`
   * asks for - which costs nothing in the common case (black screen, black
   * intent).
   *
   * The pen is re-asserted afterwards. On a client that DOES implement the
   * convention (CCGMS, Novaterm, PyCGMS) that byte is a no-op, and it is a
   * no-op on the oracle too. On a client that does NOT (SyncTERM's C64 mode,
   * sblendorio/petscii-bbs) the `$02` is inert and the colour byte lands as a
   * PEN change the oracle does not know about - the re-assert puts the ink
   * back where both sides agree it is.
   */
  private restoreScreenBg(out: number[]): void {
    if (this.machine.state.background === this.screenBg) return;
    this.emit(out, 0x02);
    this.emit(out, vicColorToPetscii(this.screenBg));
    this.emit(out, vicColorToPetscii(this.machine.state.pen));
  }

  private setReverse(on: boolean, out: number[]): void {
    if (this.machine.state.reverse !== on) this.emit(out, on ? 0x12 : 0x92);
  }

  private setPen(vic: number, out: number[]): void {
    if (this.machine.state.pen !== vic) this.emit(out, vicColorToPetscii(vic));
  }

  /**
   * Emit one printable byte and latch a deferred wrap when it crossed the
   * right edge. Every path that puts a glyph on the screen goes through here
   * so the latch can never be missed (plain text, inverse-only glyphs, PUA,
   * and the blanks an erase paints).
   */
  private emitPrintable(out: number[], byte: number): void {
    const st = this.machine.state;
    if (this.pendingWrap === 'held') {
      // The held boundary is crossed NOW, and crossing it from the bottom row
      // is exactly one scroll - which is what an ANSI terminal does too, just
      // one printable later than the KERNAL would have. $0D scrolls and homes
      // the column; it also clears reverse, so the caller's choice is put back.
      const reverse = st.reverse;
      this.pendingWrap = 'none';
      this.emit(out, 0x0D);
      this.setReverse(reverse, out);
    }
    if (st.cursorX === COLS - 1 && st.cursorY === ROWS - 1) return this.printAtBottomRight(out, byte);
    const atLastColumn = st.cursorX === COLS - 1;
    this.emit(out, byte);
    this.pendingWrap = atLastColumn && st.cursorX === 0 ? 'wrapped' : 'none';
  }

  /**
   * The one cell a KERNAL screen editor cannot simply print into.
   *
   * Advancing the cursor off (39,24) SCROLLS THE WHOLE SCREEN, and an ANSI
   * terminal never scrolls on a printable - it holds the cursor at the last
   * column (deferred wrap) and crosses only on the next one. blessed writes
   * that cell on the FIRST render of every 40x25 screen (`Screen._diff` walks
   * the whole buffer against an invalidated `lastBuffer`), so without this the
   * C64 sat one row above what the door believed from its first frame onwards
   * and every later diff repaint landed on the wrong row - the sysop's BUGS
   * screenshot: one menu row painted twice, and each shorter replacement string
   * leaving the tail of the longer text that had scrolled up under it.
   *
   * The idiom, entered with the cursor ALREADY on (39,24) and every step read
   * off the KERNAL ROM (skoolkid sk6502 c64rom; see the SDD ledger for the
   * quoted listings):
   *
   *   $14   DELETE (E75C-E77A): (38,24) takes what (39,24) held, (39,24) goes
   *         BLANK, the cursor lands on (38,24). It never scrolls.
   *   G     the wanted glyph, printed at (38,24) in the pen and reverse the
   *         stream is already in; the cursor advances to (39,24) without a wrap
   *         (E6B6 exits at `CMP $D5 / BCS $E700`).
   *   $9D   back onto (38,24).
   *   attrs the DISPLACED cell's pen and reverse - emitted HERE, ahead of the
   *         INSERT, because after `$94` they would not be executed at all.
   *   $94   INSERT (E7F2-E824). (39,24) is blank NOW and the cursor is not
   *         standing on it, so the ROM takes the plain-shift branch at E805:
   *         no `JSR $E965`, no line-open, no `JSR $E8EA`. G slides into
   *         (39,24) carrying its colour RAM byte and its reverse bit.
   *   H     the displaced glyph, re-printed at (38,24). It is the ONE printable
   *         after the INSERT, and E699-E69D pays the insert count back to zero
   *         with it. The cursor ends on (39,24), where ANSI's is.
   *   attrs the stream's own pen and reverse, restored now that the count is 0.
   *
   * WHY NOTHING MAY SIT BETWEEN `$94` AND THAT ONE PRINTABLE: while the insert
   * count $D8 is non-zero the KERNAL does not EXECUTE control codes, it paints
   * them as reversed glyphs (E745/E829 -> E697). A colour byte or a `$12`/`$92`
   * there would land as a glyph at (38,24) and eat the insert. The first
   * version of this idiom did exactly that; `PetsciiMachine` now models $D8, so
   * the oracle catches it.
   *
   * WHY THE DELETE COMES FIRST: `$94` on a logical line whose last cell is NOT
   * blank opens a new line (E7FE -> E965) and scrolls at the bottom (E975 ->
   * E8EA) - which would re-create the very scroll this routine exists to avoid,
   * every time a non-blank corner glyph is replaced by a different one. The
   * DELETE guarantees the precondition the plain-shift branch needs.
   *
   * `screenCodeToPetscii` round-trips exactly (`printablePetsciiToScreenCode`
   * is its inverse over 0x00-0x7F and neither depends on the charset bank), so
   * the restored cell is byte-identical to the one the oracle recorded.
   */
  private printAtBottomRight(out: number[], byte: number): void {
    const st = this.machine.state;
    const target = (ROWS - 1) * COLS + (COLS - 1);
    const wanted = printablePetsciiToScreenCode(byte) | (st.reverse ? 0x80 : 0);
    // Already what the stream is asking for - a repaint of an unchanged cell,
    // which is most of what an erase or a full-row fill asks for here.
    if (st.screen[target] !== wanted || st.colorRam[target] !== st.pen) {
      const left = target - 1;
      const heldCode = st.screen[left];
      const heldPen = st.colorRam[left];
      const wantReverse = st.reverse;
      const wantPen = st.pen;
      this.emit(out, 0x14);            // DELETE: (39,24) blanked, cursor onto (38,24)
      this.emit(out, byte);            // the wanted glyph lands there; cursor back on (39,24)
      this.emit(out, 0x9D);            // onto (38,24) again
      this.setReverse((heldCode & 0x80) !== 0, out);
      this.setPen(heldPen, out);
      this.emit(out, 0x94);            // INSERT slides the glyph into the now-blank (39,24)
      this.emit(out, screenCodeToPetscii(heldCode & 0x7F));   // the ONE printable after $94
      this.setReverse(wantReverse, out);
      this.setPen(wantPen, out);
    }
    this.pendingWrap = 'held';
  }

  /** Print one PETSCII byte as text: bank 1, reverse re-asserted from the ANSI state (RETURN cancels it on the C64). */
  private printByte(out: number[], byte: number): void {
    this.ensureBank(1, out);
    this.setReverse(this.ansiReverse, out);
    this.emitPrintable(out, byte);
  }

  /**
   * ANSI newline = column 0 of the NEXT physical row (scrolling at the
   * bottom).
   *
   * Three cases:
   *  - A deferred wrap is pending: the last printable already crossed onto
   *    the next row (and already scrolled, if it happened on row 24). ANSI
   *    would have held the cursor at column 39; the row this newline asks
   *    for is the one the cursor is standing on, so only the walk back to
   *    column 0 is emitted. A $0D here would cost a whole blank row.
   *  - The cursor row is linked to the row below (an earlier print wrapped
   *    through column 39): the KERNAL's RETURN goes to the row after the END
   *    of the logical line and would skip a row, so deltas are used instead.
   *    `logicalLineEndRow(ROWS - 1)` is always `ROWS - 1`, so this branch
   *    cannot fire on the bottom row.
   *  - Otherwise $0D, which is exact and is the only byte that scrolls.
   */
  private newline(out: number[]): void {
    const st = this.machine.state;
    if (this.pendingWrap === 'wrapped') {
      this.pendingWrap = 'none';
      while (st.cursorX > 0) this.emit(out, 0x9D);
      return;
    }
    // 'held': the C64 cursor really is on (39,24), and $0D really does scroll
    // from there - which is exactly what an ANSI newline on the bottom row does.
    this.pendingWrap = 'none';
    if (this.machine.logicalLineEndRow(st.cursorY) !== st.cursorY) {
      this.moveTo(0, st.cursorY + 1, out);
      return;
    }
    this.emit(out, 0x0D);
  }

  /**
   * Put the KERNAL cursor where the ANSI terminal's cursor actually IS, and
   * settle the latch.
   *
   * In 'wrapped' the KERNAL has already crossed to (0, r+1) while ANSI still
   * holds column 39 of row r, so EVERY operation that reads the cursor or moves
   * relative to it - save, index, erase, the relative and semi-absolute CSI
   * moves, backspace, tab - has to step back onto that column first or it acts
   * a row too low. 'held' needs no walk: there the two cursors agree, which is
   * the point of holding.
   */
  private settleWrap(out: number[]): void {
    if (this.pendingWrap === 'wrapped') this.emit(out, 0x9D);
    this.pendingWrap = 'none';
  }

  /**
   * Where an ANSI terminal's cursor IS, without moving the C64's or settling
   * the latch - for `ESC 7` / `CSI s`, which read the cursor but leave the
   * pending wrap standing (`frame/ansi-screen.ts` clears it in `moveTo`, and
   * saving is not a move). Settling those would both walk the cursor back and
   * throw the latch away, so the next printable overwrote column 39 instead of
   * crossing to the row below.
   */
  private ansiCursor(): { x: number; y: number } {
    const st = this.machine.state;
    if (this.pendingWrap === 'wrapped') return { x: COLS - 1, y: Math.max(0, st.cursorY - 1) };
    return { x: st.cursorX, y: st.cursorY };
  }

  /** Lone CR: column 0 of the same row. $9D never crosses a row boundary here because x lefts from column x stop at 0. */
  private carriageOnly(out: number[]): void {
    // 'wrapped': the KERNAL is on (0, r+1) while ANSI still holds column 39 of
    // row r, so column 0 of "the same row" is one row UP, not where it stands -
    // and $91 is that whole move in one byte, where settleWrap plus a walk back
    // along the row would cost forty.
    if (this.pendingWrap === 'wrapped') {
      this.pendingWrap = 'none';
      this.emit(out, 0x91);
      return;
    }
    this.pendingWrap = 'none';
    const x = this.machine.state.cursorX;
    for (let k = 0; k < x; k++) this.emit(out, 0x9D);
  }

  /**
   * The byte mapping itself lives in `asciiToPetsciiByte` - the ONE table,
   * shared with the MCI value encoder. Transduced text is always printed in
   * bank 1 (`printByte`/`ensureBank` force it), so bank 1 is passed here
   * unconditionally and the table's bank-0 fold never applies.
   */
  private printChar(out: number[], code: number): void {
    const { byte, needsReverse } = asciiToPetsciiByte(code, 1);
    if (!needsReverse) return this.printByte(out, byte);
    // Glyph only exists as the inverse of another PETSCII glyph.
    this.ensureBank(1, out);
    this.setReverse(true, out);
    this.emitPrintable(out, byte);
    this.setReverse(this.ansiReverse, out);
  }

  /** PetMe64 PUA: U+E000-E0FF bank 0 / U+E100-E1FF bank 1 screen codes, bit 7 = reverse. */
  private printPua(out: number[], code: number): void {
    const bank: 0 | 1 = code >= 0xE100 ? 1 : 0;
    const sc = code & 0xFF;
    this.ensureBank(bank, out);
    this.setReverse((sc & 0x80) !== 0, out);
    this.emitPrintable(out, screenCodeToPetscii(sc & 0x7F));
  }

  // ---- escape sequences ------------------------------------------------

  /** Returns chars consumed, or 0 when the sequence is incomplete (caller holds the tail). */
  private escape(s: string, i: number, out: number[]): number {
    const next = s[i + 1];
    if (next === undefined) return 0;
    if (next === '[') {
      let j = i + 2;
      let params = '';
      while (j < s.length && s.charCodeAt(j) >= 0x20 && s.charCodeAt(j) <= 0x3F) params += s[j++];
      if (j >= s.length) return 0;
      const final = s[j];
      this.csi(params, final, out);
      return j - i + 1;
    }
    if (next === ']' || next === 'P' || next === '_' || next === '^' || next === 'X') {
      // OSC / DCS / APC / PM / SOS: swallow through BEL or ESC \ (hold if unterminated).
      for (let j = i + 2; j < s.length; j++) {
        if (s[j] === '\x07') return j - i + 1;
        if (s[j] === ESC && s[j + 1] === '\\') return j - i + 2;
        if (s[j] === ESC && s[j + 1] === undefined) break; // possible split ESC \: hold for the next chunk
        // A CR or LF can never appear inside a well-formed string sequence:
        // the sender lost its terminator. Drop the sequence and let the
        // newline through rather than swallowing the rest of the session.
        if (s[j] === '\r' || s[j] === '\n') return j - i;
      }
      // No terminator in what we have. Holding is right for a sequence split
      // across chunks, but a runaway one is dropped at the cap instead of
      // stalling every byte behind it for ever.
      return s.length - i > STRING_SEQUENCE_MAX ? s.length - i : 0;
    }
    if (next === '(' || next === ')' || next === '*' || next === '+') return s[i + 2] === undefined ? 0 : 3; // charset designation
    if (next === '7') { this.savedCursor = this.ansiCursor(); return 2; }
    if (next === '8') { if (this.savedCursor) this.moveTo(this.savedCursor.x, this.savedCursor.y, out); return 2; }
    // RI: up one row, column kept. On row 0 an ANSI terminal scrolls the screen
    // DOWN; the KERNAL screen editor has no reverse scroll and no byte that asks
    // for one, so there it stays put - a documented, unavoidable divergence.
    if (next === 'M') { this.settleWrap(out); const st = this.machine.state; this.moveTo(st.cursorX, Math.max(0, st.cursorY - 1), out); return 2; }
    // IND: down one row, column kept, SCROLLING at the bottom - which is $11
    // exactly (PetsciiMachine.cursorDown scrolls on row 24). moveTo() would
    // clamp instead and silently swallow the scroll. NEL is CR+LF.
    if (next === 'D') { this.settleWrap(out); this.emit(out, 0x11); return 2; }
    if (next === 'E') { this.newline(out); return 2; }
    if (next === 'c') {
      // RIS: full reset. The screen background goes back to the terminal
      // default (black) NOW - deferring it to the next $0E would black the
      // screen at an arbitrary later moment, or never, if the bank never flips.
      this.pendingWrap = 'none';
      this.emit(out, 0x93);
      this.bold = false;
      this.ansiReverse = false;
      this.ansiBg = null;
      this.screenBg = 0;
      this.restoreScreenBg(out);
      return 2;
    }
    return 2; // ESC =, ESC >, ESC D, ESC E, ...: no C64 equivalent, dropped
  }

  private csi(params: string, final: string, out: number[]): void {
    // A private-parameter prefix makes the WHOLE sequence private, and xterm
    // uses '<' '=' '>' as well as '?' (modifyOtherKeys 'ESC[>4;2m', secondary
    // DA 'ESC[>c'). Recognising only '?' let 'ESC[>4;2m' reach sgr(), where
    // parseInt('>4') is NaN and NaN is read as SGR 0 - a spurious full
    // attribute reset. `petscii/frame/ansi-screen.ts`, which mirrors this
    // parser, has always matched all four.
    const prefix = /^[<=>?]/.test(params) ? params[0] : '';
    const isPrivate = prefix !== '';
    const nums = (isPrivate ? params.slice(1) : params).split(';').map((p) => (p === '' ? NaN : parseInt(p, 10)));
    const n = (idx: number, dflt: number) => (Number.isNaN(nums[idx]) || nums[idx] === undefined ? dflt : nums[idx]);
    // Live reference: the machine mutates its state object in place, so this
    // reads the cursor AFTER settleWrap has walked it back.
    const st = this.machine.state;
    if (isPrivate) {
      if (prefix !== '?') return; // '<' '=' '>': terminal queries and key-modifier modes, nothing to model
      // ?25 show/hide: nothing goes on the WIRE - a C64 has no hide-cursor code
      // - but the model carries it, because the web terminal draws the cursor
      // from the model and a door that hid it still got one blinking over its
      // playfield. ?1000-1006 mouse, ?7 wrap: no C64 equivalent. ?47/?1049
      // alternate screen: blessed repaints a full frame on entry and the BBS
      // repaints on exit - a clear is the honest translation.
      if (n(0, 0) === 25 && (final === 'h' || final === 'l')) {
        this.machine.state.cursorShown = final === 'h';
        return;
      }
      if ((n(0, 0) === 47 || n(0, 0) === 1049) && (final === 'h' || final === 'l')) this.clearKeepingCursor(out, 0, 0);
      return;
    }
    // Exactly the finals that READ or MOVE relative to the cursor: the relative
    // moves, the semi-absolute ones that keep the other axis, and the erases
    // anchored on it. They have to act from the column ANSI is holding.
    //
    // Everything else must NOT settle. `m` (SGR) and every dropped final change
    // no position, and the reference leaves the pending wrap standing through
    // them - settling would walk the cursor back AND discard the latch, so a
    // colour change after a 40-column row would overwrite column 39. `H`/`f`
    // are fully absolute and `u` restores, so their own move settles it. `s`
    // saves without moving and is handled by `ansiCursor()`.
    if (SETTLES_THE_WRAP.has(final)) this.settleWrap(out);
    switch (final) {
      case 'm': return this.sgr(nums.map((v) => (Number.isNaN(v) ? 0 : v)), out);
      case 'A': return this.moveTo(st.cursorX, Math.max(0, st.cursorY - n(0, 1)), out);
      case 'B': return this.moveTo(st.cursorX, Math.min(ROWS - 1, st.cursorY + n(0, 1)), out);
      case 'C': return this.moveTo(Math.min(COLS - 1, st.cursorX + n(0, 1)), st.cursorY, out);
      case 'D': return this.moveTo(Math.max(0, st.cursorX - n(0, 1)), st.cursorY, out);
      case 'E': return this.moveTo(0, Math.min(ROWS - 1, st.cursorY + n(0, 1)), out);
      case 'F': return this.moveTo(0, Math.max(0, st.cursorY - n(0, 1)), out);
      case 'G': return this.moveTo(this.clampCol(n(0, 1) - 1), st.cursorY, out);
      case 'd': return this.moveTo(st.cursorX, this.clampRow(n(0, 1) - 1), out);
      case 'H': case 'f': return this.moveTo(this.clampCol(n(1, 1) - 1), this.clampRow(n(0, 1) - 1), out);
      case 'J': return this.eraseDisplay(n(0, 0), out);
      case 'K': return this.eraseLine(n(0, 0), out);
      case 'X': return this.eraseChars(n(0, 1), out);
      case 's': this.savedCursor = this.ansiCursor(); return;
      case 'u': if (this.savedCursor) this.moveTo(this.savedCursor.x, this.savedCursor.y, out); return;
      default: return; // L M @ P (insert/delete line/char), r (scroll region), n, t, h, l: dropped, documented
    }
  }

  private clampCol(x: number): number { return Math.max(0, Math.min(COLS - 1, x)); }
  private clampRow(y: number): number { return Math.max(0, Math.min(ROWS - 1, y)); }

  /**
   * Absolute positioning. The walk itself is `petsciiMoveTo` (below) - the
   * ONE $13/$11/$1D writer, shared with the PETSCII `~x`/`~y` renderer. Only
   * `pendingWrap` (a transducer concern) and feeding the oracle stay here.
   */
  private moveTo(x: number, y: number, out: number[]): void {
    this.pendingWrap = 'none'; // any explicit cursor move settles the deferred wrap
    const start = out.length;
    petsciiMoveTo(this.machine.state, x, y, out);
    if (out.length > start) this.machine.feed(out.slice(start));
  }

  private sgr(codes: number[], out: number[]): void {
    // `codes` is never empty: csi() splits on ';' and 'ESC[m' yields [NaN] -> [0].
    let p = 0;
    while (p < codes.length) {
      const c = codes[p];
      if (c === 0) { this.bold = false; this.ansiReverse = false; this.ansiBg = null; this.setReverse(false, out); this.setPen(1, out); p++; continue; }
      if (c === 1) { this.bold = true; p++; continue; }
      if (c === 22) { this.bold = false; p++; continue; }
      if (c === 7) { this.ansiReverse = true; this.setReverse(true, out); p++; continue; }
      if (c === 27) { this.ansiReverse = false; this.setReverse(false, out); p++; continue; }
      if (c === 38 || c === 48) {
        const mode = codes[p + 1];
        let rgb: [number, number, number] | null = null;
        if (mode === 2 && p + 4 < codes.length) rgb = [codes[p + 2], codes[p + 3], codes[p + 4]];
        else if (mode === 5 && p + 2 < codes.length) rgb = xterm256ToRgb(codes[p + 2], this.palette);
        // Truncated or unknown extended color ('38;2;255;0m'): everything
        // left in this SGR belongs to it, not to the SGR vocabulary - a
        // trailing '0' is a color component, never a reset.
        if (!rgb) break;
        const vic = nearestVicForRgb(rgb[0], rgb[1], rgb[2], this.palette);
        if (c === 38) this.setPen(vic, out);
        else this.ansiBg = vic;
        p += mode === 2 ? 5 : 3;
        continue;
      }
      // Background: latched only, never emitted per cell. 40-47 map like
      // 30-37 and 100-107 like 90-97 (bold does not brighten a background),
      // 49 is the terminal default.
      if (c === 49) { this.ansiBg = null; p++; continue; }
      if ((c >= 40 && c <= 47) || (c >= 100 && c <= 107)) { this.ansiBg = sgrColorToVic(c - 10, false); p++; continue; }
      const vic = sgrColorToVic(c, this.bold);
      if (vic !== null) this.setPen(vic, out);
      p++; // 2/3/4/5/24/25 ... : no C64 equivalent, dropped
    }
  }

  // ---- erase ------------------------------------------------------------

  /**
   * Blank columns x0..x1 of row r with plain spaces (the cursor ends up
   * wherever the last print left it; callers restore it). Reverse is turned
   * OFF for the fill - ANSI erase paints the background, and the latched
   * `ansiReverse` is re-asserted by the next printable anyway. The pen is
   * left alone, so the blanks take the current color like a real erase.
   *
   * Printing through column 39 makes the KERNAL wrap and link the row below
   * into this logical line - harmless, because newline() consults
   * logicalLineEndRow and never issues a $0D from a non-final row (Task 2).
   * The blanks go through `emitPrintable`, so cell (39,24) is erased like every
   * other cell instead of being skipped: a plain print there would scroll, which
   * an ANSI erase never does, and `printAtBottomRight` is what makes it
   * reachable without scrolling. Leaving it out would strand there whatever
   * glyph a previous frame put in it.
   */
  private fillRow(r: number, x0: number, x1: number, out: number[]): void {
    const last = Math.min(x1, COLS - 1);
    if (last < x0) return;
    this.moveTo(x0, r, out);
    this.setReverse(false, out);
    for (let x = x0; x <= last; x++) this.emitPrintable(out, 0x20);
  }

  /** ANSI erase never moves the cursor; the fill does, so it is walked back afterwards. */
  private withCursorRestored(out: number[], fill: () => void): void {
    const st = this.machine.state;
    const save = { x: st.cursorX, y: st.cursorY };
    fill();
    this.moveTo(save.x, save.y, out);
  }

  /** EL: 0 = cursor to end of row, 1 = start of row through cursor, 2 = whole row. */
  private eraseLine(mode: number, out: number[]): void {
    const { cursorX: x, cursorY: y } = this.machine.state;
    this.withCursorRestored(out, () => {
      if (mode === 1) this.fillRow(y, 0, x, out);
      else if (mode === 2) this.fillRow(y, 0, COLS - 1, out);
      else this.fillRow(y, x, COLS - 1, out);
    });
  }

  /** ED: 0 = cursor to end of screen, 1 = top through cursor, 2/3 = everything. */
  private eraseDisplay(mode: number, out: number[]): void {
    const { cursorX: x, cursorY: y } = this.machine.state;
    if (mode === 2 || mode === 3) return this.clearKeepingCursor(out, x, y);
    this.withCursorRestored(out, () => {
      if (mode === 1) {
        for (let r = 0; r < y; r++) this.fillRow(r, 0, COLS - 1, out);
        this.fillRow(y, 0, x, out);
      } else {
        this.fillRow(y, x, COLS - 1, out);
        for (let r = y + 1; r < ROWS; r++) this.fillRow(r, 0, COLS - 1, out);
      }
    });
  }

  /** ECH: blank `count` cells from the cursor, cursor unmoved. */
  private eraseChars(count: number, out: number[]): void {
    const { cursorX: x, cursorY: y } = this.machine.state;
    this.withCursorRestored(out, () => this.fillRow(y, x, x + count - 1, out));
  }

  /**
   * $93 clears AND homes on the C64; ANSI 2J does not home, so the cursor goes
   * back to (x,y) afterwards.
   *
   * A full clear is also the one moment a background belongs on a C64: the
   * ANSI background in force is committed as the SCREEN background and sent
   * as CCGMS `$02 <colour>` right after the `$93` (per-cell background stays
   * dropped - plan decision 5).
   *
   * No ANSI background in force means SGR 0 / SGR 49, i.e. the BBS asking for
   * the TERMINAL DEFAULT - black on CCGMS - so the commit is black, not "leave
   * it alone". Leaving it alone stranded a previous clear's colour on the
   * screen with nothing tracking it, and the next unrelated `$0E` then blacked
   * the screen mid-art. `restoreScreenBg` emits nothing when the screen is
   * already black, so the common case still costs zero bytes.
   */
  private clearKeepingCursor(out: number[], x: number, y: number): void {
    this.pendingWrap = 'none';
    this.emit(out, 0x93);
    this.screenBg = this.ansiBg ?? 0;
    this.restoreScreenBg(out);
    this.moveTo(x, y, out);
  }
}
