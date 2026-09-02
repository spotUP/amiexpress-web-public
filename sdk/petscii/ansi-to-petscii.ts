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
import { PetsciiMachine } from './petscii-machine';
import { C64_PALETTE_COLODORE, PETSCII_COLOR_TO_VIC, hexToRgb } from './c64-palette';
import { screenCodeToPetscii } from './screen-codes';
import { UNICODE_TO_PETSCII } from './unicode-to-petscii';

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
   * long eats a blank row. Set by a printable that wrapped, cleared by any
   * cursor-moving operation, consumed by newline().
   */
  private pendingWrap = false;

  constructor(opts: AnsiToPetsciiOptions = {}) {
    this.palette = opts.palette ?? C64_PALETTE_COLODORE;
  }

  reset(): void {
    this.machine.reset();
    this.pending = '';
    this.bold = false;
    this.ansiReverse = false;
    this.savedCursor = null;
    this.pendingWrap = false;
  }

  /** Raw PETSCII bytes that reached the terminal without passing through transduce(). */
  observe(bytes: Uint8Array | number[]): void {
    this.machine.feed(bytes);
    this.pendingWrap = false;
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
      if (code === 0x08 || code === 0x7F) { this.pendingWrap = false; this.emit(out, 0x9D); i++; continue; }
      if (ch === '\t') {
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

  private ensureBank(bank: 0 | 1, out: number[]): void {
    if (this.machine.state.charsetBank !== bank) this.emit(out, bank === 1 ? 0x0E : 0x8E);
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
   * so the latch can never be missed (plain text, inverse-only glyphs, PUA).
   */
  private emitPrintable(out: number[], byte: number): void {
    const atLastColumn = this.machine.state.cursorX === COLS - 1;
    this.emit(out, byte);
    this.pendingWrap = atLastColumn && this.machine.state.cursorX === 0;
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
    if (this.pendingWrap) {
      this.pendingWrap = false;
      while (st.cursorX > 0) this.emit(out, 0x9D);
      return;
    }
    if (this.machine.logicalLineEndRow(st.cursorY) !== st.cursorY) {
      this.moveTo(0, st.cursorY + 1, out);
      return;
    }
    this.emit(out, 0x0D);
  }

  /** Lone CR: column 0 of the same row. $9D never crosses a row boundary here because x lefts from column x stop at 0. */
  private carriageOnly(out: number[]): void {
    this.pendingWrap = false;
    const x = this.machine.state.cursorX;
    for (let k = 0; k < x; k++) this.emit(out, 0x9D);
  }

  private printChar(out: number[], code: number): void {
    if (code >= 0x61 && code <= 0x7A) return this.printByte(out, code - 0x20);   // a-z -> $41-$5A
    if (code >= 0x41 && code <= 0x5A) return this.printByte(out, code + 0x80);   // A-Z -> $C1-$DA
    if (code >= 0x20 && code <= 0x3F) return this.printByte(out, code);
    switch (code) {
      case 0x40: case 0x5B: case 0x5D: return this.printByte(out, code); // @ [ ]
      case 0x5C: return this.printByte(out, 0x2F);   // backslash: PETSCII has pound there -> '/'
      case 0x5E: return this.printByte(out, 0x5E);   // ^ -> up-arrow glyph
      case 0x5F: return this.printByte(out, 0xA4);   // _ -> lower one-eighth block (PETSCII underline)
      case 0x60: return this.printByte(out, 0x27);   // ` -> '
      case 0x7B: return this.printByte(out, 0x28);   // { -> (
      case 0x7D: return this.printByte(out, 0x29);   // } -> )
      case 0x7C: return this.printByte(out, 0xDD);   // | -> vertical bar graphic (same glyph in both banks)
      case 0x7E: return this.printByte(out, 0x2D);   // ~ -> -
    }
    const mapped = UNICODE_TO_PETSCII.get(String.fromCodePoint(code));
    if (mapped === undefined) return this.printByte(out, 0x3F);          // unsupported glyph -> '?'
    if (typeof mapped === 'number') return this.printByte(out, mapped);
    // Glyph only exists as the inverse of another PETSCII glyph.
    this.ensureBank(1, out);
    this.setReverse(true, out);
    this.emitPrintable(out, mapped.rvs);
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
    if (next === '7') { const st = this.machine.state; this.savedCursor = { x: st.cursorX, y: st.cursorY }; return 2; }
    if (next === '8') { if (this.savedCursor) this.moveTo(this.savedCursor.x, this.savedCursor.y, out); return 2; }
    if (next === 'M') { const st = this.machine.state; this.moveTo(st.cursorX, Math.max(0, st.cursorY - 1), out); return 2; }
    if (next === 'c') { this.pendingWrap = false; this.emit(out, 0x93); this.bold = false; this.ansiReverse = false; return 2; }
    return 2; // ESC =, ESC >, ESC D, ESC E, ...: no C64 equivalent, dropped
  }

  private csi(params: string, final: string, out: number[]): void {
    const isPrivate = params.startsWith('?');
    const nums = (isPrivate ? params.slice(1) : params).split(';').map((p) => (p === '' ? NaN : parseInt(p, 10)));
    const n = (idx: number, dflt: number) => (Number.isNaN(nums[idx]) || nums[idx] === undefined ? dflt : nums[idx]);
    const st = this.machine.state;
    if (isPrivate) {
      // ?25 cursor show/hide, ?1000-1006 mouse, ?7 wrap: no C64 equivalent. ?47/?1049 alternate screen:
      // blessed repaints a full frame on entry and the BBS repaints on exit - a clear is the honest translation.
      if ((n(0, 0) === 47 || n(0, 0) === 1049) && (final === 'h' || final === 'l')) this.clearKeepingCursor(out, 0, 0);
      return;
    }
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
      case 's': this.savedCursor = { x: st.cursorX, y: st.cursorY }; return;
      case 'u': if (this.savedCursor) this.moveTo(this.savedCursor.x, this.savedCursor.y, out); return;
      default: return; // L M @ P (insert/delete line/char), r (scroll region), n, t, h, l: dropped, documented
    }
  }

  private clampCol(x: number): number { return Math.max(0, Math.min(COLS - 1, x)); }
  private clampRow(y: number): number { return Math.max(0, Math.min(ROWS - 1, y)); }

  /**
   * Absolute positioning as deltas against the oracle. HOME ($13) when the
   * target is (0,0). Deltas never wrap or scroll: the target is inside
   * 40x25, so $1D stops before column 40, $11 stops before row 25, and $9D/$91
   * are only emitted when the cursor is right of / below the target.
   */
  private moveTo(x: number, y: number, out: number[]): void {
    const st = this.machine.state;
    this.pendingWrap = false; // any explicit cursor move settles the deferred wrap
    if (x === 0 && y === 0) { if (st.cursorX !== 0 || st.cursorY !== 0) this.emit(out, 0x13); return; }
    while (st.cursorY < y) this.emit(out, 0x11);
    while (st.cursorY > y) this.emit(out, 0x91);
    while (st.cursorX < x) this.emit(out, 0x1D);
    while (st.cursorX > x) this.emit(out, 0x9D);
  }

  private sgr(codes: number[], out: number[]): void {
    // `codes` is never empty: csi() splits on ';' and 'ESC[m' yields [NaN] -> [0].
    let p = 0;
    while (p < codes.length) {
      const c = codes[p];
      if (c === 0) { this.bold = false; this.ansiReverse = false; this.setReverse(false, out); this.setPen(1, out); p++; continue; }
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
        if (c === 38) this.setPen(nearestVicForRgb(rgb[0], rgb[1], rgb[2], this.palette), out);
        p += mode === 2 ? 5 : 3;
        continue;
      }
      const vic = sgrColorToVic(c, this.bold);
      if (vic !== null) this.setPen(vic, out);
      p++; // 40-47, 49, 100-107 (bg), 2/3/4/5/24/25 ... : no C64 equivalent, dropped
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
   * Cell (39,24) is never written: a print there scrolls the whole screen,
   * which ANSI erase never does, and nothing can have been printed there
   * without scrolling either, so it is blank whenever it matters.
   */
  private fillRow(r: number, x0: number, x1: number, out: number[]): void {
    const last = r === ROWS - 1 ? Math.min(x1, COLS - 2) : Math.min(x1, COLS - 1);
    if (last < x0) return;
    this.moveTo(x0, r, out);
    this.setReverse(false, out);
    for (let x = x0; x <= last; x++) this.emit(out, 0x20);
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

  /** $93 clears AND homes on the C64; ANSI 2J does not home, so the cursor goes back to (x,y) afterwards. */
  private clearKeepingCursor(out: number[], x: number, y: number): void {
    this.pendingWrap = false;
    this.emit(out, 0x93);
    this.moveTo(x, y, out);
  }
}
