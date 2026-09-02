/**
 * FrameReconstructor: an ANSI/VT byte stream (what a 68K or blessed door
 * emits for an 80-column terminal) replayed onto a virtual cell grid.
 *
 * This is the ANSI side of the C64 door adapter, so the terminal it models
 * is xterm, not the KERNAL: deferred wrap (printing into the last column
 * holds the cursor there until the next printable), 8-column tab stops,
 * ED/EL/ECH that never move the cursor, alternate screen = clear. The one
 * deliberate Amiga-ism: a lone LF is a newline to column 0 (CON: and the
 * transducer both treat it so, and doors send it meaning that).
 *
 * Parser structure mirrors AnsiToPetsciiTransducer.escape()/csi() so the
 * two stay reviewable side by side: partial escapes are held across
 * write() calls, string sequences (OSC/DCS/APC/PM/SOS) are swallowed with
 * the same 256-byte runaway cap, unknown finals are dropped.
 *
 * Colours resolve into VIC indices at SGR time with the transducer's own
 * tables, so a frame diff-rendered back through the transducer reproduces
 * exactly the colours the transducer would have chosen from the raw stream.
 *
 * Pure TypeScript: no DOM, no Node imports.
 */
import { nearestVicForRgb, sgrColorToVic, xterm256ToRgb } from '../ansi-to-petscii';
import { C64_PALETTE_COLODORE } from '../c64-palette';
import { Cell, Cursor, Frame, DEFAULT_BG, DEFAULT_FG, blankCell, cloneCell } from './types';

const ESC = '\x1b';
/** Same cap as the transducer: a string sequence that lost its terminator is dropped, not held for ever. */
const STRING_SEQUENCE_MAX = 256;

export interface FrameReconstructorOptions {
  cols?: number;
  rows?: number;
  /** VIC-II palette used for truecolor/256-color nearest matching. Defaults to Colodore, like the transducer. */
  palette?: readonly string[];
}

interface Attrs { fg: number; bg: number; bold: boolean; rvs: boolean; }

export class FrameReconstructor {
  readonly cols: number;
  readonly rows: number;
  private readonly palette: readonly string[];
  private grid: Cell[][] = [];
  private x = 0;
  private y = 0;
  private pendingWrap = false;
  private attrs: Attrs = { fg: DEFAULT_FG, bg: DEFAULT_BG, bold: false, rvs: false };
  private saved: Cursor | null = null;
  private pending = '';
  private dirty = new Set<number>();

  constructor(opts: FrameReconstructorOptions = {}) {
    this.cols = opts.cols ?? 80;
    this.rows = opts.rows ?? 25;
    this.palette = opts.palette ?? C64_PALETTE_COLODORE;
    this.reset();
    // A power-on frame has changed nothing yet: the first snapshot() is the
    // consumer's baseline. A reset() mid-stream (ESC c) does change every row,
    // which is why reset() itself dirties them and only the constructor clears.
    this.dirty.clear();
  }

  get cursor(): Cursor { return { x: this.x, y: this.y }; }

  reset(): void {
    this.grid = [];
    for (let y = 0; y < this.rows; y++) this.grid.push(this.blankRow());
    this.x = 0;
    this.y = 0;
    this.pendingWrap = false;
    this.attrs = { fg: DEFAULT_FG, bg: DEFAULT_BG, bold: false, rvs: false };
    this.saved = null;
    this.pending = '';
    this.dirty = new Set<number>();
    for (let y = 0; y < this.rows; y++) this.dirty.add(y);
  }

  /** Immutable copy of the grid and cursor. Clears the dirty set. */
  snapshot(): Frame {
    const cells = this.grid.map((row) => row.map(cloneCell));
    this.dirty.clear();
    return { cols: this.cols, rows: this.rows, cells, cursor: { x: this.x, y: this.y } };
  }

  /** Rows written since the last snapshot(), ascending. */
  dirtyRows(): number[] {
    return Array.from(this.dirty).sort((a, b) => a - b);
  }

  write(text: string): void {
    const s = this.pending + text;
    this.pending = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      const code = s.codePointAt(i) as number;
      if (ch === ESC) {
        const consumed = this.escape(s, i);
        if (consumed === 0) { this.pending = s.slice(i); break; }
        i += consumed;
        continue;
      }
      if (ch === '\r') { this.x = 0; this.pendingWrap = false; i++; continue; }
      if (ch === '\n') { this.newline(); i++; continue; }
      if (code === 0x08) { if (this.x > 0) this.x--; this.pendingWrap = false; i++; continue; }
      if (ch === '\t') { this.pendingWrap = false; this.x = Math.min(this.cols - 1, (Math.floor(this.x / 8) + 1) * 8); i++; continue; }
      if (code < 0x20 || code === 0x7F) { i++; continue; }
      this.put(String.fromCodePoint(code));
      i += code > 0xFFFF ? 2 : 1;
    }
  }

  // ---- grid ------------------------------------------------------------

  private blankRow(): Cell[] {
    const row: Cell[] = [];
    for (let x = 0; x < this.cols; x++) row.push(blankCell());
    return row;
  }

  private put(ch: string): void {
    if (this.pendingWrap) { this.pendingWrap = false; this.x = 0; this.index(); }
    const cell = this.grid[this.y][this.x];
    cell.ch = ch;
    cell.fg = this.attrs.fg;
    cell.bg = this.attrs.bg;
    cell.bold = this.attrs.bold;
    cell.rvs = this.attrs.rvs;
    this.dirty.add(this.y);
    if (this.x === this.cols - 1) this.pendingWrap = true;
    else this.x++;
  }

  /** Column 0 of the next row, scrolling at the bottom. A pending wrap is only a held column, not a row move: LF still advances one row. */
  private newline(): void {
    this.x = 0;
    this.pendingWrap = false;
    this.index();
  }

  /** Down one row (column unchanged), scrolling at the bottom - ESC D. */
  private index(): void {
    if (this.y >= this.rows - 1) this.scrollUp();
    else this.y++;
  }

  private scrollUp(): void {
    this.grid.shift();
    this.grid.push(this.blankRow());
    for (let y = 0; y < this.rows; y++) this.dirty.add(y);
  }

  private scrollDown(): void {
    this.grid.pop();
    this.grid.unshift(this.blankRow());
    for (let y = 0; y < this.rows; y++) this.dirty.add(y);
  }

  private moveTo(x: number, y: number): void {
    this.pendingWrap = false;
    this.x = Math.max(0, Math.min(this.cols - 1, x));
    this.y = Math.max(0, Math.min(this.rows - 1, y));
  }

  /** Blank columns x0..x1 of row r with default cells; the cursor is not moved (ANSI erase never moves it). */
  private fillRow(r: number, x0: number, x1: number): void {
    const last = Math.min(x1, this.cols - 1);
    for (let x = Math.max(0, x0); x <= last; x++) this.grid[r][x] = blankCell();
    if (last >= x0) this.dirty.add(r);
  }

  private clear(): void {
    for (let y = 0; y < this.rows; y++) this.grid[y] = this.blankRow();
    for (let y = 0; y < this.rows; y++) this.dirty.add(y);
  }

  // ---- escape sequences ------------------------------------------------

  /** Returns chars consumed, or 0 when the sequence is incomplete (caller holds the tail). */
  private escape(s: string, i: number): number {
    const next = s[i + 1];
    if (next === undefined) return 0;
    if (next === '[') {
      let j = i + 2;
      let params = '';
      while (j < s.length && s.charCodeAt(j) >= 0x20 && s.charCodeAt(j) <= 0x3F) params += s[j++];
      if (j >= s.length) return 0;
      this.csi(params, s[j]);
      return j - i + 1;
    }
    if (next === ']' || next === 'P' || next === '_' || next === '^' || next === 'X') {
      for (let j = i + 2; j < s.length; j++) {
        if (s[j] === '\x07') return j - i + 1;
        if (s[j] === ESC && s[j + 1] === '\\') return j - i + 2;
        if (s[j] === ESC && s[j + 1] === undefined) break;
        if (s[j] === '\r' || s[j] === '\n') return j - i;
      }
      return s.length - i > STRING_SEQUENCE_MAX ? s.length - i : 0;
    }
    if (next === '(' || next === ')' || next === '*' || next === '+') return s[i + 2] === undefined ? 0 : 3;
    if (next === '7') { this.saved = { x: this.x, y: this.y }; return 2; }
    if (next === '8') { if (this.saved) this.moveTo(this.saved.x, this.saved.y); return 2; }
    if (next === 'M') { this.pendingWrap = false; if (this.y > 0) this.y--; else this.scrollDown(); return 2; }
    if (next === 'D') { this.pendingWrap = false; this.index(); return 2; }
    if (next === 'E') { this.newline(); return 2; }
    if (next === 'c') { this.reset(); return 2; }
    return 2; // ESC =, ESC >, ...: nothing to model
  }

  private csi(params: string, final: string): void {
    const isPrivate = params.startsWith('?');
    const nums = (isPrivate ? params.slice(1) : params).split(';').map((p) => (p === '' ? NaN : parseInt(p, 10)));
    const n = (idx: number, dflt: number) => (Number.isNaN(nums[idx]) || nums[idx] === undefined ? dflt : nums[idx]);
    if (isPrivate) {
      // ?47 / ?1049 alternate screen: blessed repaints a full frame on entry and the BBS repaints
      // on exit - a clear + home is the honest model (same call the transducer makes).
      if ((n(0, 0) === 47 || n(0, 0) === 1049) && (final === 'h' || final === 'l')) { this.clear(); this.moveTo(0, 0); }
      return; // ?25 cursor visibility, ?7 autowrap, ?1000-1006 mouse: not modelled
    }
    switch (final) {
      case 'm': return this.sgr(nums.map((v) => (Number.isNaN(v) ? 0 : v)));
      case 'A': return this.moveTo(this.x, this.y - n(0, 1));
      case 'B': return this.moveTo(this.x, this.y + n(0, 1));
      case 'C': return this.moveTo(this.x + n(0, 1), this.y);
      case 'D': return this.moveTo(this.x - n(0, 1), this.y);
      case 'E': return this.moveTo(0, this.y + n(0, 1));
      case 'F': return this.moveTo(0, this.y - n(0, 1));
      case 'G': return this.moveTo(n(0, 1) - 1, this.y);
      case 'd': return this.moveTo(this.x, n(0, 1) - 1);
      case 'H': case 'f': return this.moveTo(n(1, 1) - 1, n(0, 1) - 1);
      case 'J': return this.eraseDisplay(n(0, 0));
      case 'K': return this.eraseLine(n(0, 0));
      case 'X': return this.eraseChars(n(0, 1));
      case 's': this.saved = { x: this.x, y: this.y }; return;
      case 'u': if (this.saved) this.moveTo(this.saved.x, this.saved.y); return;
      default: return; // L M @ P (insert/delete), r (scroll region), S T, n, t, h, l: dropped, as in the transducer
    }
  }

  // Task 3 fills these four in; the skeleton keeps Task 2's tests honest about
  // dispatch. Until then `palette`, `fillRow()` and the three transducer colour
  // helpers imported above are the pieces those bodies are waiting for - they are
  // the reason the imports exist, not leftovers.
  private sgr(codes: number[]): void { void codes; void this.palette; void sgrColorToVic; void nearestVicForRgb; void xterm256ToRgb; }
  private eraseDisplay(mode: number): void { void mode; void this.fillRow; }
  private eraseLine(mode: number): void { void mode; }
  private eraseChars(count: number): void { void count; }
}
