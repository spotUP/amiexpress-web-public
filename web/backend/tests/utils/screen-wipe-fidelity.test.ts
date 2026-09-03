/**
 * Screen wipe fidelity - the board's three real wipe screens.
 *
 * The sysop's first report was "most of the wipe anims are buggy". Measured
 * against the plain (no-wipe) render of the same content, before that fix:
 * `~WH` left 598/551/637 cells wrong (odd strips were never revealed),
 * `~WV` 903/647/756, `~WT` dropped the last row of an odd-height screen,
 * `~WS` froze for 16 of 21 frames and took 0.5-1.4 s to build, `~WR` froze
 * for 11 of 25, and every wipe lost the `\x1b[nC` indents and the
 * accumulated SGR state of the source screen.
 *
 * The second report was "the anims dont look buggy now but they flicker a
 * lot". Every frame opened with `\x1b[2J` and repainted the whole screen -
 * 2.5-10 KB a frame, which the terminal then paces (its own modem emulator
 * caps even "MAX" at 230400 bps = 23 KB/s), so the clear and the repaint
 * landed in different paints and the screen blanked between frames. Frames
 * are now one full paint followed by deltas.
 *
 * These tests drive the public entry point (`getWipeFrames`) with the real
 * screen bytes, replay every frame into a 25-row terminal model exactly as
 * the play loop emits them, and compare the viewport with the same content
 * rendered without a wipe.
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
//
// 80x25 with a real viewport: writing past the last row SCROLLS, as xterm
// does (BBSTerminal.tsx:804 creates the terminal with rows: 25). Without the
// viewport, "nothing paints outside 80x25" and "the final frame equals the
// plain render" were claims about an unbounded row array - true of no screen
// the board actually serves. The discrimination test at the bottom of this
// file proves the viewport bites.
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
  readonly viewportRows = 25;
  rows: TermCell[][] = [];
  row = 0;
  col = 0;
  scrolled = 0;
  private attrs: TermCell = { ...BLANK_CELL };
  private saved = { row: 0, col: 0 };
  maxRow = -1;
  maxCol = -1;

  constructor() {
    for (let y = 0; y < this.viewportRows; y++) this.rows.push([]);
  }

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
      if (ch === '\n') { this.lineFeed(); i++; continue; }
      this.put(ch);
      i++;
    }
  }

  cell(y: number, x: number): TermCell {
    return this.rows[y]?.[x] ?? BLANK_CELL;
  }

  /** Every attribute the model tracks, blanks NOT collapsed. */
  strictKey(y: number, x: number): string {
    const c = this.cell(y, x);
    return `${c.ch}|${c.fg}|${c.bg}|${c.bold ? 'B' : '-'}`;
  }

  key(y: number, x: number): string {
    const c = this.cell(y, x);
    // An untouched cell and a painted space are the same thing on screen.
    if (c.ch === ' ' && !c.bg) return ' ';
    return `${c.ch}|${c.fg}|${c.bg}|${c.bold ? 'B' : '-'}`;
  }

  /** The viewport, trailing blanks trimmed per row. */
  text(): string[] {
    return this.rows.map(r => (r ?? []).map(c => c.ch).join('').replace(/\s+$/, ''));
  }

  private lineFeed(): void {
    if (this.row >= this.viewportRows - 1) {
      this.rows.shift();
      this.rows.push([]);
      this.scrolled++;
      this.row = this.viewportRows - 1;
      return;
    }
    this.row++;
  }

  private put(ch: string): void {
    if (this.col >= this.columns) { this.col = 0; this.lineFeed(); }
    const row = this.rows[this.row];
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
    const clampRow = (y: number): number => Math.max(0, Math.min(y, this.viewportRows - 1));
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
          this.rows[this.row].length = Math.min(this.rows[this.row].length, this.col);
          for (let y = this.row + 1; y < this.viewportRows; y++) this.rows[y] = [];
        } else if (mode === 1) {
          const row = this.rows[this.row];
          for (let x = 0; x <= this.col && x < row.length; x++) row[x] = { ...BLANK_CELL };
          for (let y = 0; y < this.row; y++) this.rows[y] = [];
        } else {
          this.rows = [];
          for (let y = 0; y < this.viewportRows; y++) this.rows.push([]);
          this.maxRow = -1;
          this.maxCol = -1;
        }
        break;
      }
      case 'K': {
        const mode = arg(0, 0);
        const row = this.rows[this.row];
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

/**
 * Replay frames the way the play loop emits them (screen.handler.ts:2484):
 * one write each, in order, into ONE terminal. Frames are deltas, so a frame
 * only means anything on top of the frames before it.
 */
function play(frames: Array<{ content: string }>, upTo = frames.length): TestTerminal {
  const term = new TestTerminal();
  for (let i = 0; i < upTo; i++) term.write(frames[i].content);
  return term;
}

function cellDiff(a: TestTerminal, b: TestTerminal): string[] {
  const out: string[] = [];
  for (let y = 0; y < a.viewportRows; y++) {
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
        const played = play(getWipeFrames(wipe, parsed));
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
        const played = play(getWipeFrames(wipe, parsed));
        expect(`${file}/${wipe} ${played.row},${played.col}`).toBe(`${file}/${wipe} ${plain.row},${plain.col}`);
      }
    }
  });

  it('the final frame carries no wait: the play loop never sleeps after it', () => {
    for (const wipe of WIPES) {
      const frames = getWipeFrames(wipe, parsedScreens.get('Conf1/Menu.txt')!);
      expect(`${wipe}: ${frames[frames.length - 1].delay}`).toBe(`${wipe}: 0`);
    }
  });
});

describe('wipe frames do not flicker', () => {
  it('no wipe frame clears the screen after the first', () => {
    for (const file of REAL_SCREENS) {
      const parsed = parsedScreens.get(file)!;
      for (const wipe of WIPES) {
        const frames = getWipeFrames(wipe, parsed);
        expect(`${file}/${wipe} first clears: ${frames[0].content.startsWith('\x1b[2J\x1b[H')}`)
          .toBe(`${file}/${wipe} first clears: true`);
        const laterClears = frames.slice(1).filter(f => /\x1b\[[23]J/.test(f.content)).length;
        expect(`${file}/${wipe} later clears: ${laterClears}`).toBe(`${file}/${wipe} later clears: 0`);
      }
    }
  });

  it('the first frame paints every cell of the screen it will animate', () => {
    // Nothing may be left over from whatever was on the terminal before: the
    // first frame clears and then writes every cell of the rectangle the
    // animation lives in, so no later frame ever needs to clear.
    for (const file of REAL_SCREENS) {
      const parsed = parsedScreens.get(file)!;
      const whole = play(getWipeFrames('blocks', parsed));

      const first = play(getWipeFrames('blocks', parsed), 1);
      let painted = 0;
      let expected = 0;
      for (let y = 0; y < first.viewportRows; y++) {
        for (let x = 0; x < 80; x++) {
          if (whole.cell(y, x).ch !== ' ' || first.cell(y, x).ch !== ' ') expected++;
          if (first.rows[y][x] !== undefined) painted++;
        }
      }
      expect(`${file}: painted >= content cells: ${painted >= expected}`)
        .toBe(`${file}: painted >= content cells: true`);
    }
  });

  it('a wipe frame after the first carries only the cells that changed', () => {
    // A full repaint per frame is 2.5-10 KB; at the terminal's own pacing
    // (230400 bps even on MAX, packages/terminal/src/utils/modem-emulator.ts)
    // that is 110-430 ms of wire for a frame the animation wants to show for
    // 40, so frames pile up and the screen blanks under them. A delta is a
    // few hundred bytes.
    const painted = (content: string): number => content.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length;
    const changed = (before: TestTerminal, after: TestTerminal): number => {
      let n = 0;
      for (let y = 0; y < before.viewportRows; y++) {
        for (let x = 0; x < 80; x++) if (before.strictKey(y, x) !== after.strictKey(y, x)) n++;
      }
      return n;
    };

    for (const file of REAL_SCREENS) {
      const parsed = parsedScreens.get(file)!;
      for (const wipe of WIPES) {
        const frames = getWipeFrames(wipe, parsed);
        let worstExcess = 0;
        for (let i = 1; i < frames.length - 1; i++) {
          worstExcess = Math.max(worstExcess, painted(frames[i].content) - changed(play(frames, i), play(frames, i + 1)));
        }
        // Slack of 8 cells: MENU250.TXT carries `\x1b[3m`, and a cell whose
        // only change is an attribute this model does not track (italic) is
        // repainted without counting as changed here. The pre-delta frames
        // overshot by ~1500 - the whole screen, every frame.
        expect(`${file}/${wipe} cells painted beyond changed: ${worstExcess <= 8}`)
          .toBe(`${file}/${wipe} cells painted beyond changed: true`);
      }
    }
  });

  it('the delta wipe ends on the same screen as a full repaint of every frame', () => {
    // The deltas are only a transport for the same grids: replaying them must
    // land on the grid the animation's last frame describes.
    for (const file of REAL_SCREENS) {
      const parsed = parsedScreens.get(file)!;
      for (const wipe of WIPES) {
        const frames = getWipeFrames(wipe, parsed);
        const delta = play(frames, frames.length - 1);      // animation only
        const plain = screenOf('\x1b[2J\x1b[H', parsed);
        expect(`${file}/${wipe}: ${cellDiff(plain, delta).length}`).toBe(`${file}/${wipe}: 0`);
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
        const frames = getWipeFrames(wipe, parsed);
        for (let i = 1; i <= frames.length; i++) {
          const term = play(frames, i);
          expect(`${file}/${wipe} rows=${term.maxRow <= plain.maxRow} cols=${term.maxCol <= plain.maxCol}`)
            .toBe(`${file}/${wipe} rows=true cols=true`);
        }
      }
    }
  });

  it('no wipe scrolls the 25-row viewport', () => {
    for (const file of REAL_SCREENS) {
      const parsed = parsedScreens.get(file)!;
      for (const wipe of WIPES) {
        expect(`${file}/${wipe} scrolled: ${play(getWipeFrames(wipe, parsed)).scrolled}`)
          .toBe(`${file}/${wipe} scrolled: 0`);
      }
    }
  });

  it('the viewport pin discriminates: a 26-row screen scrolls and is caught', () => {
    // Proof that the two claims above are made against a real 25-row
    // viewport and not an unbounded row array.
    const tall = Array.from({ length: 26 }, (_, i) => `row${i}`).join('\r\n');
    const term = play(getWipeFrames('blocks', tall));
    expect(term.scrolled).toBeGreaterThan(0);
    // ...and the top row is gone from the viewport, which is exactly what a
    // wipe on a screen taller than the terminal does to the board.
    expect(term.text()[0]).not.toBe('row0');
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
        const missing = cellDiff(plain, play(frames));
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
        let firstComplete = -1;
        for (let i = 1; i <= frames.length; i++) {
          if (cellDiff(plain, play(frames, i)).length === 0) { firstComplete = i - 1; break; }
        }
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
        const frames = animationFrames(wipe, parsed);
        let blank = 0;
        for (let i = 1; i <= frames.length; i++) {
          if (play(frames, i).text().join('').trim() === '') blank++;
        }
        expect(`${file}/${wipe} blank frames: ${blank <= 1}`).toBe(`${file}/${wipe} blank frames: true`);
      }
    }
  });

  it('horizontal and vertical blinds reveal every strip', () => {
    const block = Array.from({ length: 20 }, () => 'X'.repeat(80)).join('\r\n');
    const plain = screenOf('\x1b[2J\x1b[H', block);

    for (const wipe of ['hblinds', 'vblinds'] as WipeType[]) {
      const frames = getWipeFrames(wipe, block);
      const lastAnimation = play(frames, frames.length - 1);
      expect(`${wipe}: ${cellDiff(plain, lastAnimation).length}`).toBe(`${wipe}: 0`);
    }
  });

  it('the typewriter reveals the last row of a screen with an odd number of rows', () => {
    for (const rowCount of [1, 5, 21, 25]) {
      const content = Array.from({ length: rowCount }, (_, i) => `line${i}`).join('\r\n');
      const frames = getWipeFrames('typewriter', content);
      const lastAnimation = play(frames, Math.max(1, frames.length - 1));
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
  const playedScreen = (content: string): TestTerminal => play(getWipeFrames('blocks', content));

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
