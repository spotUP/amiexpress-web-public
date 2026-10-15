/**
 * KERNAL-accurate C64 screen-editor state machine.
 *
 * Models the C64's screen-code matrix + color RAM + cursor + global charset
 * flag exactly as the real KERNAL screen editor does: control codes mutate
 * state and/or the 1000-cell screen/color arrays, printable bytes are
 * remapped PETSCII -> screen code and written at the cursor. Two physical
 * 40-column rows are linked into one 80-char "logical line" whenever a
 * printing operation wraps past column 39; RETURN, DELETE and INSERT operate
 * on that logical line, not the physical row.
 *
 * Pure TypeScript: no DOM, no React, no Node imports. See reference doc
 * thoughts/shared/research/2026-09-01_true-petscii-reference.md sections
 * 1.2-1.3 (KERNAL semantics, logical lines) and 2 (screen codes) for the
 * behavioral rules this file implements.
 *
 * Background/border power on to C64 TERMINAL defaults (CCGMS/Novaterm: black
 * screen, black border), NOT the KERNAL BASIC power-on defaults (blue/light
 * blue) referenced in section 3 of that doc. This machine simulates a BBS
 * terminal, never the BASIC READY. prompt.
 *
 * Native PETSCII has no background byte, but every C64 TERMINAL follows the
 * CCGMS convention (also in Novaterm and PyCGMS), which this machine
 * implements:
 *  - `$02` followed by one of the 16 standard PETSCII colour bytes sets the
 *    BACKGROUND and the BORDER to that VIC colour. The two are always tied -
 *    no independent border control exists. `$02` followed by anything ELSE is
 *    inert and that byte is processed normally - this project's chosen
 *    behaviour, NOT a sourced CCGMS one (no CCGMS/PyCGMS source was read for
 *    the non-colour case); it keeps a stray `$02` from eating the control code
 *    behind it. See the reference doc, section 3.
 *  - `$0E` - the lowercase-charset switch - ALSO resets background and border
 *    to black. A sender that wants a coloured screen must re-send
 *    `$02 <colour>` after every `$0E` (AnsiToPetsciiTransducer does).
 * Both changes repaint the whole canvas, so `apply` reports a full repaint.
 */
import { PETSCII_COLOR_TO_VIC } from './c64-palette';
import { printablePetsciiToScreenCode } from './screen-codes';

const COLS = 40, ROWS = 25;

/**
 * The shape of the screen a model describes.
 *
 * The C64's is 40x25 with the KERNAL's two rules; the web terminal's wide
 * PETSCII screen is 80x25 with neither, and says so here rather than in a
 * second copy of this file. See WideScreenMachine (wide-screen-machine.ts)
 * for what each option means and why the wide screen turns it off.
 */
export interface PetsciiScreenShape {
  cols?: number;
  rows?: number;
  /**
   * Whether two rows link into one logical line, the way a C64's 40-column
   * screen makes an 80-character line out of two rows (ROM E8EA). INSERT,
   * DELETE and RETURN all work on that line. A screen that is already 80
   * wide has no such rule: a row is a line.
   */
  logicalLines?: boolean;
  /**
   * Whether `$02 <colour>` sets the background and border (CCGMS's
   * convention, which this board follows at 40). It is a TERMINAL
   * convention, not a Commodore one - on a C128's 80-column screen $02 is
   * UNDERLINE ON - so the wide screen does not read it, and nothing emits
   * it there.
   */
  backgroundPrefix?: boolean;
  /**
   * HOW MANY RETIRED ROWS TO KEEP, which is what scrollback IS.
   *
   * Zero - the default - keeps none, which is a real C64 exactly. A screen
   * that is DRAWN by something with a history (the web terminal's canvas)
   * asks for a depth here and gets every row that leaves the screen, whether
   * it left by scrolling or because the screen was cleared underneath it.
   *
   * Off by default because a session holds two machines: the one on the
   * glass and the transducer's private oracle, and only the first of them is
   * ever looked at.
   */
  historyRows?: number;
}

/** A row that has left the screen: its screen codes, and its colour RAM. */
export interface PetsciiHistoryRow {
  screen: Uint8Array;
  color: Uint8Array;
}

export interface PetsciiMachineState {
  /**
   * The screen's shape. 40x25 for a C64 (PetsciiMachine, this file); the
   * web terminal's wide PETSCII screen is 80x25 and is modelled by
   * WideScreenMachine beside it. Numbers rather than literal types because
   * one canvas, one renderer and one transducer serve both, and each of
   * them reads the width from HERE rather than from a constant.
   */
  cols: number; rows: number;
  screen: Uint8Array;    // 1000 screen codes (bit 7 = reverse)
  colorRam: Uint8Array;  // 1000 VIC color indices
  cursorX: number; cursorY: number;
  charsetBank: 0 | 1;    // 0 = uppercase/graphics (power-on), 1 = lowercase/uppercase
  reverse: boolean;
  pen: number;           // VIC index, power-on 14
  background: number;    // VIC index, power-on 0 (CCGMS $02 <colour> sets it, $0E blacks it)
  border: number;        // VIC index, power-on 0 (always tied to `background`)
  /**
   * Whether a cursor should be DRAWN. Not a PETSCII byte and not on the wire.
   *
   * A real C64 has no hide-cursor code, which is why the transducer drops
   * `CSI ?25l` rather than translating it - there is nothing to translate it
   * INTO. But the web terminal draws the cursor itself, from this state, and a
   * full-screen door that hid the cursor still got a PETSCII one blinking over
   * its playfield (reported 2026-09-06 against GRANDMASTER). The screen model
   * is the honest place for it: a telnet C64 sees no change, because no byte
   * changes.
   */
  cursorShown: boolean;
}

export class PetsciiMachine {
  readonly state: PetsciiMachineState;
  /** The screen's own shape - read here, never from a module constant. */
  protected readonly cols: number;
  protected readonly rows: number;
  protected readonly cells: number;
  /** Two rows are one logical line (a C64's 40-column screen). Off at 80. */
  protected readonly logicalLines: boolean;
  /** `$02 <colour>` sets background and border (CCGMS at 40). Off at 80. */
  protected readonly backgroundPrefix: boolean;
  /** rowLinked[y] = true when row y is the continuation of row y-1 (logical 80-char line) */
  private rowLinked: boolean[];
  /** How deep the history goes. 0 - the default - is a real C64: none. */
  protected readonly historyRows: number;
  /** Rows that have left the screen, oldest first. Empty when `historyRows` is 0. */
  private history: PetsciiHistoryRow[] = [];

  constructor(shape: PetsciiScreenShape = {}) {
    this.cols = shape.cols ?? COLS;
    this.rows = shape.rows ?? ROWS;
    this.cells = this.cols * this.rows;
    this.logicalLines = shape.logicalLines ?? true;
    this.backgroundPrefix = shape.backgroundPrefix ?? true;
    this.historyRows = Math.max(0, Math.floor(shape.historyRows ?? 0));
    this.state = {
      cols: this.cols, rows: this.rows,
      screen: new Uint8Array(this.cells).fill(0x20),
      colorRam: new Uint8Array(this.cells).fill(14),
      cursorX: 0, cursorY: 0, charsetBank: 0, reverse: false,
      pen: 14, background: 0, border: 0, cursorShown: true,
    };
    this.rowLinked = new Array(this.rows).fill(false);
  }
  /** A `$02` has been seen and the NEXT byte is a candidate background colour. Survives chunk boundaries. */
  private bgPrefix = false;
  /**
   * The KERNAL's insert count, $D8 (ROM E824 `INC $D8`, E69D `DEC $D8`).
   *
   * `$94` raises it; every printed character lowers it (E699-E69F, which is on
   * the ordinary print path as well as on E697's "insert reversed character"
   * path). While it is non-zero the character-output routine does NOT EXECUTE
   * control codes - it prints them as REVERSED GLYPHS:
   *
   *   E745  LDX $D8 / BEQ $E74C / JMP $E697   (unshifted, $00-$1F)
   *   E829  LDX $D8 / BEQ $E832 / ORA #$40 / JMP $E697   (shifted, $80-$9F)
   *
   * Two escape it because they are tested first: `$0D`/`$8D` (E72A, E7E3) and
   * `$94` itself (E7EE, ahead of E829). `$14` does not - E74C is after E745.
   */
  private insertCount = 0;
  onUpdate?: (fullRepaint: boolean) => void;

  feed(bytes: Uint8Array | Buffer | number[]): void {
    let full = false;
    for (const byte of bytes) full = this.apply(byte) || full;
    this.onUpdate?.(full);
  }

  reset(): void {
    const s = this.state;
    s.screen.fill(0x20);
    s.colorRam.fill(14);
    s.cursorX = 0;
    s.cursorY = 0;
    s.charsetBank = 0;
    s.reverse = false;
    s.pen = 14;
    s.background = 0;
    s.border = 0;
    this.bgPrefix = false;
    this.insertCount = 0;
    this.rowLinked.fill(false);
  }

  /** A byte the KERNAL screen editor treats as a control code rather than a glyph. */
  private static isControlCode(b: number): boolean {
    return b < 0x20 || (b >= 0x80 && b <= 0x9F);
  }

  private apply(b: number): boolean {
    const s = this.state;
    if (this.bgPrefix) {
      this.bgPrefix = false;
      // CCGMS: `$02 <colour>` sets background AND border. Anything else after
      // a `$02` is not a background command - fall through and process the
      // byte normally (this project's choice, see the header comment).
      if (b in PETSCII_COLOR_TO_VIC) return this.setScreenColor(PETSCII_COLOR_TO_VIC[b]);
    }
    // E745 / E829: with an insert pending, a control code is not executed - it
    // is painted as a reversed glyph and pays one off the count. This is ahead
    // of the colour table because every colour byte IS a control code.
    if (this.insertCount > 0 && PetsciiMachine.isControlCode(b) && b !== 0x0D && b !== 0x8D && b !== 0x94) {
      // E697 `ORA #$80` over what the two paths hand it: the raw byte when it
      // came from E749, and `(b & $7F) | $40` when it came from E82D.
      const base = b < 0x20 ? b : (b & 0x7f) | 0x40;
      return this.putScreenCode(base | 0x80);
    }
    if (b in PETSCII_COLOR_TO_VIC) { s.pen = PETSCII_COLOR_TO_VIC[b]; return false; }
    switch (b) {
      // $02 is CCGMS's background prefix at 40 and UNDERLINE ON on a C128's
      // 80-column screen. The wide screen reads neither: it is dropped.
      case 0x02: if (this.backgroundPrefix) this.bgPrefix = true; return false;
      case 0x0E: {
        // CCGMS ties the lowercase-charset switch to a background/border reset.
        const changed = this.setScreenColor(0);
        if (s.charsetBank !== 1) { s.charsetBank = 1; return true; }
        return changed;
      }
      case 0x8E: if (s.charsetBank !== 0) { s.charsetBank = 0; return true; } return false;
      case 0x12: s.reverse = true; return false;
      case 0x92: s.reverse = false; return false;
      case 0x0D: s.reverse = false; this.carriageReturn(); return false;
      case 0x8D: this.carriageReturn(); return false;
      case 0x11: return this.cursorDown();
      case 0x91: if (s.cursorY > 0) s.cursorY--; return false;
      case 0x1D: return this.cursorRight();
      case 0x9D: this.cursorLeft(); return false;
      case 0x13: s.cursorX = 0; s.cursorY = 0; return false;
      case 0x93: this.clear(); return true;
      case 0x14: this.deleteChar(); return false;
      case 0x94: this.insertChar(); return false;
    }
    if (PetsciiMachine.isControlCode(b)) return false; // all other controls: no-op
    return this.putScreenCode(printablePetsciiToScreenCode(b) | (s.reverse ? 0x80 : 0));
  }

  /**
   * E699-E6A5: pay the insert count down, store the screen code in the current
   * pen colour, advance the cursor. The one place a glyph reaches the screen,
   * so the count can never be paid twice or missed.
   */
  protected putScreenCode(sc: number): boolean {
    const s = this.state;
    if (this.insertCount > 0) this.insertCount--;
    const idx = s.cursorY * this.cols + s.cursorX;
    s.screen[idx] = sc;
    s.colorRam[idx] = s.pen;
    return this.cursorRight(/*fromPrint*/ true);
  }

  /**
   * RETURN ($0D/$8D): cursor to column 0 of the row below the LAST row of the
   * current logical line (following the link chain, not just the next
   * physical row) and terminates that logical line (the rows it spanned stop
   * being continuations of one another). Scrolls if that lands past the
   * bottom row.
   */
  private carriageReturn(): void {
    const s = this.state;
    const end = this.logicalLineEndRow(s.cursorY);
    s.cursorX = 0;
    for (let r = s.cursorY + 1; r <= end; r++) this.rowLinked[r] = false;
    if (end >= this.rows - 1) {
      this.scroll();
    } else {
      s.cursorY = end + 1;
    }
  }

  /**
   * Cursor right. At column 40 wraps to column 0 of the next row. `fromPrint`
   * is true only when the wrap was caused by printing a character past
   * column 39 - the KERNAL links the destination row to the source row as a
   * logical-line continuation only on a printing wrap, never on a bare
   * cursor-right keypress. Scrolls (and reports full repaint) if the wrap
   * happens at the bottom row.
   */
  private cursorRight(fromPrint = false): boolean {
    const s = this.state;
    s.cursorX++;
    if (s.cursorX < this.cols) return false;
    s.cursorX = 0;
    // E6C1 `CMP #$4F` / E6C3 `BEQ $E6F7`: a logical line stops at 80
    // characters. Printing off the end of a row that is ALREADY a continuation
    // does not link a third row - it does a newline (E6F7 -> E87C), which puts
    // the cursor on the row after the line as a FRESH logical line.
    const leavingRow = s.cursorY;
    const lineCanGrow = fromPrint && this.logicalLineStartRow(leavingRow) === leavingRow;
    let scrolled = false;
    if (s.cursorY >= this.rows - 1) {
      this.scroll();
      scrolled = true;
    } else {
      s.cursorY++;
    }
    if (fromPrint) this.rowLinked[s.cursorY] = lineCanGrow;
    return scrolled;
  }

  /** Cursor left. At column 0 moves to the last column of the previous row, unless already at (0,0). */
  private cursorLeft(): void {
    const s = this.state;
    if (s.cursorX > 0) {
      s.cursorX--;
    } else if (s.cursorY > 0) {
      s.cursorX = this.cols - 1;
      s.cursorY--;
    }
  }

  /** Cursor down. Scrolls (and reports full repaint) at the bottom row; cursor stays on the bottom row. */
  private cursorDown(): boolean {
    const s = this.state;
    if (s.cursorY >= this.rows - 1) {
      this.scroll();
      return true;
    }
    s.cursorY++;
    return false;
  }

  /**
   * Set background and border together (they are never independent on a C64
   * terminal). Returns true when anything changed, so the caller can report
   * the full repaint the whole canvas needs.
   */
  private setScreenColor(vic: number): boolean {
    const s = this.state;
    if (s.background === vic && s.border === vic) return false;
    s.background = vic;
    s.border = vic;
    return true;
  }

  /**
   * How many retired rows stand above the live screen.
   *
   * Always 0 unless the machine was built with `historyRows`.
   */
  get historyLength(): number {
    return this.history.length;
  }

  /**
   * A row that has left the screen. `back` is 1 for the row that left most
   * recently; undefined past the end of the history.
   *
   * The arrays are the machine's own and must not be written to.
   */
  historyRow(back: number): PetsciiHistoryRow | undefined {
    return this.history[this.history.length - back];
  }

  /** Forget every retired row. A fresh session on a machine that is kept. */
  clearHistory(): void {
    this.history = [];
  }

  /** Copy one visible row into the history, dropping the oldest once full. */
  private retireRow(y: number): void {
    if (this.historyRows === 0) return;
    const start = y * this.cols;
    const end = start + this.cols;
    this.history.push({
      screen: this.state.screen.slice(start, end),
      color: this.state.colorRam.slice(start, end),
    });
    if (this.history.length > this.historyRows) {
      this.history.splice(0, this.history.length - this.historyRows);
    }
  }

  /** Whether a row holds nothing but spaces - either spelling of one. */
  private rowIsBlank(y: number): boolean {
    const s = this.state.screen;
    const start = y * this.cols;
    for (let i = start; i < start + this.cols; i++) {
      if (s[i] !== 0x20 && s[i] !== 0x60) return false;
    }
    return true;
  }

  /**
   * PUT THE WHOLE VISIBLE SCREEN IN THE HISTORY, then let the caller wipe it.
   *
   * `$93` erases and keeps nothing - that is what the byte means on a C64,
   * and it is why a caller on the PETSCII surface could scroll back to
   * nothing at all while the ANSI surface kept everything (the sysop,
   * 2026-09-24). The byte on the wire is unchanged: one byte, and a real C64
   * behaves exactly as it did. What changes is that a screen which is DRAWN
   * from a model keeps the rows the model is about to throw away.
   *
   * Trailing blank rows are dropped, so a half-filled screen does not pad the
   * history with empties and a clear on an already-clear screen retires
   * nothing at all.
   */
  private retireScreen(): void {
    if (this.historyRows === 0) return;
    let last = this.rows - 1;
    while (last >= 0 && this.rowIsBlank(last)) last--;
    for (let y = 0; y <= last; y++) this.retireRow(y);
  }

  /** CLR: fills the screen with spaces in the current pen color, homes the cursor, and clears all link flags. */
  private clear(): void {
    this.retireScreen();
    const s = this.state;
    s.screen.fill(0x20);
    s.colorRam.fill(s.pen);
    s.cursorX = 0;
    s.cursorY = 0;
    this.rowLinked.fill(false);
  }

  /** Shifts screen + colorRam up one physical row, shifts the link-flag table with it, and clears the new bottom row. */
  private scroll(): void {
    const s = this.state;
    this.retireRow(0); // the row leaving the top, which is what scrollback IS
    s.screen.copyWithin(0, this.cols, this.cells);
    s.colorRam.copyWithin(0, this.cols, this.cells);
    s.screen.fill(0x20, this.cells - this.cols, this.cells);
    s.colorRam.fill(s.pen, this.cells - this.cols, this.cells);
    for (let y = 0; y < this.rows - 1; y++) this.rowLinked[y] = this.rowLinked[y + 1];
    this.rowLinked[this.rows - 1] = false;
  }

  /** Last physical row of the logical line containing row y, found by following the link chain forward. */
  logicalLineEndRow(y: number): number {
    if (!this.logicalLines) return y;
    let end = y;
    while (end + 1 < this.rows && this.rowLinked[end + 1]) end++;
    return end;
  }

  /** First physical row of the logical line containing row y (ROM E6ED's walk back). */
  logicalLineStartRow(y: number): number {
    if (!this.logicalLines) return y;
    let start = y;
    while (start > 0 && this.rowLinked[start]) start--;
    return start;
  }

  /** The KERNAL's insert count, $D8. Exposed so the transducer's tests can pin that it is balanced. */
  get pendingInserts(): number {
    return this.insertCount;
  }

  /**
   * DELETE ($14): destructive backspace. Moves the cursor left one position
   * (respecting row-wrap via cursorLeft), then shifts every cell from the
   * new cursor position through the end of the logical line left by one,
   * filling the vacated final cell with a space in the current pen. Because
   * the screen/colorRam arrays are laid out row-major, and every row between
   * the cursor and the logical line's end row is - by construction of the
   * link chain - a direct continuation of the previous one, the whole span
   * is contiguous in the flat array and can be shifted with plain index
   * arithmetic across row boundaries.
   */
  private deleteChar(): void {
    const s = this.state;
    this.cursorLeft();
    const startIdx = s.cursorY * this.cols + s.cursorX;
    const endRow = this.logicalLineEndRow(s.cursorY);
    const endIdx = endRow * this.cols + (this.cols - 1);
    for (let i = startIdx; i < endIdx; i++) {
      s.screen[i] = s.screen[i + 1];
      s.colorRam[i] = s.colorRam[i + 1];
    }
    s.screen[endIdx] = 0x20;
    s.colorRam[endIdx] = s.pen;
  }

  /**
   * INSERT ($94), ROM E7F2-E826.
   *
   * The KERNAL does NOT shift unconditionally. It first asks whether the
   * logical line has room:
   *
   *   E7F2  LDY $D5 / LDA ($D1),Y / CMP #" " / BNE $E7FE
   *   E7FA  CPY $D3 / BNE $E805
   *   E7FE  CPY #$4F / BEQ $E826
   *   E802  JSR $E965   ("open up a space on the screen")
   *
   * i.e. a plain shift happens only when the line's LAST cell is a space and
   * the cursor is not standing on it. Otherwise the line has to grow: an
   * 80-character line cannot, so INSERT does nothing at all; a 40-character one
   * swallows the row below, which pushes the rows under it down and SCROLLS
   * when there is no row left (E965 -> E975 `JSR $E8EA`).
   *
   * That scroll is the whole reason this is modelled: it is the difference
   * between an idiom that can place the bottom-right glyph and one that
   * re-creates the scroll it was written to avoid.
   */
  private insertChar(): void {
    const s = this.state;
    const lastIdx = this.logicalLineEndRow(s.cursorY) * this.cols + (this.cols - 1);
    const onLastCell = s.cursorY * this.cols + s.cursorX === lastIdx;
    if (s.screen[lastIdx] !== 0x20 || onLastCell) {
      const startRow = this.logicalLineStartRow(s.cursorY);
      if (this.logicalLineEndRow(s.cursorY) - startRow >= 1) return; // CPY #$4F: an 80-char line cannot grow
      this.openSpaceOnScreen();
    }
    const startIdx = s.cursorY * this.cols + s.cursorX;
    const endIdx = this.logicalLineEndRow(s.cursorY) * this.cols + (this.cols - 1);
    for (let i = endIdx; i > startIdx; i--) {
      s.screen[i] = s.screen[i - 1];
      s.colorRam[i] = s.colorRam[i - 1];
    }
    s.screen[startIdx] = 0x20;
    s.colorRam[startIdx] = s.pen;
    this.insertCount++;   // E824 INC $D8
  }

  /**
   * E965 "open up a space on the screen": find the next row that STARTS a
   * logical line (E967-E96A), push every row from there down one - scrolling
   * the whole screen first when that row is past the bottom (E96F-E975) - and
   * join the freed row onto the cursor's logical line (E6DA).
   *
   * The ROM's multi-line scroll bookkeeping inside E8EA/E9C8 is reproduced at
   * the level this machine models (whole rows plus the link table); what it is
   * here to get right is WHICH rows move and WHETHER the screen scrolls.
   */
  private openSpaceOnScreen(): void {
    const s = this.state;
    let marker = s.cursorY + 1;
    while (marker < this.rows && this.rowLinked[marker]) marker++;
    if (marker > this.rows - 1) {
      // E975: no row left below, so the screen scrolls and the freed bottom row
      // is the one that joins the line. `scroll()` moves the cursor's row up
      // with everything else (E8EA `DEC $D6`).
      this.scroll();
      marker = this.rows - 1;
      if (s.cursorY > 0) s.cursorY--;
    } else {
      // E981-E9A6: rows marker..23 move down to marker+1..24, row `marker` is
      // cleared, and the link flags travel with their rows.
      for (let y = this.rows - 1; y > marker; y--) {
        s.screen.copyWithin(y * this.cols, (y - 1) * this.cols, y * this.cols);
        s.colorRam.copyWithin(y * this.cols, (y - 1) * this.cols, y * this.cols);
        this.rowLinked[y] = this.rowLinked[y - 1];
      }
      s.screen.fill(0x20, marker * this.cols, (marker + 1) * this.cols);
      s.colorRam.fill(s.pen, marker * this.cols, (marker + 1) * this.cols);
    }
    // E6DA: the marker row becomes a continuation of the cursor's line, and the
    // row after it starts a new one.
    this.rowLinked[marker] = true;
    if (marker + 1 < this.rows) this.rowLinked[marker + 1] = false;
  }
}
