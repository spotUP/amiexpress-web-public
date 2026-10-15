/**
 * The BLOCK HOOK - how a renderer outside this module gets to answer for a
 * whole record.
 *
 * A file record's description arrives as its CONTINUATION rows, and those rows
 * must be consumed by the record rather than adapted a second time on their
 * own. A C*Base list row DISCARDS them - and discarding is still consuming, so
 * one output row can replace four source rows. That asymmetry is the thing
 * this hook exists for and the thing a row-shaped hook could not express.
 *
 * The SDK never learns what a file record is: it asks, and it advances.
 */
import { adaptRows } from '../../../petscii/frame/adapt';
import { makeFrame, blankCell } from '../../../petscii/frame/types';
import type { Cell, Frame } from '../../../petscii/frame/types';

const row = (text: string): Cell[] =>
  Array.from({ length: 80 }, (_, i) => ({ ...blankCell(), ch: text[i] ?? ' ' }));

const frameOf = (lines: string[]): Frame =>
  makeFrame(80, lines.length, lines.map(row), { x: 0, y: 0 });

const textOf = (cells: ReadonlyArray<Readonly<Cell>>) => cells.map((c) => c.ch).join('').replace(/ +$/, '');

/** A stand-in record renderer: one row, consuming its continuation rows. */
const recordHook = (frame: Frame, y: number) => {
  const text = textOf(frame.cells[y]);
  if (!/^\S+\.LHA/.test(text)) return null;
  let consumed = 1;
  while (y + consumed < frame.rows && textOf(frame.cells[y + consumed]).startsWith('   ')) consumed++;
  return { rows: [row('RECORD: ' + text.split(/\s+/)[0])], consumed };
};

describe('a block hook answers before the ladder', () => {
  const src = frameOf([
    'OTL-DOOR.LHA P 40960 03-28-18 A door',
    '   a continuation row',
    '   another one',
    'a plain row the hook declines',
  ]);

  it('emits ONE row for a record and swallows its continuation rows', () => {
    const out = adaptRows(src, { cols: 40, blockRenderer: recordHook });
    expect(out.rows).toHaveLength(2);
    expect(textOf(out.rows[0].cells)).toBe('RECORD: OTL-DOOR.LHA');
    expect(textOf(out.rows[1].cells)).toBe('a plain row the hook declines');
  });

  it('marks what it produced, so a reader can tell it from the ladder', () => {
    const out = adaptRows(src, { cols: 40, blockRenderer: recordHook });
    expect(out.rows[0].rule).toBe('stack');
    expect(out.rows[1].rule).not.toBe('stack');
  });

  it('leaves every row to the ladder when the hook always declines', () => {
    const withHook = adaptRows(src, { cols: 40, blockRenderer: () => null });
    const without = adaptRows(src, { cols: 40 });
    expect(withHook.rows.map((r) => textOf(r.cells))).toEqual(without.rows.map((r) => textOf(r.cells)));
    expect(withHook.rows.map((r) => r.rule)).toEqual(without.rows.map((r) => r.rule));
  });
});

describe('an explicit pin outranks the hook', () => {
  it('because a pin is a deliberate override and the hook is a default', () => {
    const src = frameOf(['OTL-DOOR.LHA P 40960 03-28-18 A door']);
    const out = adaptRows(src, {
      cols: 40,
      regions: [{ rows: [0, 0], rule: 'crop' }],
      blockRenderer: recordHook,
    });
    expect(out.rows[0].rule).toBe('crop');
    expect(textOf(out.rows[0].cells)).toContain('OTL-DOOR.LHA');
  });

  it("but 'auto' is not a pin - it is the caller saying you decide", () => {
    const src = frameOf(['OTL-DOOR.LHA P 40960 03-28-18 A door']);
    const out = adaptRows(src, {
      cols: 40,
      regions: [{ rows: [0, 0], rule: 'auto' }],
      blockRenderer: recordHook,
    });
    expect(out.rows[0].rule).toBe('stack');
  });
});

describe('the cursor of a consumed block', () => {
  it('lands on the block\'s first row at column 0', () => {
    // Somewhere visible and stable: a record row is never the row a door
    // leaves the cursor on, and if it ever were, the old column may name a
    // field that no longer exists.
    const src = makeFrame(80, 3, [
      row('OTL-DOOR.LHA P 40960 03-28-18 A door'),
      row('   a continuation row'),
      row('after'),
    ], { x: 25, y: 1 });
    const out = adaptRows(src, { cols: 40, blockRenderer: recordHook });
    expect(out.cursor).toEqual({ x: 0, y: 0 });
  });
});

describe("a pin naming 'stack' on a row the hook did not claim", () => {
  it('falls through to the rule the row would have had', () => {
    const src = frameOf(['a plain sentence that the hook has no opinion about']);
    const out = adaptRows(src, {
      cols: 40,
      regions: [{ rows: [0, 0], rule: 'stack' }],
      blockRenderer: () => null,
    });
    expect(out.rows.length).toBeGreaterThan(0);
    for (const r of out.rows) expect(r.cells.length).toBeLessThanOrEqual(40);
  });
});
