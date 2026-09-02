import { renderDiff, renderFrame, cupTo } from '../../../petscii/frame/frame-render';
import { textToFrame, makeFrame, Frame, Cell } from '../../../petscii/frame/types';

const STRIP = /\x1b\[[0-9;]*[A-Za-z]/g;
const RED = '\x1b[38;2;129;51;56m'; // Colodore VIC 2

function withCell(f: Frame, x: number, y: number, patch: Partial<Cell>): Frame {
  const cells = f.cells.map((row) => row.map((c) => ({ ...c })));
  Object.assign(cells[y][x], patch);
  return makeFrame(f.cols, f.rows, cells, f.cursor);
}

describe('renderFrame (first paint)', () => {
  it('clears, homes, paints only non-blank cells, ends with SGR 0 and the cursor', () => {
    const f = makeFrame(40, 25, textToFrame(['hi', '', '  x'], 40, 25).cells, { x: 3, y: 2 });
    const out = renderFrame(f);
    expect(out.startsWith('\x1b[2J\x1b[H')).toBe(true);
    expect(out.replace(STRIP, '')).toBe('hi' + 'x');
    expect(out.endsWith('\x1b[0m' + cupTo({ x: 3, y: 2 }))).toBe(true);
    expect(out).toContain('\x1b[3;3H\x1b[27m\x1b[38;2;255;255;255mx');   // CUP, reverse off, Colodore white, the glyph
  });

  it('paints a reverse-video space (it is visible) and colours with truecolor from the VIC palette', () => {
    let f = textToFrame(['ab'], 40, 25);
    f = withCell(f, 0, 0, { fg: 2 });
    f = withCell(f, 5, 0, { rvs: true });
    const out = renderFrame(f);
    expect(out).toContain('\x1b[7m');
    expect(out).toContain(RED + 'a');
    expect(out.replace(STRIP, '')).toBe('ab ');
  });

  it('never paints the bottom-right cell', () => {
    const f = withCell(textToFrame([], 40, 25), 39, 24, { ch: 'Q' });
    expect(renderFrame(f).replace(STRIP, '')).toBe('');
  });

  it('refuses a frame that is not the target size', () => {
    expect(() => renderFrame(textToFrame(['x'], 80, 25))).toThrow(RangeError);
  });
});

describe('renderDiff', () => {
  it('an unchanged frame renders only the reset and the cursor', () => {
    const f = textToFrame(['same'], 40, 25);
    expect(renderDiff(f, f)).toBe('\x1b[0m' + cupTo({ x: 0, y: 0 }));
  });

  it('paints only changed cells, addressing each run once, and blanks cells that were erased', () => {
    const a = textToFrame(['hello world'], 40, 25);
    const b = textToFrame(['hello there'], 40, 25);
    const out = renderDiff(a, b);
    expect(out.replace(STRIP, '')).toBe('there');
    expect(out).toContain('\x1b[1;7H');
    const c = textToFrame(['hello'], 40, 25);
    expect(renderDiff(b, c).replace(STRIP, '')).toBe(' '.repeat(5));   // 't','h','e','r','e' -> blanks; the space at column 5 was already a space
  });

  it('a colour-only change is a change', () => {
    const a = textToFrame(['x'], 40, 25);
    const b = withCell(a, 0, 0, { fg: 2 });
    expect(renderDiff(a, b)).toContain(RED + 'x');
  });

  it('a size change falls back to a full paint', () => {
    const a = textToFrame(['x'], 40, 24);
    const b = textToFrame(['x'], 40, 25);
    expect(renderDiff(a, b).startsWith('\x1b[2J')).toBe(true);
  });

  it('cupTo is 1-based and clamps into 40x25', () => {
    expect(cupTo({ x: 0, y: 0 })).toBe('\x1b[1;1H');
    expect(cupTo({ x: 99, y: 99 })).toBe('\x1b[25;40H');
  });
});
