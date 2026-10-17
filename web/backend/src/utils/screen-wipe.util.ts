/**
 * Screen Wipe Animation Utility
 *
 * Provides 20 different screen wipe animations for BBS screen transitions.
 * Each animation returns an array of frames with timing information.
 *
 * MCI Commands:
 * ~WM - Matrix Rain (scramble characters, cascade down)
 * ~WH - Horizontal Blinds (reveal in horizontal strips)
 * ~WV - Vertical Blinds (reveal in vertical strips)
 * ~WS - Spiral Wipe (spiral from outside to center)
 * ~WC - Checkerboard (alternating squares)
 * ~WR - Radial/Radar Wipe (sweeps like radar)
 * ~WB - Block Wipe (random blocks appear)
 * ~WN - Noise Fade (static resolves to content)
 * ~WT - Typewriter (types out line by line)
 * ~WE - Explode (from center outward)
 * ~WW - Sweep (columns left to right in bands)
 * ~WD - Diagonal (anti-diagonals, top-left to bottom-right)
 * ~WI - Iris (diamond opens from the centre)
 * ~WO - Curtain (two halves open from the centre column)
 * ~WL - Interlace (even rows, then odd rows)
 * ~WU - Melt (columns drop in with random delays)
 * ~WZ - Zoom (rectangle opens from the centre)
 * ~WF - Dissolve (cells in random order, 10 batches)
 * ~WY - Wave (sine-curved front, left to right)
 * ~WK - Snake (row bands, alternating direction)
 * ~WX - Random (picks any of the above)
 *
 * A wipe is a sequence of {content, delay} frames. The FIRST frame clears
 * and paints the whole screen; every frame after it carries only the cells
 * that changed (cursor-addressed runs), and the last frame is the caller's
 * own content homed over the finished animation.
 */

import { renderRunDiff } from '@amiexpress/bbs-door-sdk/common/run-diff';

import { WIPE_CODES, type WipeType } from '../screens/wipe-codes';

export { WIPE_CODES, type WipeType };

export interface WipeFrame {
  content: string;
  delay: number; // milliseconds
}

const MATRIX_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
const NOISE_CHARS = '.:;+*#%@x·°¤×'; // ISO-8859-1 only: board art is Amiga ANSI (Topaz), never CP437 block glyphs

/** Every animation frame repaints the whole screen from the top-left. */
const CLEAR_HOME = '\x1b[2J\x1b[H';

/** The final frame paints over the last animation frame instead of clearing it. */
const HOME = '\x1b[H';

/** SGR with no attributes set. */
const RESET = '\x1b[0m';

/** A cell nothing has painted: a space in the terminal's default attributes. */
const BLANK: Cell = Object.freeze({ char: ' ', ansi: RESET });

/**
 * The width the board's screens are drawn at, and the default this engine
 * models a terminal at. A longer row wraps, as it does on the wire.
 *
 * It is a DEFAULT, not a constant: a C64 caller reads the same screen at 40,
 * and a wipe composed on an 80-column grid smears across his 40 - which is
 * why wipes were refused to PETSCII callers outright until 2026-09-07. The
 * caller's own width is threaded in from `getWipeFrames`.
 */
const DEFAULT_GRID_COLUMNS = 80;

/**
 * Upper bound on grid rows. A screen is normally <= 25 rows; the cap only
 * stops a bogus `\x1b[999B` from allocating an unbounded grid.
 */
const MAX_GRID_ROWS = 200;

interface Cell {
  char: string;
  ansi: string;
}

/**
 * The full SGR state of a cell.
 *
 * A cell has to carry the COMPLETE state, not the last escape sequence that
 * happened to precede it: the wipes paint cells out of order and in
 * isolation, so `\x1b[1m` … `\x1b[33m` has to reach the wire as "bold
 * yellow" even when the `\x1b[1m` cell itself is still hidden. Colours are
 * kept as the raw SGR parameter text (`31`, `91`, `38;5;196`,
 * `38;2;255;0;0`) so 256-colour and truecolor screens survive untouched.
 */
interface Attributes {
  intensity: '' | '1' | '2';
  italic: boolean;
  underline: boolean;
  blink: boolean;
  reverse: boolean;
  conceal: boolean;
  strike: boolean;
  fg: string;
  bg: string;
}

function defaultAttributes(): Attributes {
  return {
    intensity: '',
    italic: false,
    underline: false,
    blink: false,
    reverse: false,
    conceal: false,
    strike: false,
    fg: '',
    bg: '',
  };
}

/**
 * One self-contained escape sequence for a complete attribute state.
 * Always starts from `0` so a cell never inherits the previous cell's state.
 */
function attributesToAnsi(attrs: Attributes): string {
  const params: string[] = [];
  if (attrs.intensity) params.push(attrs.intensity);
  if (attrs.italic) params.push('3');
  if (attrs.underline) params.push('4');
  if (attrs.blink) params.push('5');
  if (attrs.reverse) params.push('7');
  if (attrs.conceal) params.push('8');
  if (attrs.strike) params.push('9');
  if (attrs.fg) params.push(attrs.fg);
  if (attrs.bg) params.push(attrs.bg);
  return params.length === 0 ? RESET : `\x1b[0;${params.join(';')}m`;
}

/** Apply one SGR sequence's parameters to the running attribute state. */
function applySgr(params: string, attrs: Attributes): void {
  const parts = params === '' ? ['0'] : params.split(';');

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i] === '' ? '0' : parts[i];
    const code = parseInt(raw, 10);
    if (Number.isNaN(code)) continue;

    if (code === 0) {
      Object.assign(attrs, defaultAttributes());
    } else if (code === 1 || code === 2) {
      attrs.intensity = String(code) as '1' | '2';
    } else if (code === 22) {
      attrs.intensity = '';
    } else if (code === 3) { attrs.italic = true; }
    else if (code === 23) { attrs.italic = false; }
    else if (code === 4) { attrs.underline = true; }
    else if (code === 24) { attrs.underline = false; }
    else if (code === 5 || code === 6) { attrs.blink = true; }
    else if (code === 25) { attrs.blink = false; }
    else if (code === 7) { attrs.reverse = true; }
    else if (code === 27) { attrs.reverse = false; }
    else if (code === 8) { attrs.conceal = true; }
    else if (code === 28) { attrs.conceal = false; }
    else if (code === 9) { attrs.strike = true; }
    else if (code === 29) { attrs.strike = false; }
    else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) { attrs.fg = String(code); }
    else if (code === 39) { attrs.fg = ''; }
    else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) { attrs.bg = String(code); }
    else if (code === 49) { attrs.bg = ''; }
    else if (code === 38 || code === 48) {
      // Extended colour: `38;5;n` (256) or `38;2;r;g;b` (truecolor). The
      // whole run is one colour - consuming it here is what keeps the
      // following glyph from being eaten by a stray parameter.
      const mode = parseInt(parts[i + 1] ?? '', 10);
      const consumed = mode === 5 ? 2 : mode === 2 ? 4 : 0;
      if (consumed === 0) continue;
      const value = parts.slice(i, i + consumed + 1).join(';');
      if (code === 38) attrs.fg = value; else attrs.bg = value;
      i += consumed;
    }
  }
}

/**
 * Parse ANSI content into a 2D grid of characters with their colors.
 *
 * This is a small SCREEN model, not a line splitter: it runs the content
 * against a cursor. Positional escapes have to be materialised - a screen
 * that indents with `\x1b[23C` (Conf1/Menu.txt does, 14 times) or breaks a
 * line with `\x1b[E` puts its glyphs in columns and rows that simply do not
 * exist in a "split on \n, drop what is not an SGR" model, and every wipe
 * built on that model paints the screen shifted. The grid is where that has
 * to be right: fix it once and all ten wipes are fixed.
 *
 * What is deliberately NOT reproduced: scrolling (a screen taller than the
 * terminal is emitted row by row exactly as the direct-display path emits
 * it) and the pending-wrap subtlety at column 80. `getWipeFrames` ends the
 * animation on the caller's own bytes, so the screen the user is left
 * looking at never depends on this model being bit-exact.
 */
export function parseAnsiToGrid(content: string, columns: number = DEFAULT_GRID_COLUMNS): Cell[][] {
  const grid = new AnsiGrid(columns);
  grid.feed(content);
  // Trailing untouched cells carry no information; dropping them keeps the
  // frames the size they were before this model existed.
  return grid.rows.map(trimRow);
}

/** A cell of the grid: one glyph and its COMPLETE SGR state (see Attributes). */
export type GridCell = Cell;

/** Grow a row with blanks until index `x` exists. */
function padRow(r: Cell[], x: number): void {
  while (r.length <= x) r.push(BLANK);
}

/** The longest unfinished escape a chunk may leave for the next one; longer is garbage and dropped. */
const MAX_PENDING_ESCAPE = 4096;

/**
 * The cursor-and-cells step the board's ANSI runs through, one chunk at a time.
 *
 * Two users. `parseAnsiToGrid` feeds a whole screen file to a grid built
 * without `height`, and every step is exactly what that parser always did
 * (no scrolling, rows up to MAX_GRID_ROWS, erases to the default blank, an
 * unfinished sequence at the end ends the parse). The per-session screen model
 * (services/screen-model) passes the caller's `height` and gets a terminal:
 * the cursor stays on the screen, a line feed or a wrap on the bottom row of
 * the scroll region scrolls it, erases paint the current background (xterm's
 * BCE), the controls a door's screen library sends (DECSTBM, IND/RI/NEL,
 * DECSC/DECRC, RIS, SU/SD, IL/DL, ICH/DCH, ECH, VPA) are applied, and an
 * escape split across two writes is finished by the next one.
 *
 * Not modelled: origin mode, insert mode, the pending-wrap column after a
 * CUB/BS, double-width glyphs. A screen that uses them restores slightly off;
 * the door's next full paint corrects it.
 */
export class AnsiGrid {
  readonly rows: Cell[][] = [[]];
  /** The SGR in force, as one self-contained sequence. */
  ansi = RESET;
  row = 0;
  col = 0;
  private readonly attrs = defaultAttributes();
  private saved = { row: 0, col: 0 };
  private savedDec: { row: number; col: number; attrs: Attributes } | null = null;
  private scrollTop = 0;
  private scrollBottom: number;
  private pending = '';

  constructor(public columns: number = DEFAULT_GRID_COLUMNS, public height?: number) {
    this.scrollBottom = this.lastRow;
  }

  private get model(): boolean { return this.height !== undefined; }
  private get lastRow(): number { return this.height === undefined ? MAX_GRID_ROWS : this.height - 1; }

  /** The cell at (y, x), 0-based; a blank where nothing was painted. */
  cellAt(y: number, x: number): Cell {
    return cellAt(this.rows, y, x);
  }

  /** The terminal changed size (model): the bottom of the screen and the cursor are kept, the rest cut to fit. */
  resize(columns: number, height: number): void {
    if (columns === this.columns && height === this.height) return;
    const shift = Math.max(0, this.row - (height - 1));
    this.rows.splice(0, shift);
    if (this.rows.length > height) this.rows.length = height;
    for (const r of this.rows) if (r.length > columns) r.length = columns;
    if (this.rows.length === 0) this.rows.push([]);
    this.columns = columns;
    this.height = height;
    this.scrollTop = 0;
    this.scrollBottom = this.lastRow;
    this.row = Math.min(this.row - shift, this.lastRow);
    this.col = Math.min(this.col, columns - 1);
  }

  private ensureRow(y: number): void {
    while (this.rows.length <= y) this.rows.push([]);
  }

  private moveTo(y: number, x: number): void {
    this.row = Math.max(0, Math.min(y, this.lastRow));
    this.col = Math.max(0, Math.min(x, this.columns - 1));
    this.ensureRow(this.row);
  }

  /** What an erase leaves: the current background on a terminal, the default blank in a parsed file. */
  private eraseCell(): Cell {
    if (!this.model || this.attrs.bg === '') return BLANK;
    return { char: ' ', ansi: attributesToAnsi({ ...defaultAttributes(), bg: this.attrs.bg }) };
  }

  private blankRow(): Cell[] {
    const fill = this.eraseCell();
    return fill === BLANK ? [] : new Array<Cell>(this.columns).fill(fill);
  }

  /** Erase [x0, x1) of row y (model). */
  private erase(y: number, x0: number, x1: number): void {
    this.ensureRow(y);
    const r = this.rows[y];
    const fill = this.eraseCell();
    const end = Math.min(x1, this.columns);
    if (fill === BLANK && end >= this.columns) {
      if (r.length > x0) r.length = x0;
      return;
    }
    if (end <= x0) return;
    padRow(r, end - 1);
    for (let x = x0; x < end; x++) r[x] = fill;
  }

  /** Scroll [from, scrollBottom] up by n (the top lines leave). */
  private scrollUp(n: number, from: number = this.scrollTop): void {
    this.ensureRow(this.scrollBottom);
    const count = Math.min(n, this.scrollBottom - from + 1);
    for (let k = 0; k < count; k++) {
      this.rows.splice(from, 1);
      this.rows.splice(this.scrollBottom, 0, this.blankRow());
    }
  }

  /** Scroll [from, scrollBottom] down by n (blank lines enter at `from`). */
  private scrollDown(n: number, from: number = this.scrollTop): void {
    this.ensureRow(this.scrollBottom);
    const count = Math.min(n, this.scrollBottom - from + 1);
    for (let k = 0; k < count; k++) {
      this.rows.splice(this.scrollBottom, 1);
      this.rows.splice(from, 0, this.blankRow());
    }
  }

  /** Down one line; on a terminal the bottom of the scroll region scrolls. */
  private index(): void {
    if (this.model && this.row === this.scrollBottom) { this.scrollUp(1); return; }
    this.moveTo(this.row + 1, this.col);
  }

  /** Run a chunk of output against the grid. */
  feed(chunk: string): void {
    const content = this.pending + chunk;
    this.pending = '';
    const hold = (from: number): void => {
      if (this.model && content.length - from <= MAX_PENDING_ESCAPE) this.pending = content.slice(from);
    };

    let i = 0;
    while (i < content.length) {
      const ch = content[i];

      /*
       * C1 CONTROLS, READ AS THE TERMINAL READS THEM (ECMA-48 8.3).
       *
       * Amiga art carries them: Screens/Conf/downloadmsg.txt opens with
       * `\x9d\r\n\x9d\r\n\x0c\r\n`. 0x9D is OSC, the start of a control
       * STRING, and the terminal swallows everything to its end - the line
       * breaks included - so the art starts three rows higher than a model that
       * prints 0x9D as a cell. The wipe painted there, the settle frame (the
       * file's own bytes) painted where the terminal put it, and the caller got
       * the logo twice (sysop, 2026-09-29). A string ends at BEL or ST (0x9C,
       * ESC \); any ESC ends it too, and is then read itself.
       */
      if (ch === '\x90' || ch === '\x98' || ch === '\x9d' || ch === '\x9e' || ch === '\x9f') {
        let j = i + 1;
        while (j < content.length && content[j] !== '\x07' && content[j] !== '\x9c' && content[j] !== '\x1b') j++;
        if (j >= content.length && this.model) { hold(i); return; }
        i = j < content.length && content[j] !== '\x1b' ? j + 1 : j;
        if (content[j] === '\x1b' && content[j + 1] === '\\') i = j + 2;
        continue;
      }
      const csiAt = ch === '\x9b' ? i + 1 : ch === '\x1b' && content[i + 1] === '[' ? i + 2 : -1;
      if (ch >= '\x80' && ch <= '\x9f' && csiAt < 0) { i++; continue; } // no width

      if (csiAt >= 0 || ch === '\x1b') {
        if (csiAt >= 0) {
          let j = csiAt;
          while (j < content.length && !isCsiFinalByte(content[j])) j++;
          if (j >= content.length) { hold(i); return; } // truncated: nothing left to paint (a terminal waits for the rest)
          const params = content.substring(csiAt, j);
          const final = content[j];
          i = j + 1;
          this.csi(params, final);
          continue;
        }

        // Non-CSI escape (ESC 7, ESC (B, ...). Consume it so the ESC byte
        // never lands in the grid as a printable glyph.
        const next = content[i + 1];
        const length = next !== undefined && '()#%'.includes(next) ? 3 : 2;
        if (this.model && i + length > content.length) { hold(i); return; }
        if (this.model) this.escape(next);
        i += length;
        continue;
      }

      if (ch === '\r') { this.col = 0; i++; continue; }
      // FF and VT move down a line as LF does (xterm; the web terminal's
      // convertEol makes LF a new line), and print nothing.
      if (ch === '\n' || ch === '\x0c' || ch === '\x0b') { this.index(); this.col = 0; i++; continue; }
      if (ch === '\t') { this.moveTo(this.row, Math.min(this.columns - 1, (Math.floor(this.col / 8) + 1) * 8)); i++; continue; }
      if (ch === '\b') { this.col = Math.max(0, this.col - 1); i++; continue; }
      if (ch === '\x07' || ch === '\x00') { i++; continue; }

      if (this.col >= this.columns) {
        // Wrap exactly where the terminal wraps.
        if (this.model) {
          this.index();
        } else {
          if (this.row >= MAX_GRID_ROWS) { i++; continue; }
          this.row++;
        }
        this.col = 0;
        this.ensureRow(this.row);
      }
      this.ensureRow(this.row);
      padRow(this.rows[this.row], this.col);
      this.rows[this.row][this.col] = { char: ch, ansi: this.ansi };
      this.col++;
      i++;
    }
  }

  /** One CSI sequence: SGR, the positional and erase controls, and (model) the terminal's line controls. */
  private csi(params: string, final: string): void {
    if (final === 'm') {
      applySgr(params, this.attrs);
      this.ansi = attributesToAnsi(this.attrs);
      return;
    }

    // Positional and erase controls. Anything else (mode set/reset,
    // device queries) is not part of the grid model.
    const numeric = params.replace(/[^0-9;]/g, '');
    const args = numeric.split(';').map(p => (p === '' ? NaN : parseInt(p, 10)));
    const arg = (idx: number, dflt: number): number =>
      (args[idx] === undefined || Number.isNaN(args[idx]) ? dflt : args[idx]);
    const positional = !/[?<>=]/.test(params);

    if (!positional) return;
    const { row, col } = this;

    switch (final) {
      case 'A': this.moveTo(row - arg(0, 1), col); return;
      case 'B': this.moveTo(row + arg(0, 1), col); return;
      case 'C': this.moveTo(row, col + arg(0, 1)); return;
      case 'D': this.moveTo(row, col - arg(0, 1)); return;
      case 'E': this.moveTo(row + arg(0, 1), 0); return;
      case 'F': this.moveTo(row - arg(0, 1), 0); return;
      case 'G': this.moveTo(row, arg(0, 1) - 1); return;
      case 'H':
      case 'f': this.moveTo(arg(0, 1) - 1, arg(1, 1) - 1); return;
      case 'J': this.model ? this.eraseDisplayModel(arg(0, 0)) : this.eraseDisplay(arg(0, 0)); return;
      case 'K': {
        const mode = arg(0, 0);
        if (this.model) {
          if (mode === 0) this.erase(row, col, this.columns);
          else if (mode === 1) this.erase(row, 0, col + 1);
          else this.erase(row, 0, this.columns);
          return;
        }
        this.ensureRow(row);
        if (mode === 0) {
          this.rows[row] = this.rows[row].slice(0, col);
        } else if (mode === 1) {
          padRow(this.rows[row], col);
          for (let x = 0; x <= col; x++) this.rows[row][x] = BLANK;
        } else {
          this.rows[row] = [];
        }
        return;
      }
      case 's': this.saved = { row, col }; return;
      case 'u': this.moveTo(this.saved.row, this.saved.col); return;
      default: break;
    }
    if (!this.model) return;

    const n = Math.max(1, arg(0, 1));
    const inRegion = row >= this.scrollTop && row <= this.scrollBottom;
    switch (final) {
      case 'd': this.moveTo(arg(0, 1) - 1, col); return;
      case 'S': this.scrollUp(n); return;
      case 'T': this.scrollDown(n); return;
      case 'L': if (inRegion) this.scrollDown(n, row); this.col = 0; return;
      case 'M': if (inRegion) this.scrollUp(n, row); this.col = 0; return;
      case 'X': this.erase(row, col, col + n); return;
      case '@': {
        this.ensureRow(row);
        const r = this.rows[row];
        if (r.length <= col) return;
        r.splice(col, 0, ...new Array<Cell>(n).fill(this.eraseCell()));
        if (r.length > this.columns) r.length = this.columns;
        return;
      }
      case 'P': {
        this.ensureRow(row);
        this.rows[row].splice(col, n);
        return;
      }
      case 'r': {
        const top = arg(0, 1) - 1;
        const bottom = Math.min(arg(1, this.lastRow + 1), this.lastRow + 1) - 1;
        if (top < bottom) { this.scrollTop = top; this.scrollBottom = bottom; } else { this.scrollTop = 0; this.scrollBottom = this.lastRow; }
        this.moveTo(0, 0);
        return;
      }
      default: return;
    }
  }

  /** ED in a parsed file: what parseAnsiToGrid always did. */
  private eraseDisplay(mode: number): void {
    const { rows, row, col } = this;
    if (mode === 0) {
      this.ensureRow(row);
      rows[row] = rows[row].slice(0, col);
      rows.length = row + 1;
    } else if (mode === 1) {
      this.ensureRow(row);
      padRow(rows[row], col);
      for (let x = 0; x <= col; x++) rows[row][x] = BLANK;
      for (let y = 0; y < row; y++) rows[y] = [];
    } else {
      for (let y = 0; y < rows.length; y++) rows[y] = [];
    }
  }

  /** ED on a terminal: the screen only (3, the scrollback, leaves it alone), in the current background. */
  private eraseDisplayModel(mode: number): void {
    const { row, col } = this;
    if (mode === 0) {
      this.erase(row, col, this.columns);
      for (let y = row + 1; y <= this.lastRow; y++) this.erase(y, 0, this.columns);
    } else if (mode === 1) {
      for (let y = 0; y < row; y++) this.erase(y, 0, this.columns);
      this.erase(row, 0, col + 1);
    } else if (mode === 2) {
      for (let y = 0; y <= this.lastRow; y++) this.erase(y, 0, this.columns);
    }
    if (this.eraseCell() === BLANK) this.trimTrailingRows();
  }

  private trimTrailingRows(): void {
    let end = this.rows.length;
    while (end > this.row + 1 && this.rows[end - 1].length === 0) end--;
    this.rows.length = end;
  }

  /** A two-byte escape on a terminal (model only). */
  private escape(next: string | undefined): void {
    switch (next) {
      case '7': this.savedDec = { row: this.row, col: this.col, attrs: { ...this.attrs } }; return;
      case '8': {
        const s = this.savedDec;
        if (!s) { this.moveTo(0, 0); return; }
        Object.assign(this.attrs, s.attrs);
        this.ansi = attributesToAnsi(this.attrs);
        this.moveTo(s.row, s.col);
        return;
      }
      case 'D': this.index(); return;
      case 'E': this.index(); this.col = 0; return;
      case 'M':
        if (this.row === this.scrollTop) this.scrollDown(1); else this.moveTo(this.row - 1, this.col);
        return;
      case 'c':
        this.rows.length = 0;
        this.rows.push([]);
        Object.assign(this.attrs, defaultAttributes());
        this.ansi = RESET;
        this.scrollTop = 0;
        this.scrollBottom = this.lastRow;
        this.savedDec = null;
        this.moveTo(0, 0);
        return;
      default: return;
    }
  }
}

function trimRow(row: Cell[]): Cell[] {
  let end = row.length;
  while (end > 0 && row[end - 1].char === ' ' && row[end - 1].ansi === RESET) end--;
  return end === row.length ? row : row.slice(0, end);
}

/** CSI sequences end at the first byte in the range `@`..`~`. */
function isCsiFinalByte(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 0x40 && code <= 0x7e;
}

/** Widest row in the grid (0 for an empty grid). */
function gridWidth(grid: Cell[][]): number {
  let width = 0;
  for (const row of grid) if (row.length > width) width = row.length;
  return width;
}

/**
 * Render grid back to ANSI string
 */
function gridToAnsi(grid: Cell[][]): string {
  const lines: string[] = [];

  for (const row of grid) {
    let line = '';
    let lastAnsi = '';

    for (const cell of row) {
      if (cell.ansi !== lastAnsi) {
        line += cell.ansi;
        lastAnsi = cell.ansi;
      }
      line += cell.char;
    }

    lines.push(line + RESET);
  }

  return lines.join('\r\n');
}

/** One wipe's animation: the grid at each step, and the step's pacing. */
interface WipeGrids {
  grids: Cell[][][];
  delay: number;
}

/** The cell at (y, x), or a blank if the grid does not reach that far. */
function cellAt(grid: Cell[][], y: number, x: number): Cell {
  const row = grid[y];
  if (!row) return BLANK;
  return row[x] ?? BLANK;
}

/** Two cells paint the same thing (a full attribute state per cell makes this exact). */
function sameCell(a: Cell, b: Cell): boolean {
  return a.char === b.char && a.ansi === b.ansi;
}

/**
 * The FIRST frame: clear, then paint every cell the grid holds, row by row
 * (a CUP per row rather than `\r\n`, so a row that fills the last column
 * cannot scroll the screen). Cells past a row's end were painted by the
 * clear; every later frame is a delta on top of this one.
 */
function renderGridFull(grid: Cell[][]): string {
  let out = '';

  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    if (row.length === 0) continue;   // the clear already painted it
    out += `\x1b[${y + 1};1H`;
    let lastAnsi = '';
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (cell.ansi !== lastAnsi) {
        out += cell.ansi;
        lastAnsi = cell.ansi;
      }
      out += cell.char;
    }
  }

  return out + RESET;
}

/** Rows (trailing blank rows dropped) and columns a grid occupies. */
export function gridSize(grid: Cell[][]): { rows: number; cols: number } {
  let rows = grid.length;
  while (rows > 0 && trimRow(grid[rows - 1]).length === 0) rows--;
  return { rows, cols: gridWidth(grid.slice(0, rows)) };
}

/**
 * A grid painted inside a box: every row cursor-addressed at (top + i, left),
 * nothing past `maxRows` x `maxCols`. For a logo the board draws into a door's
 * screen (Decision 29) - a door's frame is not cleared around it.
 *
 * `opaque`: every cell of the box is painted, blanks included - a restore
 * (AEW_SCREEN RESTORE) has to cover what was drawn over the region, and a
 * trimmed row would leave the overlay's tail standing.
 */
export function renderGridAt(grid: Cell[][], top: number, left: number, maxRows: number, maxCols: number, opts: { opaque?: boolean } = {}): string {
  const rows = opts.opaque ? maxRows : gridSize(grid).rows;
  let out = '';
  for (let y = 0; y < Math.min(rows, maxRows); y++) {
    out += `\x1b[${top + y};${left}H`;
    const row = opts.opaque
      ? Array.from({ length: maxCols }, (_, x) => cellAt(grid, y, x))
      : trimRow(grid[y]).slice(0, maxCols);
    out += gridToAnsi([row]);
  }
  return out + '\x1b[0m';
}

/**
 * Every LATER frame: only the cells that changed, as cursor-addressed runs.
 *
 * The walk itself is the SDK's shared run differ
 * (`sdk/common/run-diff.ts` `renderRunDiff`, the same one
 * `sdk/petscii/frame/frame-render.ts` `renderDiff` drives for the C64 door
 * adapter, and the same walk as blessed's own screen diff
 * `Screen.prototype.draw`): find a run of changed cells, address its start
 * with CUP, re-state the attributes at the head of the run so the run is
 * self-contained, print the glyphs, move on.
 *
 * This function is the part that is NOT shared: this cell model. A cell here
 * carries its complete SGR state as a parameter string, so `sgr` is just
 * `cell.ansi` and two cells are the same when their string and character
 * are; the C64 renderer's cells carry VIC-II palette indices, never emit a
 * background, and skip the bottom-right cell for the KERNAL's scroll. The
 * grid is ragged and unbounded in width, so the walk's extent comes from
 * both grids and `cellAt` supplies a blank past a row's end. The leading
 * clear (there is none here) and the trailing reset stay with the caller:
 * a step that changed nothing sends nothing at all.
 *
 * (This was `renderDiff` copied line for line onto a second cell model. The
 * duplication was Round 3 item 1 of
 * `.superpowers/sdd/2026-09-03-screen-wipes/progress.md`; Round 4 of that
 * ledger closes it and records where the shared walk went and why.)
 *
 * Why it matters: a full repaint per frame is 2.5-10 KB, and the terminal
 * paces what it receives (packages/terminal/src/utils/modem-emulator.ts caps
 * even "MAX" at 230400 bps = 23 KB/s), so a 14-frame `~WN` took 5 s of wire
 * to play a 650 ms animation. A delta is a few hundred bytes.
 */
function renderGridDelta(previous: Cell[][], next: Cell[][]): string {
  const out = renderRunDiff<Cell>({
    cols: Math.max(gridWidth(previous), gridWidth(next)),
    rows: Math.max(previous.length, next.length),
    cell: (x, y) => cellAt(next, y, x),
    changed: (x, y) => !sameCell(cellAt(previous, y, x), cellAt(next, y, x)),
    sgr: (cell) => cell.ansi,
    glyph: (cell) => cell.char,
  });

  return out === '' ? '' : out + RESET;
}

/**
 * The animation's grids as frames: one full paint, then deltas.
 *
 * Only the first frame clears. Every later frame overwrites the cells it
 * changes and touches nothing else, so there is no moment where the screen
 * is blank.
 *
 * A `\x1b[2J` per frame produced exactly that moment. The mechanism is
 * LATENCY, not reordering: the board's terminal queues what it receives and
 * drains it at up to 23 KB/s (packages/terminal/src/utils/modem-emulator.ts;
 * `processQueue` is a strict FIFO and `sendThrottled` finishes a text token
 * before the next escape, so a cursor sequence can never overtake queued
 * text). A 2.5-10 KB repaint therefore takes 110-430 ms to arrive while the
 * frame wants 40, the clear that opens the NEXT frame lands late and in its
 * own paint - and between that clear and the repaint behind it the terminal
 * has a blank screen to show.
 */
function framesFromGrids(animation: WipeGrids): WipeFrame[] {
  const frames: WipeFrame[] = [];
  let previous: Cell[][] | null = null;

  for (const grid of animation.grids) {
    if (previous === null) {
      frames.push({ content: CLEAR_HOME + renderGridFull(grid), delay: animation.delay });
      previous = grid;
      continue;
    }

    const delta = renderGridDelta(previous, grid);
    previous = grid;
    // A step that changes nothing has nothing to send. Keeping it would put
    // an empty payload on the wire and hold the animation for a tick that
    // shows exactly what the tick before it showed.
    if (delta === '') continue;

    frames.push({ content: delta, delay: animation.delay });
  }

  return frames;
}

/**
 * The screen as the wipes model it: parse to the grid and paint it back.
 *
 * Exported so the grid model can be held to the screens it actually has to
 * survive (`tests/utils/screen-wipe-fidelity.test.ts` renders this and the
 * original side by side). Not part of the animation path.
 */
export function renderScreenGrid(content: string, columns: number = DEFAULT_GRID_COLUMNS): string {
  return gridToAnsi(parseAnsiToGrid(content, columns));
}

/**
 * ~WM - Matrix Rain Wipe
 * Characters scramble and cascade down like Matrix code
 */
function matrixRainWipe(content: string, columns: number): WipeGrids {
  const grid = parseAnsiToGrid(content, columns);
  const grids: Cell[][][] = [];
  const height = grid.length;

  // Green Matrix style colors
  // Complete states, not bare colours: `gridToAnsi`/`renderGridDelta` emit a
  // cell's `ansi` only when it CHANGES, and a frame resets once at its end,
  // so a bare `\x1b[92m` after a bold-on-blue cell paints bright green rain
  // on the screen's own background. Same shape `attributesToAnsi` produces.
  const matrixColors = ['\x1b[0;32m', '\x1b[0;92m', '\x1b[0;32m']; // Green shades

  // Create scrambled version
  const scrambled = grid.map(row =>
    row.map(() => ({
      char: MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)],
      ansi: matrixColors[Math.floor(Math.random() * matrixColors.length)]
    }))
  );

  // Animate cascade down (10 waves)
  for (let wave = 0; wave <= 10; wave++) {
    const frame = scrambled.map((row, y) =>
      row.map((cell: Cell, x) => {
        const progress = wave / 10;
        const rowProgress = height === 0 ? 0 : y / height;

        if (progress >= rowProgress) {
          // Reveal actual content
          return grid[y][x] || BLANK;
        }
        // Still scrambled. Only a quarter of the rain re-rolls per wave: the
        // cascade is the effect, the shimmer is texture, and re-rolling every
        // cell every frame made each frame a full repaint (2.9 KB) that the
        // terminal cannot paint inside the frame's own 50 ms.
        if (Math.random() < 0.25) {
          const rolled: Cell = {
            char: MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)],
            ansi: matrixColors[Math.floor(Math.random() * matrixColors.length)]
          };
          scrambled[y][x] = rolled;
          return rolled;
        }
        return cell;
      })
    );

    grids.push(frame);
  }

  return { grids, delay: 50 };
}

/**
 * Blinds reveal order: every even strip first, then every odd one.
 *
 * The order is explicit (and the phase count is derived from it) because the
 * arithmetic version of this could not finish: `~WH`'s reveal test asked for
 * `phase >= height/stripHeight + stripIndex` while the loop only ran to
 * `stripHeight * 2`, so on a 20-row screen NO odd strip was ever revealed -
 * the animation ended with 45% of the screen (62% for `~WV`) still blank.
 */
function blindsWipe(
  content: string,
  axis: 'row' | 'col',
  stripSize: number,
  delay: number,
  columns: number,
): WipeGrids {
  const grid = parseAnsiToGrid(content, columns);
  const grids: Cell[][][] = [];
  const extent = axis === 'row' ? grid.length : gridWidth(grid);
  const stripCount = Math.max(1, Math.ceil(extent / stripSize));

  const order: number[] = [];
  for (let strip = 0; strip < stripCount; strip += 2) order.push(strip);
  for (let strip = 1; strip < stripCount; strip += 2) order.push(strip);

  // One strip per phase, capped so a wide screen does not turn into a
  // 33-frame (1.6 s) animation.
  const phases = Math.max(1, Math.min(stripCount, 16));

  for (let phase = 0; phase <= phases; phase++) {
    const revealed = new Set(order.slice(0, Math.round((order.length * phase) / phases)));

    const frame = grid.map((row, y) =>
      row.map((cell, x) => (revealed.has(Math.floor((axis === 'row' ? y : x) / stripSize)) ? cell : BLANK))
    );

    grids.push(frame);
  }

  return { grids, delay };
}

/**
 * ~WH - Horizontal Blinds Wipe
 * Reveals screen in horizontal strips
 */
function horizontalBlindsWipe(content: string, columns: number): WipeGrids {
  return blindsWipe(content, 'row', 3, 40, columns);
}

/**
 * ~WV - Vertical Blinds Wipe
 * Reveals screen in vertical strips
 */
function verticalBlindsWipe(content: string, columns: number): WipeGrids {
  return blindsWipe(content, 'col', 5, 40, columns);
}

/**
 * ~WS - Spiral Wipe
 * Spirals from outside edges to center
 *
 * A ring walk, one pass, O(cells). The previous version pushed the whole
 * rectangle in its "top row" pass (a nested y-loop), then re-scanned the
 * accumulated list with `Array.some` on every later cell: 0.5-1.4 s of
 * blocking CPU per screen, a reveal that ran left-to-right rather than in a
 * spiral, and a list so full of duplicates that the last 16 of 21 frames
 * were identical.
 */
function spiralWipe(content: string, columns: number): WipeGrids {
  const grid = parseAnsiToGrid(content, columns);
  const grids: Cell[][][] = [];
  const height = grid.length;
  const maxWidth = gridWidth(grid);

  const spiral: Array<[number, number]> = [];
  const push = (y: number, x: number): void => {
    if (grid[y] && grid[y][x]) spiral.push([y, x]);
  };

  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = maxWidth - 1;

  while (top <= bottom && left <= right) {
    for (let x = left; x <= right; x++) push(top, x);
    top++;

    for (let y = top; y <= bottom; y++) push(y, right);
    right--;

    if (top <= bottom) {
      for (let x = right; x >= left; x--) push(bottom, x);
      bottom--;
    }

    if (left <= right) {
      for (let y = bottom; y >= top; y--) push(y, left);
      left++;
    }
  }

  // Animate spiral reveal (20 frames)
  const chunkSize = Math.ceil(spiral.length / 20);
  for (let i = 0; i <= 20; i++) {
    const revealed = new Set(spiral.slice(0, i * chunkSize).map(([y, x]) => `${y},${x}`));

    const frame = grid.map((row, y) =>
      row.map((cell, x) => (revealed.has(`${y},${x}`) ? cell : BLANK))
    );

    grids.push(frame);
  }

  return { grids, delay: 30 };
}

/**
 * ~WC - Checkerboard Wipe
 * Reveals in alternating squares like a checkerboard
 */
function checkerboardWipe(content: string, columns: number): WipeGrids {
  const grid = parseAnsiToGrid(content, columns);
  const grids: Cell[][][] = [];
  const squareSize = 4;

  // Phase 1: Reveal "white" squares (even rows + even cols, odd rows + odd cols)
  // Phase 2: Reveal "black" squares (even rows + odd cols, odd rows + even cols)
  for (let phase = 0; phase <= 1; phase++) {
    const frame = grid.map((row, y) =>
      row.map((cell, x) => {
        const rowSquare = Math.floor(y / squareSize);
        const colSquare = Math.floor(x / squareSize);
        const isWhiteSquare = (rowSquare % 2 === colSquare % 2);

        const shouldReveal = (phase === 0 && isWhiteSquare) || (phase === 1);
        return shouldReveal ? cell : { char: '·', ansi: '\x1b[0;90m' }; // Dark-grey middle dot, ISO-8859-1 (complete state)
      })
    );

    grids.push(frame);
  }

  return { grids, delay: 100 };
}

/**
 * ~WR - Radial/Radar Wipe
 * Sweeps around like a radar from top center
 *
 * The pivot is the TOP centre, so `atan2` can only ever produce normalised
 * angles between 90 and 270 degrees - sweeping 0..360 (as this did) spent 11
 * of its 25 frames showing exactly what the previous frame showed. The sweep
 * now covers the half plane the geometry actually reaches.
 */
function radialWipe(content: string, columns: number): WipeGrids {
  const grid = parseAnsiToGrid(content, columns);
  const grids: Cell[][][] = [];
  const maxWidth = gridWidth(grid);
  const centerX = maxWidth / 2;
  const centerY = 0; // Top center
  const steps = 24;

  for (let step = 0; step <= steps; step++) {
    const angle = 90 + (180 * step) / steps;

    const frame = grid.map((row, y) =>
      row.map((cell, x) => {
        // Calculate angle from center to this point
        const dx = x - centerX;
        const dy = y - centerY;
        const pointAngle = Math.atan2(dy, dx) * (180 / Math.PI);
        const normalizedAngle = (pointAngle + 90 + 360) % 360; // 0 = top, clockwise

        const shouldReveal = normalizedAngle <= angle;
        return shouldReveal ? cell : BLANK;
      })
    );

    grids.push(frame);
  }

  return { grids, delay: 25 };
}

/**
 * ~WB - Block Wipe
 * Random blocks appear until screen is complete
 */
function blockWipe(content: string, columns: number): WipeGrids {
  const grid = parseAnsiToGrid(content, columns);
  const grids: Cell[][][] = [];
  const height = grid.length;
  const maxWidth = gridWidth(grid);
  const blockSize = 3;

  // Create list of all block positions
  const blocks: Array<[number, number]> = [];
  for (let y = 0; y < height; y += blockSize) {
    for (let x = 0; x < maxWidth; x += blockSize) {
      blocks.push([y, x]);
    }
  }

  // Shuffle blocks
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  }

  // Reveal blocks in 15 frames
  const blocksPerFrame = Math.ceil(blocks.length / 15);
  for (let frame = 0; frame <= 15; frame++) {
    const revealedBlocks = new Set(
      blocks.slice(0, frame * blocksPerFrame).map(([y, x]) => `${Math.floor(y / blockSize)},${Math.floor(x / blockSize)}`)
    );

    const frameGrid = grid.map((row, y) =>
      row.map((cell, x) => {
        const blockKey = `${Math.floor(y / blockSize)},${Math.floor(x / blockSize)}`;
        return revealedBlocks.has(blockKey) ? cell : BLANK;
      })
    );

    grids.push(frameGrid);
  }

  return { grids, delay: 40 };
}

/**
 * ~WN - Noise Fade
 * Static/noise that resolves to actual content
 *
 * Each cell draws its noise glyph and its resolve threshold ONCE. Re-rolling
 * every cell on every frame (what this did) changes every cell every frame,
 * which is a full 8.7 KB repaint 14 times over - 5.3 s of wire for a 650 ms
 * animation once the terminal's own pacing is counted, and the one wipe that
 * a delta could not make cheap. Fixed noise dissolves at the same rate and
 * costs one cell's worth of bytes per cell, once.
 */
function noiseFadeWipe(content: string, columns: number): WipeGrids {
  const grid = parseAnsiToGrid(content, columns);
  const grids: Cell[][][] = [];

  const noise = grid.map(row =>
    row.map(() => ({
      threshold: Math.random(),
      cell: {
        char: NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)],
        ansi: Math.random() < 0.5 ? '\x1b[0;37m' : '\x1b[0;90m', // White or gray (complete state)
      } as Cell,
    }))
  );

  // 12 frames of noise fading to content
  for (let phase = 0; phase <= 12; phase++) {
    const noiseLevel = 1 - (phase / 12); // 100% noise -> 0% noise

    const frame = grid.map((row, y) =>
      row.map((cell, x) => (noise[y][x].threshold < noiseLevel ? noise[y][x].cell : cell))
    );

    grids.push(frame);
  }

  return { grids, delay: 50 };
}

/**
 * ~WT - Typewriter Wipe
 * Types out line by line with slight delay
 *
 * The full grid is always the last frame: stepping two rows at a time never
 * lands on an odd row count, and a screen with an odd number of rows used to
 * end with its last row missing (a one-row screen ended blank).
 */
function typewriterWipe(content: string, columns: number): WipeGrids {
  const grid = parseAnsiToGrid(content, columns);
  const grids: Cell[][][] = [];
  const height = grid.length;

  for (let line = 0; line <= height; line += 2) {
    grids.push(grid.slice(0, Math.min(line, height)));
  }

  if (height % 2 === 1) {
    // Stepping two rows at a time never lands on an odd row count, and the
    // animation used to END one row short (a one-row screen ended blank).
    grids.push(grid);
  }

  return { grids, delay: 30 };
}

/**
 * ~WE - Explode Wipe
 * Characters explode from center outward
 */
function explodeWipe(content: string, columns: number): WipeGrids {
  const grid = parseAnsiToGrid(content, columns);
  const grids: Cell[][][] = [];
  const height = grid.length;
  const maxWidth = gridWidth(grid);
  const centerX = maxWidth / 2;
  const centerY = height / 2;
  // The distance to the furthest CORNER, so the last frame reaches every cell
  // instead of relying on a float comparison landing exactly on equality.
  const maxDistance = Math.max(
    Math.hypot(centerX, centerY),
    Math.hypot(maxWidth - centerX, centerY),
    Math.hypot(centerX, height - centerY),
    Math.hypot(maxWidth - centerX, height - centerY)
  );

  // Reveal from center outward in 15 frames
  for (let radius = 0; radius <= 15; radius++) {
    const currentRadius = (radius / 15) * maxDistance;

    const frame = grid.map((row, y) =>
      row.map((cell, x) => {
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const shouldReveal = distance <= currentRadius;
        return shouldReveal ? cell : BLANK;
      })
    );

    grids.push(frame);
  }

  return { grids, delay: 40 };
}

/**
 * The shared shape of the ten step wipes (~WW ~WD ~WI ~WO ~WL ~WU ~WZ ~WF ~WY
 * ~WK): every cell gets the animation step it appears on (`stepOf`, clamped to
 * 1..N), frame 0 is the blank screen, frame f shows the cells whose step is
 * <= f, and frame N shows the whole grid. A cell never hides once shown, so
 * the reveal is monotonic by construction. Hidden cells are BLANK, as in
 * every other wipe.
 */
function stepWipe(
  content: string,
  columns: number,
  delay: number,
  stepOf: (y: number, x: number, height: number, width: number) => number,
): WipeGrids {
  const grid = parseAnsiToGrid(content, columns);
  const height = grid.length;
  const width = gridWidth(grid);
  const steps = grid.map((row, y) => row.map((_cell, x) => Math.max(1, Math.round(stepOf(y, x, height, width)))));
  const last = steps.reduce((m, row) => row.reduce((a, s) => Math.max(a, s), m), 0);
  const grids: Cell[][][] = [];
  for (let f = 0; f <= last; f++) {
    grids.push(grid.map((row, y) => row.map((cell, x) => (steps[y][x] <= f ? cell : BLANK))));
  }
  return { grids, delay };
}

/** Where a value in [0, max] falls among `count` evenly spaced steps (1..count). */
function scaled(value: number, max: number, count: number): number {
  return max <= 0 ? 1 : 1 + (value / max) * (count - 1);
}

/** ~WW - Sweep: columns revealed left to right in bands. */
function sweepWipe(content: string, columns: number): WipeGrids {
  return stepWipe(content, columns, 30, (_y, x, _h, w) => 1 + Math.floor(x / Math.max(1, Math.ceil(w / 20))));
}

/** ~WD - Diagonal: anti-diagonals from the top-left to the bottom-right (a row is two columns tall). */
function diagonalWipe(content: string, columns: number): WipeGrids {
  return stepWipe(content, columns, 30, (y, x, h, w) => scaled(x / 2 + y, w / 2 + h, 20));
}

/** ~WI - Iris: a diamond (Manhattan distance, 2:1 cells) opens from the centre. */
function irisWipe(content: string, columns: number): WipeGrids {
  return stepWipe(content, columns, 35, (y, x, h, w) =>
    scaled(Math.abs(x - w / 2) + 2 * Math.abs(y - h / 2), w / 2 + h, 16));
}

/** ~WO - Curtain: two halves open from the centre column outward. */
function curtainWipe(content: string, columns: number): WipeGrids {
  return stepWipe(content, columns, 35, (_y, x, _h, w) => scaled(Math.abs(x - w / 2), w / 2, 16));
}

/** ~WL - Interlace: the even rows top-down, then the odd rows top-down. */
function interlaceWipe(content: string, columns: number): WipeGrids {
  return stepWipe(content, columns, 30, (y, _x, h) => {
    const evenRows = Math.ceil(h / 2);
    return y % 2 === 0 ? 1 + y / 2 : evenRows + 1 + (y - 1) / 2;
  });
}

/** ~WU - Melt: each column drops in from the top after its own random delay. */
function meltWipe(content: string, columns: number): WipeGrids {
  const lag: number[] = [];
  return stepWipe(content, columns, 35, (y, x) => {
    if (lag[x] === undefined) lag[x] = Math.floor(Math.random() * 9);
    return 1 + lag[x] + Math.floor(y / 2);
  });
}

/** ~WZ - Zoom: a rectangle opens outward from the centre (Chebyshev distance, 2:1 cells). */
function zoomWipe(content: string, columns: number): WipeGrids {
  return stepWipe(content, columns, 35, (y, x, h, w) =>
    scaled(Math.max(Math.abs(x - w / 2), 2 * Math.abs(y - h / 2)), Math.max(w / 2, h), 16));
}

/** ~WF - Dissolve: cells appear in random order across 10 batches. */
function dissolveWipe(content: string, columns: number): WipeGrids {
  return stepWipe(content, columns, 60, () => 1 + Math.floor(Math.random() * 10));
}

/** ~WY - Wave: a front sweeps left to right, its edge a sine curve over the rows. */
function waveWipe(content: string, columns: number): WipeGrids {
  const amplitude = 6;
  return stepWipe(content, columns, 30, (y, x, _h, w) =>
    scaled(Math.max(0, x - amplitude * Math.sin(y * 0.5) + amplitude), w + 2 * amplitude, 20));
}

/** ~WK - Snake: bands of three rows, each swept across in thirds, alternating direction. */
function snakeWipe(content: string, columns: number): WipeGrids {
  return stepWipe(content, columns, 30, (y, x, _h, w) => {
    const band = Math.floor(y / 3);
    const along = band % 2 === 0 ? x : w - 1 - x;
    return 1 + band * 3 + Math.min(2, Math.floor((along * 3) / Math.max(1, w)));
  });
}

/**
 * The grids of one wipe. ONE switch for both directions: the reveal plays
 * them forwards (`getWipeFrames`), the conceal backwards (`getWipeOutFrames`).
 * `null` for a code that is not a wipe.
 */
function wipeGrids(wipeType: WipeType, content: string, columns: number): WipeGrids | null {
  // Handle random selection
  if (wipeType === 'random') {
    const types = [...new Set(Object.values(WIPE_CODES))].filter((t) => t !== 'random');
    wipeType = types[Math.floor(Math.random() * types.length)];
  }

  switch (wipeType) {
    case 'matrix':
      return matrixRainWipe(content, columns);
    case 'hblinds':
      return horizontalBlindsWipe(content, columns);
    case 'vblinds':
      return verticalBlindsWipe(content, columns);
    case 'spiral':
      return spiralWipe(content, columns);
    case 'checker':
      return checkerboardWipe(content, columns);
    case 'radial':
      return radialWipe(content, columns);
    case 'blocks':
      return blockWipe(content, columns);
    case 'noise':
      return noiseFadeWipe(content, columns);
    case 'typewriter':
      return typewriterWipe(content, columns);
    case 'explode':
      return explodeWipe(content, columns);
    case 'sweep':
      return sweepWipe(content, columns);
    case 'diagonal':
      return diagonalWipe(content, columns);
    case 'iris':
      return irisWipe(content, columns);
    case 'curtain':
      return curtainWipe(content, columns);
    case 'interlace':
      return interlaceWipe(content, columns);
    case 'melt':
      return meltWipe(content, columns);
    case 'zoom':
      return zoomWipe(content, columns);
    case 'dissolve':
      return dissolveWipe(content, columns);
    case 'wave':
      return waveWipe(content, columns);
    case 'snake':
      return snakeWipe(content, columns);
    default:
      return null;
  }
}

/**
 * Get wipe animation frames
 *
 * The frame model: frame 0 clears and paints every cell; every later frame
 * is a DELTA - cursor-addressed runs of the cells that changed since the
 * frame before it (`renderGridDelta`). Nothing after frame 0 clears the
 * screen, which is what made the animation flicker: a `\x1b[2J` per frame
 * blanks the terminal between paints.
 *
 * Every wipe reveals the whole screen on its own last animation frame, and
 * ONE more frame is appended: the caller's own content, homed. The grid is a
 * model of a terminal - good enough to animate a reveal, never a guarantee
 * of byte fidelity for arbitrary ANSI - so the screen the caller is left
 * looking at is the screen itself, not a model of it, and the cursor ends
 * exactly where the direct-display path leaves it (which is what the pause
 * prompt, screen.handler.ts:2559, prints from).
 */
export function getWipeFrames(
  wipeType: WipeType,
  content: string,
  columns: number = DEFAULT_GRID_COLUMNS,
): WipeFrame[] {
  const animation = wipeGrids(wipeType, content, columns);
  if (!animation) return [];

  const frames = framesFromGrids(animation);

  if (frames.length > 0) {
    // The animation ends on the caller's own bytes, homed over the fully
    // revealed frame that precedes it - so the screen the caller is left
    // looking at is the screen itself, and the cursor lands where the pause
    // prompt (screen.handler.ts:2559) expects to print from.
    //
    // NOT byte-identical to the direct-display path: a clear the screen
    // OPENS with is dropped (`withoutLeadingClear`), because re-clearing a
    // screen the animation has just painted is the last flicker of the wipe.
    // That is only safe while every cell the animation painted is a cell
    // this content repaints - `animationStaysInsideFinalGrid` - otherwise
    // the clear stays and a screen whose animation reached further than its
    // own content cannot leave residue behind.
    //
    // delay 0: the play loop does not wait after the last frame.
    const finalPaint = animationStaysInsideFinalGrid(animation.grids)
      ? withoutLeadingClear(content)
      : content;
    frames.push({ content: HOME + finalPaint, delay: 0 });
  }

  return frames;
}

/** The rows a region wipe repaints: 1-based `top`, `rows` tall; `forward` = new rows enter from the right. */
export interface WipeRegion {
  top: number;
  rows: number;
  forward: boolean;
}

const REGION_SLIDE_STEPS = 4;
const REGION_SLIDE_DELAY_MS = 40;

/**
 * The push wipe (`P`): the new rows push the old ones out sideways, both
 * crossing the full width in REGION_SLIDE_STEPS frames, the last one the
 * target rows exactly. Forward, the new rows enter from the right and the old
 * ones leave to the left; backward, the other way round.
 *
 * Each frame row is a window over one strip: old+new forward, new+old
 * backward, the window moving by the full width either way. `old` is what
 * the region showed before (the board's model of the caller's screen); rows
 * it does not cover are blank.
 *
 * Separate from getWipeFrames because it has a different frame model:
 * framesFromGrids opens with CLEAR_HOME and repaints the whole screen, which
 * a push must never do. Every row is cursor-addressed (CUP) and no row
 * outside the region is ever written. Like renderGridAt the frame ends on a
 * reset (SGR 0); the cursor is left at the end of the last row written.
 */
export function getRegionSlideFrames(
  content: string,
  columns: number,
  region: WipeRegion,
  old: Cell[][] = [],
): WipeFrame[] {
  const grid = parseAnsiToGrid(content, columns);
  const fit = (row: Cell[] | undefined): Cell[] => {
    const out = (row ?? []).slice(0, columns);
    while (out.length < columns) out.push(BLANK);
    return out;
  };
  const strips: Cell[][] = [];
  for (let y = 0; y < region.rows; y++) {
    const before = fit(old[y]);
    const after = fit(grid[region.top - 1 + y]);
    strips.push(region.forward ? [...before, ...after] : [...after, ...before]);
  }
  const frames: WipeFrame[] = [];
  for (let step = 1; step <= REGION_SLIDE_STEPS; step++) {
    const moved = Math.round((columns * step) / REGION_SLIDE_STEPS);
    const offset = region.forward ? moved : columns - moved;
    let out = '';
    for (let y = 0; y < region.rows; y++) {
      out += `\x1b[${region.top + y};1H` + gridToAnsi([strips[y].slice(offset, offset + columns)]);
    }
    frames.push({ content: out, delay: step === REGION_SLIDE_STEPS ? 0 : REGION_SLIDE_DELAY_MS });
  }
  return frames;
}

/**
 * The reveal played backwards: the screen goes away in the wipe's own
 * pattern and the caller is left on a blank one (Decision 27, "leaving to a
 * command"). Built from the SAME grids as the reveal, reversed, so every wipe
 * code has a conceal without a second set of builders.
 */
export function getWipeOutFrames(wipeType: WipeType, content: string, columns: number = DEFAULT_GRID_COLUMNS): WipeFrame[] {
  const animation = wipeGrids(wipeType, content, columns);
  if (!animation) return [];
  const frames = framesFromGrids({ ...animation, grids: [...animation.grids].reverse() });
  if (frames.length === 0) return [];
  // The reveal ends on one extra frame (the content itself); the conceal's
  // extra frame is the blank screen it leaves the caller on.
  frames.push({ content: '\x1b[0m\x1b[2J\x1b[H', delay: 0 });
  return frames;
}

/**
 * `content` without a clear-screen it opens with.
 *
 * A conference menu starts with `~f`, which the MCI parser expands to
 * `\x1b[2J\x1b[H` - so the final frame, which is the screen's own bytes,
 * would clear a screen the animation has just finished painting and repaint
 * it. On a terminal that paces its input (the board's own does: escapes go
 * out immediately, text at up to 23 KB/s) that is a full-screen blank
 * followed by a slow repaint - the last flicker of the wipe.
 *
 * Dropping it is safe precisely because the frame underneath is already the
 * same screen: the animation's last frame is the grid render of this
 * content, cell for cell, blanks included. Only a LEADING run is dropped; a
 * clear anywhere else in the screen is content and is emitted as-is.
 */
function withoutLeadingClear(content: string): string {
  // The leading run may mix SGR with the clear (`\x1b[0m\x1b[2J`, and DOS
  // art's `\x1b[44m\x1b[2J` fill-with-background idiom). Match the whole
  // run, drop only the erase/home from it, and KEEP the SGR: the colour
  // state the screen sets before painting is content, the clear is not.
  const leading = /^(?:\x1b\[[0-9;]*m|\x1b\[[23]J|\x1b\[(?:1;1)?H)+/.exec(content);
  if (!leading) return content;
  const kept = leading[0].replace(/\x1b\[[23]J|\x1b\[(?:1;1)?H/g, '');
  return kept + content.slice(leading[0].length);
}

/**
 * Did the animation paint only cells the final content repaints?
 *
 * Every frame is built from the same parse of `content`, so its last grid is
 * what the content itself paints; if no earlier grid is taller or wider than
 * that, dropping the content's own leading clear can leave nothing behind.
 * A builder that ever painted outside the finished screen would fail this
 * and keep the clear - it is the invariant that makes the strip safe, not a
 * property of today's ten builders.
 */
function animationStaysInsideFinalGrid(grids: Cell[][][]): boolean {
  const last = grids[grids.length - 1];
  if (!last) return false;

  for (const grid of grids) {
    if (grid.length > last.length) return false;
    for (let y = 0; y < grid.length; y++) {
      if (grid[y].length > (last[y]?.length ?? 0)) return false;
    }
  }

  return true;
}

const WIPE_LETTERS = Object.keys(WIPE_CODES).join('');

/**
 * Parse wipe MCI code from content
 * Returns wipe type and content with MCI code removed
 */
export function parseWipeMCI(content: string): { wipeType: WipeType | null; content: string } {
  const match = content.match(new RegExp(`~W([${WIPE_LETTERS}])`, 'i'));

  if (!match) {
    return { wipeType: null, content };
  }

  const wipeType = WIPE_CODES[match[1].toUpperCase()] || null;
  // Strip the wipe code plus its trailing newline (the code occupies its own line).
  // Without stripping the \n, contentForMci would start with a blank line, causing
  // the allowMCI check to see an empty first line and disable all MCI substitution.
  const cleanedContent = content.replace(new RegExp(`~W[${WIPE_LETTERS}]\\r?\\n?`, 'i'), '');

  return { wipeType, content: cleanedContent };
}

/**
 * Whether this session's screens may play a wipe animation at all.
 *
 * A wipe used to be an 80-column effect by construction: `getWipeFrames`
 * composed the screen onto an 80-column grid whatever the caller's width, so
 * on a C64's 40 columns the animation smeared the very screen the 40-column
 * work had just fitted - and the board's own menu carries `~WX`. The answer
 * then was the effects-off principle: on a C64 the effect does not run and the
 * screen paints directly.
 *
 * IT RUNS NOW, at the caller's own width (sysop, 2026-09-07: "try to fix the
 * wipes for petscii 40 cols as well"). The grid is built at the width the
 * caller reads at, so a 40-column screen is revealed 40 columns wide, and the
 * frames go out as ordinary `ansi-output` - which for a PETSCII caller is
 * exactly what every other screen goes out as, and reaches the same
 * transducer.
 *
 * The one session that still gets no wipe is a `.seq` screen: those are raw
 * PETSCII bytes with no ANSI to model, and the renderer never asks for one
 * (handlers/petscii-screen.render.ts).
 */
export function wipeEffectsEnabled(session: { petsciiMode?: boolean; texttvMode?: boolean } | null | undefined): boolean {
  // Teletext has no wipe animations (and a wipe frame would smear a
  // double-height page on the TDAText face): strip like the PETSCII era
  // did, showing the screen itself.
  if (session?.texttvMode === true) return false;
  return true;
}
