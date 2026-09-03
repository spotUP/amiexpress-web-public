/**
 * Screen Wipe Animation Utility
 *
 * Provides 10 different screen wipe animations for BBS screen transitions.
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
 * ~WX - Random (picks one of the above)
 *
 * A wipe is a sequence of {content, delay} frames. The FIRST frame clears
 * and paints the whole screen; every frame after it carries only the cells
 * that changed (cursor-addressed runs), and the last frame is the caller's
 * own content homed over the finished animation.
 */

import { renderRunDiff } from '@amiexpress/bbs-door-sdk/common/run-diff';

export type WipeType =
  | 'matrix'     // ~WM
  | 'hblinds'    // ~WH
  | 'vblinds'    // ~WV
  | 'spiral'     // ~WS
  | 'checker'    // ~WC
  | 'radial'     // ~WR
  | 'blocks'     // ~WB
  | 'noise'      // ~WN
  | 'typewriter' // ~WT
  | 'explode'    // ~WE
  | 'random';    // ~WX

export interface WipeFrame {
  content: string;
  delay: number; // milliseconds
}

const MATRIX_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
const NOISE_CHARS = '░▒▓█▄▌▐▀■□▪▫';

/** Every animation frame repaints the whole screen from the top-left. */
const CLEAR_HOME = '\x1b[2J\x1b[H';

/** The final frame paints over the last animation frame instead of clearing it. */
const HOME = '\x1b[H';

/** SGR with no attributes set. */
const RESET = '\x1b[0m';

/** A cell nothing has painted: a space in the terminal's default attributes. */
const BLANK: Cell = Object.freeze({ char: ' ', ansi: RESET });

/** The screens this board serves are 80 columns; a longer row wraps, as it does on the wire. */
const GRID_COLUMNS = 80;

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
function parseAnsiToGrid(content: string): Cell[][] {
  const rows: Cell[][] = [[]];
  const attrs = defaultAttributes();
  let ansi = RESET;
  let row = 0;
  let col = 0;
  let saved = { row: 0, col: 0 };

  const ensureRow = (y: number): void => {
    while (rows.length <= y) rows.push([]);
  };
  const padTo = (r: Cell[], x: number): void => {
    while (r.length <= x) r.push(BLANK);
  };
  const moveTo = (y: number, x: number): void => {
    row = Math.max(0, Math.min(y, MAX_GRID_ROWS));
    col = Math.max(0, Math.min(x, GRID_COLUMNS - 1));
    ensureRow(row);
  };

  let i = 0;
  while (i < content.length) {
    const ch = content[i];

    if (ch === '\x1b') {
      if (content[i + 1] === '[') {
        let j = i + 2;
        while (j < content.length && !isCsiFinalByte(content[j])) j++;
        if (j >= content.length) break; // truncated sequence: nothing left to paint
        const params = content.substring(i + 2, j);
        const final = content[j];
        i = j + 1;

        if (final === 'm') {
          applySgr(params, attrs);
          ansi = attributesToAnsi(attrs);
          continue;
        }

        // Positional and erase controls. Anything else (mode set/reset,
        // device queries, scroll regions) is not part of the grid model.
        const numeric = params.replace(/[^0-9;]/g, '');
        const args = numeric.split(';').map(p => (p === '' ? NaN : parseInt(p, 10)));
        const arg = (idx: number, dflt: number): number =>
          (args[idx] === undefined || Number.isNaN(args[idx]) ? dflt : args[idx]);
        const positional = !/[?<>=]/.test(params);

        if (!positional) continue;

        switch (final) {
          case 'A': moveTo(row - arg(0, 1), col); break;
          case 'B': moveTo(row + arg(0, 1), col); break;
          case 'C': moveTo(row, col + arg(0, 1)); break;
          case 'D': moveTo(row, col - arg(0, 1)); break;
          case 'E': moveTo(row + arg(0, 1), 0); break;
          case 'F': moveTo(row - arg(0, 1), 0); break;
          case 'G': moveTo(row, arg(0, 1) - 1); break;
          case 'H':
          case 'f': moveTo(arg(0, 1) - 1, arg(1, 1) - 1); break;
          case 'J': {
            const mode = arg(0, 0);
            if (mode === 0) {
              ensureRow(row);
              rows[row] = rows[row].slice(0, col);
              rows.length = row + 1;
            } else if (mode === 1) {
              ensureRow(row);
              padTo(rows[row], col);
              for (let x = 0; x <= col; x++) rows[row][x] = BLANK;
              for (let y = 0; y < row; y++) rows[y] = [];
            } else {
              for (let y = 0; y < rows.length; y++) rows[y] = [];
            }
            break;
          }
          case 'K': {
            const mode = arg(0, 0);
            ensureRow(row);
            if (mode === 0) {
              rows[row] = rows[row].slice(0, col);
            } else if (mode === 1) {
              padTo(rows[row], col);
              for (let x = 0; x <= col; x++) rows[row][x] = BLANK;
            } else {
              rows[row] = [];
            }
            break;
          }
          case 's': saved = { row, col }; break;
          case 'u': moveTo(saved.row, saved.col); break;
          default: break;
        }
        continue;
      }

      // Non-CSI escape (ESC 7, ESC (B, ...). Consume it so the ESC byte
      // never lands in the grid as a printable glyph.
      const next = content[i + 1];
      i += next !== undefined && '()#%'.includes(next) ? 3 : 2;
      continue;
    }

    if (ch === '\r') { col = 0; i++; continue; }
    if (ch === '\n') { moveTo(row + 1, 0); i++; continue; }
    if (ch === '\t') { moveTo(row, Math.min(GRID_COLUMNS - 1, (Math.floor(col / 8) + 1) * 8)); i++; continue; }
    if (ch === '\b') { col = Math.max(0, col - 1); i++; continue; }
    if (ch === '\x07' || ch === '\x00') { i++; continue; }

    if (col >= GRID_COLUMNS) {
      // Wrap exactly where the terminal wraps.
      if (row >= MAX_GRID_ROWS) { i++; continue; }
      row++;
      col = 0;
      ensureRow(row);
    }
    ensureRow(row);
    padTo(rows[row], col);
    rows[row][col] = { char: ch, ansi };
    col++;
    i++;
  }

  // Trailing untouched cells carry no information; dropping them keeps the
  // frames the size they were before this model existed.
  return rows.map(trimRow);
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
export function renderScreenGrid(content: string): string {
  return gridToAnsi(parseAnsiToGrid(content));
}

/**
 * ~WM - Matrix Rain Wipe
 * Characters scramble and cascade down like Matrix code
 */
function matrixRainWipe(content: string): WipeGrids {
  const grid = parseAnsiToGrid(content);
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
  delay: number
): WipeGrids {
  const grid = parseAnsiToGrid(content);
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
function horizontalBlindsWipe(content: string): WipeGrids {
  return blindsWipe(content, 'row', 3, 40);
}

/**
 * ~WV - Vertical Blinds Wipe
 * Reveals screen in vertical strips
 */
function verticalBlindsWipe(content: string): WipeGrids {
  return blindsWipe(content, 'col', 5, 40);
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
function spiralWipe(content: string): WipeGrids {
  const grid = parseAnsiToGrid(content);
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
function checkerboardWipe(content: string): WipeGrids {
  const grid = parseAnsiToGrid(content);
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
        return shouldReveal ? cell : { char: '░', ansi: '\x1b[0;90m' }; // Gray block (complete state)
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
function radialWipe(content: string): WipeGrids {
  const grid = parseAnsiToGrid(content);
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
function blockWipe(content: string): WipeGrids {
  const grid = parseAnsiToGrid(content);
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
function noiseFadeWipe(content: string): WipeGrids {
  const grid = parseAnsiToGrid(content);
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
function typewriterWipe(content: string): WipeGrids {
  const grid = parseAnsiToGrid(content);
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
function explodeWipe(content: string): WipeGrids {
  const grid = parseAnsiToGrid(content);
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
export function getWipeFrames(wipeType: WipeType, content: string): WipeFrame[] {
  // Handle random selection
  if (wipeType === 'random') {
    const types: WipeType[] = [
      'matrix', 'hblinds', 'vblinds', 'spiral', 'checker',
      'radial', 'blocks', 'noise', 'typewriter', 'explode'
    ];
    wipeType = types[Math.floor(Math.random() * types.length)];
  }

  let animation: WipeGrids;

  switch (wipeType) {
    case 'matrix':
      animation = matrixRainWipe(content);
      break;
    case 'hblinds':
      animation = horizontalBlindsWipe(content);
      break;
    case 'vblinds':
      animation = verticalBlindsWipe(content);
      break;
    case 'spiral':
      animation = spiralWipe(content);
      break;
    case 'checker':
      animation = checkerboardWipe(content);
      break;
    case 'radial':
      animation = radialWipe(content);
      break;
    case 'blocks':
      animation = blockWipe(content);
      break;
    case 'noise':
      animation = noiseFadeWipe(content);
      break;
    case 'typewriter':
      animation = typewriterWipe(content);
      break;
    case 'explode':
      animation = explodeWipe(content);
      break;
    default:
      return [];
  }

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

/**
 * Parse wipe MCI code from content
 * Returns wipe type and content with MCI code removed
 */
export function parseWipeMCI(content: string): { wipeType: WipeType | null; content: string } {
  const wipeRegex = /~W([MHVSCRBNTEX])/i;
  const match = content.match(wipeRegex);

  if (!match) {
    return { wipeType: null, content };
  }

  const code = match[1].toUpperCase();
  const wipeMap: Record<string, WipeType> = {
    'M': 'matrix',
    'H': 'hblinds',
    'V': 'vblinds',
    'S': 'spiral',
    'C': 'checker',
    'R': 'radial',
    'B': 'blocks',
    'N': 'noise',
    'T': 'typewriter',
    'E': 'explode',
    'X': 'random'
  };

  const wipeType = wipeMap[code] || null;
  // Strip the wipe code plus its trailing newline (the code occupies its own line).
  // Without stripping the \n, contentForMci would start with a blank line, causing
  // the allowMCI check to see an empty first line and disable all MCI substitution.
  const cleanedContent = content.replace(/~W[MHVSCRBNTEX]\r?\n?/i, '');

  return { wipeType, content: cleanedContent };
}

/**
 * Whether this session's screens may play a wipe animation at all
 * (C64/40-col plan, Task 8).
 *
 * A wipe is an 80-column effect by construction: `getWipeFrames` composes
 * the screen into a grid, reveals it cell by cell, and emits each frame
 * straight at the socket with its own clear-and-home. Those frames never
 * pass the session reflow choke (`wrapForSession`) and never pass Task 7's
 * menu reflow, so on a 40-column canvas the animation smeared the very
 * screen the rest of this plan had just fitted - the board's own menu
 * carries `~WX`.
 *
 * The answer is the effects-off principle Task 3/6 applied to the doors'
 * glitch, typewriter and masthead animations at the XXS tier: on a C64 the
 * effect does not run, and the screen paints directly. Nothing is re-sized
 * or half-played. `petsciiMode === true` is the single source of truth for
 * "is this a C64 caller" (the same gate `wrapForSession` and
 * `sessionColumns` use), so an ANSI caller - at any width, including a
 * narrow browser window - keeps every wipe it has today, byte for byte.
 */
export function wipeEffectsEnabled(session: { petsciiMode?: boolean } | null | undefined): boolean {
  return session?.petsciiMode !== true;
}
