/**
 * The shared run differ itself (`sdk/common/run-diff.ts`), on a cell model
 * that belongs to neither caller: the walk is what is under test, not the
 * PETSCII frame renderer's VIC colours or the screen wipes' SGR strings.
 *
 * It lives under `tests/petscii/frame/` because that is the directory the
 * SDK's verification command sweeps (`npx jest tests/petscii ...`), and a
 * test outside the command that runs is decoration.
 *
 * The four properties every caller depends on:
 *   - a run never crosses a row boundary (a CUP per run, per row);
 *   - the attribute state is RE-STATED at the head of every run, because the
 *     cells between two runs were not sent and the terminal's state there is
 *     unknown;
 *   - a skipped cell is never painted, and it ends the run it falls in;
 *   - a cell whose colour changed but whose character did not is a change.
 */
import { renderRunDiff, RunDiffSpec } from '../../../common/run-diff';

/** A cell model of this test's own: one character, one opaque attribute string. */
interface TestCell {
  ch: string;
  attr: string;
}

const RED = '\x1b[31m';
const BLUE = '\x1b[34m';

/** Rows of "<attr><char>" cells from plain strings, all in one attribute. */
function grid(rows: readonly string[], attr = RED): TestCell[][] {
  return rows.map((row) => Array.from(row).map((ch) => ({ ch, attr })));
}

function spec(
  previous: TestCell[][],
  next: TestCell[][],
  skipCell?: (x: number, y: number) => boolean,
): RunDiffSpec<TestCell> {
  const cols = Math.max(...next.map((r) => r.length));
  return {
    cols,
    rows: next.length,
    cell: (x, y) => next[y][x],
    changed: (x, y) => {
      const a = previous[y]?.[x];
      const b = next[y][x];
      return a === undefined || a.ch !== b.ch || a.attr !== b.attr;
    },
    sgr: (cell) => cell.attr,
    glyph: (cell) => cell.ch,
    skipCell,
  };
}

/** Every `CSI <row>;<col> H` the walk emitted, as "row,col". */
function cups(out: string): string[] {
  return Array.from(out.matchAll(/\x1b\[(\d+);(\d+)H/g)).map((m) => `${m[1]},${m[2]}`);
}

describe('renderRunDiff', () => {
  it('sends nothing when nothing changed', () => {
    const g = grid(['ab', 'cd']);
    expect(renderRunDiff(spec(g, g))).toBe('');
  });

  it('splits runs at the end of a row: a change spanning two rows is two cursor-addressed runs', () => {
    const before = grid(['ab', 'cd']);
    const after = grid(['aX', 'Yd']);
    const out = renderRunDiff(spec(before, after));

    expect(cups(out)).toEqual(['1,2', '2,1']);
    expect(out).toBe(`\x1b[1;2H${RED}X\x1b[2;1H${RED}Y`);
  });

  it('breaks a run at an unchanged cell and addresses the next run on its own', () => {
    const before = grid(['abcde']);
    const after = grid(['XbYde']);
    const out = renderRunDiff(spec(before, after));

    expect(cups(out)).toEqual(['1,1', '1,3']);
    expect(out).toBe(`\x1b[1;1H${RED}X\x1b[1;3H${RED}Y`);
  });

  it('re-states the attributes at the head of every run, even when they did not change', () => {
    const before = grid(['abcde']);
    const after = grid(['XbYde']);
    const out = renderRunDiff(spec(before, after));

    // Two runs, both red: red goes out twice. The cells between them were
    // never sent, so the run cannot assume what the terminal is wearing.
    expect(out.split(RED).length - 1).toBe(2);
  });

  it('states the attributes once for a run that does not change them', () => {
    const before = grid(['abc']);
    const after = grid(['XYZ']);
    const out = renderRunDiff(spec(before, after));

    expect(out).toBe(`\x1b[1;1H${RED}XYZ`);
    expect(out.split(RED).length - 1).toBe(1);
  });

  it('restates the attributes inside a run when a cell changes them', () => {
    const before = grid(['abc']);
    const after: TestCell[][] = [[
      { ch: 'X', attr: RED },
      { ch: 'Y', attr: BLUE },
      { ch: 'Z', attr: BLUE },
    ]];
    const out = renderRunDiff(spec(before, after));

    expect(out).toBe(`\x1b[1;1H${RED}X${BLUE}YZ`);
  });

  it('paints a cell whose colour changed and whose character did not', () => {
    const before = grid(['ab'], RED);
    const after = grid(['ab'], BLUE);
    const out = renderRunDiff(spec(before, after));

    expect(out).toBe(`\x1b[1;1H${BLUE}ab`);
  });

  it('never paints a skipped cell, and ends the run it falls in', () => {
    const before = grid(['abcd']);
    const after = grid(['WXYZ']);
    // Skip column 1: the run stops before it and resumes after it.
    const out = renderRunDiff(spec(before, after, (x) => x === 1));

    expect(cups(out)).toEqual(['1,1', '1,3']);
    expect(out).toBe(`\x1b[1;1H${RED}W\x1b[1;3H${RED}YZ`);
    expect(out).not.toContain('X');
  });

  it('never paints a skipped cell that is the only changed cell', () => {
    const before = grid(['ab']);
    const after = grid(['aZ']);
    expect(renderRunDiff(spec(before, after, (x, y) => x === 1 && y === 0))).toBe('');
  });

  it('walks exactly cols x rows, so a caller can bound the grid it exposes', () => {
    const before = grid(['abc', 'def']);
    const after = grid(['XYZ', 'UVW']);
    const bounded: RunDiffSpec<TestCell> = { ...spec(before, after), cols: 2, rows: 1 };
    const out = renderRunDiff(bounded);

    expect(out).toBe(`\x1b[1;1H${RED}XY`);
  });
});
