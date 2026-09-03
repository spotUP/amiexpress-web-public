/**
 * Screen wipe fidelity - the board's three real wipe screens.
 *
 * The sysop's report was "most of the wipe anims are buggy". Measured against
 * the plain (no-wipe) render of the same content, before the fix:
 *
 *   ~WH  598/551/637 cells wrong at the end - odd strips were NEVER revealed
 *   ~WV  903/647/756 cells wrong at the end - same
 *   ~WT  a screen with an odd row count lost its last row
 *   ~WS  16 of 21 frames frozen, 0.5-1.4 s of blocking CPU to build
 *   ~WR  11 of 25 frames frozen
 *   all  Conf1/Menu.txt shifted left by its 14 `\x1b[nC` indents (183 cells),
 *        MENU250.TXT painted 9 cells in the wrong colour (SGR state was not
 *        accumulated: only the LAST escape sequence was kept per cell)
 *
 * These tests drive the public entry point (`getWipeFrames`) with the real
 * screen bytes, put every frame through a terminal model, and compare the
 * result with the same content rendered without a wipe.
 */
process.env.SKIP_DB_INIT = '1';

import * as path from 'path';
import { getWipeFrames, parseWipeMCI, renderScreenGrid, WipeType } from '../../src/utils/screen-wipe.util';
import { addAnsiEscapes } from '../../src/handlers/screen.handler';
import { readAmigaTextFileWithTransforms } from '../../src/utils/amiga-text-decode.util';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

const WIPES: WipeType[] = [
  'matrix', 'hblinds', 'vblinds', 'spiral', 'checker',
  'radial', 'blocks', 'noise', 'typewriter', 'explode',
];

// ---------------------------------------------------------------------------
// A terminal, independent of the grid model under test.
// ---------------------------------------------------------------------------

interface TermCell {
  ch: string;
  fg: string;
  bg: string;
  bold: boolean;
}

const BLANK_CELL: TermCell = { ch: ' ', fg: '', bg: '', bold: false };

class TestTerminal {
  readonly columns = 80;
  rows: TermCell[][] = [];
  row = 0;
  col = 0;
  private attrs: TermCell = { ...BLANK_CELL };
  private saved = { row: 0, col: 0 };
  maxRow = -1;
  maxCol = -1;

  write(text: string): void {
    let i = 0;
    while (i < text.length) {
      const ch = text[i];

      if (ch === '\x1b' && text[i + 1] === '[') {
        let j = i + 2;
        while (j < text.length && (text.charCodeAt(j) < 0x40 || text.charCodeAt(j) > 0x7e)) j++;
        if (j >= text.length) return;
        this.csi(text.substring(i + 2, j), text[j]);
        i = j + 1;
        continue;
      }
      if (ch === '\x1b') { i += 2; continue; }
      if (ch === '\r') { this.col = 0; i++; continue; }
      if (ch === '\n') { this.row++; i++; continue; }
      this.put(ch);
      i++;
    }
  }

  cell(y: number, x: number): TermCell {
    return this.rows[y]?.[x] ?? BLANK_CELL;
  }

  key(y: number, x: number): string {
    const c = this.cell(y, x);
    // An untouched cell and a painted space are the same thing on screen.
    if (c.ch === ' ' && !c.bg) return ' ';
    return `${c.ch}|${c.fg}|${c.bg}|${c.bold ? 'B' : '-'}`;
  }

  text(): string[] {
    return this.rows.map(r => (r ?? []).map(c => c.ch).join('').replace(/\s+$/, ''));
  }

  private ensure(y: number): TermCell[] {
    while (this.rows.length <= y) this.rows.push([]);
    return this.rows[y];
  }

  private put(ch: string): void {
    if (this.col >= this.columns) { this.col = 0; this.row++; }
    const row = this.ensure(this.row);
    while (row.length <= this.col) row.push({ ...BLANK_CELL });
    row[this.col] = { ...this.attrs, ch };
    if (this.row > this.maxRow) this.maxRow = this.row;
    if (this.col > this.maxCol) this.maxCol = this.col;
    this.col++;
  }

  private csi(params: string, final: string): void {
    if (final === 'm') { this.sgr(params); return; }
    if (/[?<>=]/.test(params)) return;
    const args = params.split(';').map(p => (p === '' ? NaN : parseInt(p, 10)));
    const arg = (i: number, dflt: number): number =>
      (args[i] === undefined || Number.isNaN(args[i]) ? dflt : args[i]);
    const clampRow = (y: number): number => Math.max(0, y);
    const clampCol = (x: number): number => Math.max(0, Math.min(x, this.columns - 1));

    switch (final) {
      case 'A': this.row = clampRow(this.row - arg(0, 1)); break;
      case 'B': this.row = clampRow(this.row + arg(0, 1)); break;
      case 'C': this.col = clampCol(this.col + arg(0, 1)); break;
      case 'D': this.col = clampCol(this.col - arg(0, 1)); break;
      case 'E': this.row = clampRow(this.row + arg(0, 1)); this.col = 0; break;
      case 'F': this.row = clampRow(this.row - arg(0, 1)); this.col = 0; break;
      case 'G': this.col = clampCol(arg(0, 1) - 1); break;
      case 'H':
      case 'f': this.row = clampRow(arg(0, 1) - 1); this.col = clampCol(arg(1, 1) - 1); break;
      case 'J': {
        const mode = arg(0, 0);
        if (mode === 0) {
          this.ensure(this.row).length = Math.min(this.ensure(this.row).length, this.col);
          this.rows.length = this.row + 1;
        } else if (mode === 1) {
          const row = this.ensure(this.row);
          for (let x = 0; x <= this.col && x < row.length; x++) row[x] = { ...BLANK_CELL };
          for (let y = 0; y < this.row; y++) this.rows[y] = [];
        } else {
          this.rows = [];
          this.maxRow = -1;
          this.maxCol = -1;
        }
        break;
      }
      case 'K': {
        const mode = arg(0, 0);
        const row = this.ensure(this.row);
        if (mode === 0) row.length = Math.min(row.length, this.col);
        else if (mode === 1) { for (let x = 0; x <= this.col && x < row.length; x++) row[x] = { ...BLANK_CELL }; }
        else this.rows[this.row] = [];
        break;
      }
      case 's': this.saved = { row: this.row, col: this.col }; break;
      case 'u': this.row = this.saved.row; this.col = this.saved.col; break;
      default: break;
    }
  }

  private sgr(params: string): void {
    const parts = params === '' ? ['0'] : params.split(';');
    for (let i = 0; i < parts.length; i++) {
      const code = parseInt(parts[i] === '' ? '0' : parts[i], 10);
      if (Number.isNaN(code)) continue;
      if (code === 0) { this.attrs = { ...BLANK_CELL }; }
      else if (code === 1) { this.attrs.bold = true; }
      else if (code === 22) { this.attrs.bold = false; }
      else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) { this.attrs.fg = String(code); }
      else if (code === 39) { this.attrs.fg = ''; }
      else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) { this.attrs.bg = String(code); }
      else if (code === 49) { this.attrs.bg = ''; }
      else if (code === 38 || code === 48) {
        const mode = parseInt(parts[i + 1] ?? '', 10);
        const consumed = mode === 5 ? 2 : mode === 2 ? 4 : 0;
        if (consumed === 0) continue;
        const value = parts.slice(i, i + consumed + 1).join(';');
        if (code === 38) this.attrs.fg = value; else this.attrs.bg = value;
        i += consumed;
      }
    }
  }
}

function screenOf(...chunks: string[]): TestTerminal {
  const term = new TestTerminal();
  for (const chunk of chunks) term.write(chunk);
  return term;
}

function cellDiff(a: TestTerminal, b: TestTerminal): string[] {
  const rows = Math.max(a.rows.length, b.rows.length);
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < 80; x++) {
      if (a.key(y, x) !== b.key(y, x)) out.push(`(${y},${x}) plain=${a.key(y, x)} wipe=${b.key(y, x)}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The real screens, through the pipeline that feeds getWipeFrames.
// ---------------------------------------------------------------------------

const REAL_SCREENS = ['Screens/MENU.TXT', 'Screens/MENU250.TXT', 'Conf1/Menu.txt'];

/**
 * What screen.handler hands `getWipeFrames`: the decoded file, wipe code
 * stripped, MCI expanded, bare ANSI re-escaped, line endings normalised.
 * `~f`/`~N` stand in for the MCI parser (which needs a session and a socket);
 * both are literally what it substitutes.
 */
function parsedScreen(file: string): string {
  const decoded = readAmigaTextFileWithTransforms(path.join(REPO_ROOT, file)).text;
  const stripped = parseWipeMCI(decoded).content;
  const expanded = stripped.replace(/~f\r?\n?/g, '\x1b[2J\x1b[H').replace(/~N/g, 'Sysop');
  return addAnsiEscapes(expanded).replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

const parsedScreens = new Map<string, string>();
beforeAll(() => {
  for (const file of REAL_SCREENS) parsedScreens.set(file, parsedScreen(file));
});

describe('screen wipes end on the screen itself', () => {
  it('the final frame equals the plain render for every wipe on every real screen', () => {
    for (const file of REAL_SCREENS) {
      const parsed = parsedScreens.get(file)!;
      const plain = screenOf('\x1b[2J\x1b[H', parsed);

      for (const wipe of WIPES) {
        const frames = getWipeFrames(wipe, parsed);
        const played = new TestTerminal();
        for (const frame of frames) played.write(frame.content);

        const diff = cellDiff(plain, played);
        expect(`${file}/${wipe}: ${diff.slice(0, 4).join(' ; ')}`).toBe(`${file}/${wipe}: `);
      }
    }
  });

  it('the cursor ends where the plain render leaves it so the pause prompt lands on the right row', () => {
    for (const file of REAL_SCREENS) {
      const parsed = parsedScreens.get(file)!;
      const plain = screenOf('\x1b[2J\x1b[H', parsed);

      for (const wipe of WIPES) {
        const played = new TestTerminal();
        for (const frame of getWipeFrames(wipe, parsed)) played.write(frame.content);
        expect(`${file}/${wipe} ${played.row},${played.col}`).toBe(`${file}/${wipe} ${plain.row},${plain.col}`);
      }
    }
  });
});

describe('wipe animation frames stay inside the screen', () => {
  it('no frame paints outside the extent the plain render itself paints', () => {
    for (const file of REAL_SCREENS) {
      const parsed = parsedScreens.get(file)!;
      const plain = screenOf('\x1b[2J\x1b[H', parsed);

      for (const wipe of WIPES) {
        for (const frame of getWipeFrames(wipe, parsed)) {
          const term = screenOf(frame.content);
          expect(`${file}/${wipe} rows=${term.maxRow <= plain.maxRow} cols=${term.maxCol <= plain.maxCol}`)
            .toBe(`${file}/${wipe} rows=true cols=true`);
        }
      }
    }
  });

  it('no frame of the board menu exceeds 80 columns or 25 rows', () => {
    // MENU.TXT's own rows are wider than 80 in the plain render too, so the
    // 80x25 claim is made against the screens that fit one.
    for (const file of ['Screens/MENU250.TXT', 'Conf1/Menu.txt']) {
      const parsed = parsedScreens.get(file)!;
      for (const wipe of WIPES) {
        for (const frame of getWipeFrames(wipe, parsed)) {
          const term = screenOf(frame.content);
          expect(`${file}/${wipe} ${term.maxRow + 1}x${term.maxCol + 1}`)
            .toBe(`${file}/${wipe} ${Math.min(term.maxRow + 1, 25)}x${Math.min(term.maxCol + 1, 80)}`);
        }
      }
    }
  });
});

describe('the animation itself reveals the whole screen', () => {
  /** Frames the user watches - the final authentic paint excluded. */
  const animationFrames = (wipe: WipeType, parsed: string) => {
    const frames = getWipeFrames(wipe, parsed);
    return frames.slice(0, frames.length - 1);
  };

  it('every cell is revealed by an animation frame, not only by the final paint', () => {
    for (const file of REAL_SCREENS) {
      const parsed = parsedScreens.get(file)!;
      const plain = screenOf('\x1b[2J\x1b[H', parsed);

      for (const wipe of WIPES) {
        const frames = animationFrames(wipe, parsed);
        const lastAnimation = screenOf(frames[frames.length - 1].content);
        const missing = cellDiff(plain, lastAnimation);
        expect(`${file}/${wipe}: ${missing.length} cells never revealed`)
          .toBe(`${file}/${wipe}: 0 cells never revealed`);
      }
    }
  });

  it('no wipe finishes its reveal early and then sits frozen', () => {
    // The defect: `~WS` completed after 5 of its 21 frames and showed the
    // finished screen for the remaining 16 (0.8 s frozen); `~WR` completed at
    // frame 18 of 25. A wipe may reach the complete screen a frame early when
    // the screen's last rows are blank, so the bar is "in the last fifth".
    for (const file of REAL_SCREENS) {
      const parsed = parsedScreens.get(file)!;
      const plain = screenOf('\x1b[2J\x1b[H', parsed);

      for (const wipe of WIPES) {
        const frames = animationFrames(wipe, parsed);
        const firstComplete = frames.findIndex(f => cellDiff(plain, screenOf(f.content)).length === 0);
        const share = (firstComplete + 1) / frames.length;
        expect(`${file}/${wipe} completes late: ${firstComplete >= 0 && share >= 0.8}`)
          .toBe(`${file}/${wipe} completes late: true`);
      }
    }
  });

  it('no wipe opens with a run of frames that show nothing', () => {
    // `~WR` swept 0-90 degrees through a half plane its pivot cannot reach:
    // 6 of its 25 frames were a blank screen before anything appeared.
    for (const file of REAL_SCREENS) {
      const parsed = parsedScreens.get(file)!;
      for (const wipe of WIPES) {
        const blank = animationFrames(wipe, parsed)
          .filter(f => screenOf(f.content).text().join('').trim() === '').length;
        expect(`${file}/${wipe} blank frames: ${blank <= 1}`).toBe(`${file}/${wipe} blank frames: true`);
      }
    }
  });

  it('horizontal and vertical blinds reveal every strip', () => {
    const block = Array.from({ length: 20 }, () => 'X'.repeat(80)).join('\r\n');
    const plain = screenOf('\x1b[2J\x1b[H', block);

    for (const wipe of ['hblinds', 'vblinds'] as WipeType[]) {
      const frames = getWipeFrames(wipe, block);
      const lastAnimation = screenOf(frames[frames.length - 2].content);
      expect(`${wipe}: ${cellDiff(plain, lastAnimation).length}`).toBe(`${wipe}: 0`);
    }
  });

  it('the typewriter reveals the last row of a screen with an odd number of rows', () => {
    for (const rowCount of [1, 5, 21, 25]) {
      const content = Array.from({ length: rowCount }, (_, i) => `line${i}`).join('\r\n');
      const frames = getWipeFrames('typewriter', content);
      const lastAnimation = screenOf(frames[frames.length - 2]?.content ?? '');
      expect(`${rowCount}: ${lastAnimation.text()[rowCount - 1]}`).toBe(`${rowCount}: line${rowCount - 1}`);
    }
  });

  it('builds a full-screen wipe without blocking the event loop', () => {
    const full = Array.from({ length: 25 }, () => 'X'.repeat(79)).join('\r\n');
    for (const wipe of WIPES) {
      const started = Date.now();
      getWipeFrames(wipe, full);
      const elapsed = Date.now() - started;
      // `~WS` took 213 ms here (0.5-1.4 s outside jest) rescanning its own
      // coordinate list with Array.some inside four nested loops.
      expect(`${wipe} under 100ms: ${elapsed < 100}`).toBe(`${wipe} under 100ms: true`);
    }
  });
});

describe('a played wipe keeps what the terminal would show', () => {
  // The same constructs as the grid tests below, but driven end to end
  // through a played animation - these fail on the pre-fix builders too,
  // where `renderScreenGrid` did not exist yet.
  const playedScreen = (content: string): TestTerminal => {
    const term = new TestTerminal();
    for (const frame of getWipeFrames('blocks', content)) term.write(frame.content);
    return term;
  };

  it('a cursor-forward indent survives the wipe', () => {
    const content = 'AB\x1b[5CCD\r\nsecond';
    expect(cellDiff(screenOf('\x1b[2J\x1b[H', content), playedScreen(content))).toEqual([]);
  });

  it('a bold attribute set before a colour survives the wipe', () => {
    const content = '\x1b[1m\x1b[33mXY\r\nsecond';
    expect(cellDiff(screenOf('\x1b[2J\x1b[H', content), playedScreen(content))).toEqual([]);
  });

  it('a background-only SGR does not erase the foreground of a played wipe', () => {
    const content = '\x1b[31m\x1b[44mRR\r\nsecond';
    expect(cellDiff(screenOf('\x1b[2J\x1b[H', content), playedScreen(content))).toEqual([]);
  });
});

describe('the grid model keeps what the terminal would show', () => {
  const roundTrip = (content: string): string[] =>
    cellDiff(screenOf('\x1b[2J\x1b[H', content), screenOf('\x1b[2J\x1b[H', renderScreenGrid(content)));

  it('a cursor-forward indent is not collapsed', () => {
    expect(roundTrip('AB\x1b[5CCD\r\nsecond')).toEqual([]);
    // The board's own conference menu indents this way 14 times.
    expect(roundTrip(parsedScreen('Conf1/Menu.txt'))).toEqual([]);
  });

  it('an absolute cursor position is not collapsed', () => {
    expect(roundTrip('\x1b[3;10Hxy\r\nsecond')).toEqual([]);
  });

  it('a cursor-next-line break is not collapsed', () => {
    expect(roundTrip('AB\x1b[EC\r\nsecond')).toEqual([]);
  });

  it('an erase-in-line does not leave the erased text behind', () => {
    expect(roundTrip('ABCDEF\x1b[2K\r\nsecond')).toEqual([]);
  });

  it('a saved and restored cursor position is honoured', () => {
    expect(roundTrip('AB\x1b[sCD\x1b[uZ\r\nsecond')).toEqual([]);
  });

  it('a bold attribute set before a colour is not dropped', () => {
    expect(roundTrip('\x1b[1m\x1b[33mXY\r\nsecond')).toEqual([]);
  });

  it('a background-only SGR does not erase the foreground', () => {
    expect(roundTrip('\x1b[31m\x1b[44mRR\r\nsecond')).toEqual([]);
  });

  it('a 256-colour SGR does not eat the next glyph', () => {
    expect(roundTrip('\x1b[38;5;196mQQ\r\nsecond')).toEqual([]);
    expect(screenOf(renderScreenGrid('\x1b[38;5;196mQQ')).text()[0]).toBe('QQ');
  });

  it('a truecolor SGR does not eat the next glyph', () => {
    expect(roundTrip('\x1b[38;2;255;0;0mTT\r\nsecond')).toEqual([]);
    expect(screenOf(renderScreenGrid('\x1b[38;2;255;0;0mTT')).text()[0]).toBe('TT');
  });

  it('a cursor-hide sequence is not painted', () => {
    expect(roundTrip('\x1b[?25lHH\r\nsecond')).toEqual([]);
  });

  it('a non-CSI escape is not painted as a glyph', () => {
    expect(screenOf(renderScreenGrid('A\x1b7B')).text()[0]).toBe('AB');
  });

  it('CP437 block glyphs survive the grid', () => {
    expect(screenOf(renderScreenGrid('░▒▓·')).text()[0]).toBe('░▒▓·');
  });

  it('a row longer than 80 columns wraps where the terminal wraps it', () => {
    expect(roundTrip('X'.repeat(95) + '\r\nsecond')).toEqual([]);
  });

  it('the board\'s real screens survive the grid unchanged', () => {
    for (const file of REAL_SCREENS) {
      expect(`${file}: ${roundTrip(parsedScreen(file)).slice(0, 3).join(' ; ')}`).toBe(`${file}: `);
    }
  });
});
