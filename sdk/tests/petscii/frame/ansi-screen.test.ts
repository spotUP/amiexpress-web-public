import { FrameReconstructor } from '../../../petscii/frame/ansi-screen';
import { Frame } from '../../../petscii/frame/types';

const text = (f: Frame, y: number) => f.cells[y].map((c) => c.ch).join('').replace(/ +$/, '');
const at = (f: Frame, x: number, y: number) => f.cells[y][x];
function run(...chunks: string[]) {
  const r = new FrameReconstructor();
  for (const c of chunks) r.write(c);
  return { r, f: r.snapshot() };
}

describe('FrameReconstructor geometry', () => {
  it('is 80x25 by default, blank, cursor home, white on blue', () => {
    const { f } = run('');
    expect([f.cols, f.rows]).toEqual([80, 25]);
    expect(f.cells.length).toBe(25);
    expect(f.cells.every((row) => row.length === 80)).toBe(true);
    expect(f.cursor).toEqual({ x: 0, y: 0 });
    expect(at(f, 0, 0)).toEqual({ ch: ' ', fg: 1, bg: 6, bold: false, rvs: false });
  });

  it('takes a configurable size', () => {
    const r = new FrameReconstructor({ cols: 40, rows: 25 });
    r.write('x'.repeat(41));
    const f = r.snapshot();
    expect(text(f, 0)).toBe('x'.repeat(40));
    expect(text(f, 1)).toBe('x');
  });
});

describe('FrameReconstructor text and line control', () => {
  it('prints text and advances the cursor', () => {
    const { f } = run('Hello');
    expect(text(f, 0)).toBe('Hello');
    expect(f.cursor).toEqual({ x: 5, y: 0 });
  });

  it('CRLF, lone LF and lone CR: LF is column 0 of the next row (Amiga CON: and the transducer agree), CR overwrites in place', () => {
    expect(text(run('a\r\nb').f, 1)).toBe('b');
    expect(text(run('a\nb').f, 1)).toBe('b');
    const { f } = run('abc\rX');
    expect(text(f, 0)).toBe('Xbc');
    expect(f.cursor).toEqual({ x: 1, y: 0 });
  });

  it('backspace moves left without erasing; tab goes to the next 8-column stop and stops at column 79', () => {
    const { f } = run('ab\bX');
    expect(text(f, 0)).toBe('aX');
    expect(run('abc\tZ').f.cursor).toEqual({ x: 9, y: 0 });
    const { f: g } = run('\x1b[78G\t\tQ');
    expect(at(g, 79, 0).ch).toBe('Q');
  });

  it('ignores other control bytes and DEL', () => {
    const { f } = run('a\x07\x00\x7fb');
    expect(text(f, 0)).toBe('ab');
  });
});

describe('FrameReconstructor deferred wrap (xterm semantics, not the KERNAL)', () => {
  it('printing into column 79 holds the cursor there; the NEXT printable lands at column 0 of the row below', () => {
    const { r } = run('a'.repeat(80));
    expect(r.cursor).toEqual({ x: 79, y: 0 });
    r.write('b');
    const f = r.snapshot();
    expect(at(f, 0, 1).ch).toBe('b');
    expect(f.cursor).toEqual({ x: 1, y: 1 });
  });

  it('a newline while the wrap is pending does not eat a blank row (80-wide lines)', () => {
    const { f } = run('a'.repeat(80) + '\r\n' + 'X');
    expect(at(f, 0, 1).ch).toBe('X');
    expect(text(f, 2)).toBe('');
  });

  it('a 100-character line wraps onto the next row', () => {
    const { f } = run('c'.repeat(100));
    expect(text(f, 0)).toBe('c'.repeat(80));
    expect(text(f, 1)).toBe('c'.repeat(20));
    expect(f.cursor).toEqual({ x: 20, y: 1 });
  });

  it('any cursor movement settles the pending wrap', () => {
    const { r } = run('a'.repeat(80));
    r.write('\x1b[DZ');
    const f = r.snapshot();
    expect(at(f, 78, 0).ch).toBe('Z');
    expect(at(f, 0, 1).ch).toBe(' ');
  });
});

describe('FrameReconstructor scrolling', () => {
  it('scrolls when a newline leaves the bottom row; the top row is lost', () => {
    const lines = Array.from({ length: 26 }, (_, i) => `L${i}`);
    const { f } = run(lines.join('\r\n'));
    expect(text(f, 0)).toBe('L1');
    expect(text(f, 23)).toBe('L24');
    expect(text(f, 24)).toBe('L25');
    expect(f.cursor).toEqual({ x: 3, y: 24 });
  });

  it('a wrap on the bottom row scrolls too', () => {
    const { f } = run('\x1b[25;1H' + 'w'.repeat(81));
    expect(text(f, 23)).toBe('w'.repeat(80));
    expect(text(f, 24)).toBe('w');
  });
});

describe('FrameReconstructor cursor addressing', () => {
  it('CUP / HVP are 1-based and clamp to the grid', () => {
    expect(run('\x1b[5;10H').f.cursor).toEqual({ x: 9, y: 4 });
    expect(run('\x1b[5;10f').f.cursor).toEqual({ x: 9, y: 4 });
    expect(run('\x1b[100;200H').f.cursor).toEqual({ x: 79, y: 24 });
    expect(run('\x1b[H').f.cursor).toEqual({ x: 0, y: 0 });
    expect(run('\x1b[;5H').f.cursor).toEqual({ x: 4, y: 0 });
  });

  it('CUU/CUD/CUF/CUB default to 1 and clamp; CHA and VPA set one axis', () => {
    expect(run('\x1b[10;10H\x1b[3A').f.cursor).toEqual({ x: 9, y: 6 });
    expect(run('\x1b[A').f.cursor).toEqual({ x: 0, y: 0 });
    expect(run('\x1b[30B').f.cursor).toEqual({ x: 0, y: 24 });
    expect(run('\x1b[5C').f.cursor).toEqual({ x: 5, y: 0 });
    expect(run('\x1b[200C').f.cursor).toEqual({ x: 79, y: 0 });
    expect(run('\x1b[5C\x1b[2D').f.cursor).toEqual({ x: 3, y: 0 });
    expect(run('\x1b[12G').f.cursor).toEqual({ x: 11, y: 0 });
    expect(run('\x1b[7d').f.cursor).toEqual({ x: 0, y: 6 });
  });

  it('CNL / CPL move to column 0 of another row', () => {
    expect(run('abc\x1b[2E').f.cursor).toEqual({ x: 0, y: 2 });
    expect(run('\x1b[5;5H\x1b[F').f.cursor).toEqual({ x: 0, y: 3 });
  });

  it('holds a partial escape across writes', () => {
    const { f } = run('\x1b[', '5;5HX');
    expect(at(f, 4, 4).ch).toBe('X');
  });
});

describe('FrameReconstructor snapshots', () => {
  it('snapshot is an immutable copy: later writes do not change it', () => {
    const r = new FrameReconstructor();
    r.write('one');
    const first = r.snapshot();
    r.write('\rtwo');
    expect(text(first, 0)).toBe('one');
    expect(text(r.snapshot(), 0)).toBe('two');
  });

  it('dirtyRows reports rows touched since the last snapshot; a scroll dirties every row', () => {
    const r = new FrameReconstructor();
    r.write('\x1b[4;1Hx');
    expect(r.dirtyRows()).toEqual([3]);
    r.snapshot();
    expect(r.dirtyRows()).toEqual([]);
    r.write('\x1b[25;1H\n');
    expect(r.dirtyRows().length).toBe(25);
  });

  it('reset returns to the power-on frame', () => {
    const r = new FrameReconstructor();
    r.write('\x1b[3;3Hzz');
    r.reset();
    expect(text(r.snapshot(), 2)).toBe('');
    expect(r.cursor).toEqual({ x: 0, y: 0 });
  });
});
