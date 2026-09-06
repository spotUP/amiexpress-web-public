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

const COLS = 40, ROWS = 25, CELLS = COLS * ROWS;

export interface PetsciiMachineState {
  cols: 40; rows: 25;
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
  readonly state: PetsciiMachineState = {
    cols: COLS, rows: ROWS,
    screen: new Uint8Array(CELLS).fill(0x20),
    colorRam: new Uint8Array(CELLS).fill(14),
    cursorX: 0, cursorY: 0, charsetBank: 0, reverse: false,
    pen: 14, background: 0, border: 0, cursorShown: true,
  };
  /** rowLinked[y] = true when row y is the continuation of row y-1 (logical 80-char line) */
  private rowLinked: boolean[] = new Array(ROWS).fill(false);
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
      case 0x02: this.bgPrefix = true; return false;
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
  private putScreenCode(sc: number): boolean {
    const s = this.state;
    if (this.insertCount > 0) this.insertCount--;
    const idx = s.cursorY * COLS + s.cursorX;
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
    if (end >= ROWS - 1) {
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
    if (s.cursorX < COLS) return false;
    s.cursorX = 0;
    // E6C1 `CMP #$4F` / E6C3 `BEQ $E6F7`: a logical line stops at 80
    // characters. Printing off the end of a row that is ALREADY a continuation
    // does not link a third row - it does a newline (E6F7 -> E87C), which puts
    // the cursor on the row after the line as a FRESH logical line.
    const leavingRow = s.cursorY;
    const lineCanGrow = fromPrint && this.logicalLineStartRow(leavingRow) === leavingRow;
    let scrolled = false;
    if (s.cursorY >= ROWS - 1) {
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
      s.cursorX = COLS - 1;
      s.cursorY--;
    }
  }

  /** Cursor down. Scrolls (and reports full repaint) at the bottom row; cursor stays on the bottom row. */
  private cursorDown(): boolean {
    const s = this.state;
    if (s.cursorY >= ROWS - 1) {
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

  /** CLR: fills the screen with spaces in the current pen color, homes the cursor, and clears all link flags. */
  private clear(): void {
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
    s.screen.copyWithin(0, COLS, CELLS);
    s.colorRam.copyWithin(0, COLS, CELLS);
    s.screen.fill(0x20, CELLS - COLS, CELLS);
    s.colorRam.fill(s.pen, CELLS - COLS, CELLS);
    for (let y = 0; y < ROWS - 1; y++) this.rowLinked[y] = this.rowLinked[y + 1];
    this.rowLinked[ROWS - 1] = false;
  }

  /** Last physical row of the logical line containing row y, found by following the link chain forward. */
  logicalLineEndRow(y: number): number {
    let end = y;
    while (end + 1 < ROWS && this.rowLinked[end + 1]) end++;
    return end;
  }

  /** First physical row of the logical line containing row y (ROM E6ED's walk back). */
  logicalLineStartRow(y: number): number {
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
    const startIdx = s.cursorY * COLS + s.cursorX;
    const endRow = this.logicalLineEndRow(s.cursorY);
    const endIdx = endRow * COLS + (COLS - 1);
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
    const lastIdx = this.logicalLineEndRow(s.cursorY) * COLS + (COLS - 1);
    const onLastCell = s.cursorY * COLS + s.cursorX === lastIdx;
    if (s.screen[lastIdx] !== 0x20 || onLastCell) {
      const startRow = this.logicalLineStartRow(s.cursorY);
      if (this.logicalLineEndRow(s.cursorY) - startRow >= 1) return; // CPY #$4F: an 80-char line cannot grow
      this.openSpaceOnScreen();
    }
    const startIdx = s.cursorY * COLS + s.cursorX;
    const endIdx = this.logicalLineEndRow(s.cursorY) * COLS + (COLS - 1);
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
    while (marker < ROWS && this.rowLinked[marker]) marker++;
    if (marker > ROWS - 1) {
      // E975: no row left below, so the screen scrolls and the freed bottom row
      // is the one that joins the line. `scroll()` moves the cursor's row up
      // with everything else (E8EA `DEC $D6`).
      this.scroll();
      marker = ROWS - 1;
      if (s.cursorY > 0) s.cursorY--;
    } else {
      // E981-E9A6: rows marker..23 move down to marker+1..24, row `marker` is
      // cleared, and the link flags travel with their rows.
      for (let y = ROWS - 1; y > marker; y--) {
        s.screen.copyWithin(y * COLS, (y - 1) * COLS, y * COLS);
        s.colorRam.copyWithin(y * COLS, (y - 1) * COLS, y * COLS);
        this.rowLinked[y] = this.rowLinked[y - 1];
      }
      s.screen.fill(0x20, marker * COLS, (marker + 1) * COLS);
      s.colorRam.fill(s.pen, marker * COLS, (marker + 1) * COLS);
    }
    // E6DA: the marker row becomes a continuation of the cursor's line, and the
    // row after it starts a new one.
    this.rowLinked[marker] = true;
    if (marker + 1 < ROWS) this.rowLinked[marker + 1] = false;
  }
}
