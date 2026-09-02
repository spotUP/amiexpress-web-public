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
}

export class PetsciiMachine {
  readonly state: PetsciiMachineState = {
    cols: COLS, rows: ROWS,
    screen: new Uint8Array(CELLS).fill(0x20),
    colorRam: new Uint8Array(CELLS).fill(14),
    cursorX: 0, cursorY: 0, charsetBank: 0, reverse: false,
    pen: 14, background: 0, border: 0,
  };
  /** rowLinked[y] = true when row y is the continuation of row y-1 (logical 80-char line) */
  private rowLinked: boolean[] = new Array(ROWS).fill(false);
  /** A `$02` has been seen and the NEXT byte is a candidate background colour. Survives chunk boundaries. */
  private bgPrefix = false;
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
    this.rowLinked.fill(false);
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
    if (b < 0x20 || (b >= 0x80 && b <= 0x9F)) return false; // all other controls: no-op
    // printable
    const sc = printablePetsciiToScreenCode(b) | (s.reverse ? 0x80 : 0);
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
    let scrolled = false;
    if (s.cursorY >= ROWS - 1) {
      this.scroll();
      scrolled = true;
    } else {
      s.cursorY++;
    }
    if (fromPrint) this.rowLinked[s.cursorY] = true;
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
   * INSERT ($94): shifts every cell from the cursor through the end of the
   * logical line right by one (dropping whatever was in the logical line's
   * final cell), then writes a space at the cursor position.
   */
  private insertChar(): void {
    const s = this.state;
    const startIdx = s.cursorY * COLS + s.cursorX;
    const endRow = this.logicalLineEndRow(s.cursorY);
    const endIdx = endRow * COLS + (COLS - 1);
    for (let i = endIdx; i > startIdx; i--) {
      s.screen[i] = s.screen[i - 1];
      s.colorRam[i] = s.colorRam[i - 1];
    }
    s.screen[startIdx] = 0x20;
    s.colorRam[startIdx] = s.pen;
  }
}
