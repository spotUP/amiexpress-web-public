/**
 * Newspaper columns: the count follows the screen, the measure does not.
 */
import assert from 'node:assert';
import { columnCount, columnGeometry, flowColumns, setParagraphs, MAX_MEASURE } from '../columns';

export async function columnCountFollowsTheScreenWidth(): Promise<void> {
  assert.strictEqual(columnCount(40), 1, 'a C64 gets one column');
  assert.strictEqual(columnCount(79), 1);
  assert.strictEqual(columnCount(80), 2);
  assert.strictEqual(columnCount(119), 2);
  assert.strictEqual(columnCount(120), 3);
  assert.strictEqual(columnCount(132), 3);
  assert.strictEqual(columnCount(200), 3);
}

export async function theMeasureStaysReadableAndEveryRowFitsTheScreen(): Promise<void> {
  for (const width of [40, 80, 100, 120, 132, 160, 200]) {
    const g = columnGeometry(width);
    assert.ok(g.colWidth <= MAX_MEASURE, `${width}: column ${g.colWidth} wider than the measure`);
    if (width >= 80) assert.ok(g.colWidth >= 34, `${width}: column too narrow`);
    assert.ok(g.margin + g.contentWidth <= width, `${width}: set text runs past the screen`);
    assert.strictEqual(g.contentWidth, g.colWidth * g.cols + g.gutter * (g.cols - 1));
  }
  assert.strictEqual(columnGeometry(80).colWidth, 37);
  assert.strictEqual(columnGeometry(132).colWidth, MAX_MEASURE, 'a wide screen gets margins, not longer lines');
  assert.strictEqual(columnGeometry(40).gutter, 0);
}

export async function gutterComesFromTheCompactProfile(): Promise<void> {
  // gap is 1 on the standard tiers (a rule flanked by one space each side).
  assert.strictEqual(columnGeometry(80).gutter, 3);
  assert.strictEqual(columnGeometry(132).gutter, 3);
}

const PARAS = [
  'The first paragraph is long enough to need wrapping across several rows of a narrow column of text.',
  'Second paragraph.',
  'Third paragraph, again long enough that it wraps onto more than one row when set at a narrow measure.',
];

export async function noRowIsWiderThanTheMeasure(): Promise<void> {
  for (const measure of [20, 34, 38]) {
    for (const row of setParagraphs(PARAS, measure)) {
      assert.ok(row.length <= measure, `"${row}" is ${row.length} wide at ${measure}`);
    }
  }
}

export async function flowFillsColumnOneThenColumnTwoThenTheNextSpread(): Promise<void> {
  const rows = Array.from({ length: 11 }, (_, i) => `row ${i}`);
  const spreads = flowColumns(rows, 2, { first: 3, rest: 4 });
  assert.deepStrictEqual(spreads[0].columns, [['row 0', 'row 1', 'row 2'], ['row 3', 'row 4', 'row 5']]);
  // Column one takes the full height before column two: 4 + 1.
  assert.deepStrictEqual(spreads[1].columns, [['row 6', 'row 7', 'row 8', 'row 9'], ['row 10']]);
  assert.strictEqual(spreads.length, 2);
}

export async function aListingFillsColumnOneFirst(): Promise<void> {
  const rows = ['a', 'b', 'c'];
  const spreads = flowColumns(rows, 2, { first: 30, rest: 30 });
  assert.deepStrictEqual(spreads[0].columns, [['a', 'b', 'c'], []]);
}

export async function fillsColumnOneToTheFullHeightBeforeColumnTwo(): Promise<void> {
  const rows = Array.from({ length: 17 }, (_, i) => `row ${i}`);
  for (const cols of [2, 3]) {
    const spreads = flowColumns(rows, cols, { first: 16, rest: 16 });
    assert.strictEqual(spreads.length, 1);
    assert.deepStrictEqual(spreads[0].columns.map((c) => c.length), cols === 2 ? [16, 1] : [16, 1, 0]);
  }
}

export async function noRowIsLostOrReorderedAcrossSpreads(): Promise<void> {
  const rows = setParagraphs(PARAS, 20);
  for (const cols of [1, 2, 3]) {
    const spreads = flowColumns(rows, cols, { first: 3, rest: 5 });
    const flat = spreads.flatMap((s) => s.columns.flat());
    // Every non-blank row appears exactly once, in order.
    assert.deepStrictEqual(flat.filter((r) => r !== ''), rows.filter((r) => r !== ''));
  }
}

export async function aParagraphGapNeverStartsAColumn(): Promise<void> {
  const rows = ['a', 'b', '', 'c', 'd'];
  const spreads = flowColumns(rows, 2, { first: 3, rest: 3 });
  assert.deepStrictEqual(spreads[0].columns, [['a', 'b', ''], ['c', 'd']]);
  const gapAtTop = flowColumns(['a', '', 'b'], 2, { first: 1, rest: 1 });
  assert.deepStrictEqual(gapAtTop[0].columns, [['a'], ['b']]);
}

export async function aHeadingStaysWithWhatItHeads(): Promise<void> {
  const rows = ['H1', 'x', 'y', 'H2', 'z'];
  const spreads = flowColumns(rows, 2, { first: 4, rest: 4 }, { keepWithNext: (r) => r.startsWith('H') });
  assert.deepStrictEqual(spreads[0].columns, [['H1', 'x', 'y'], ['H2', 'z']]);
}

export async function emptyTextIsOneEmptySpread(): Promise<void> {
  const spreads = flowColumns([], 3, { first: 5, rest: 5 });
  assert.strictEqual(spreads.length, 1);
  assert.deepStrictEqual(spreads[0].columns, [[], [], []]);
}

export async function aWordWiderThanTheColumnIsCutNotOverflowed(): Promise<void> {
  const rows = setParagraphs(['x'.repeat(50)], 20);
  assert.ok(rows.every((r) => r.length <= 20));
  assert.strictEqual(rows.join(''), 'x'.repeat(50));
}
