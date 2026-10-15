/**
 * Half-cell positioning.
 *
 * A terminal object normally jumps a whole cell at a time. These rules let it
 * sit on a half-cell boundary using CP437 block glyphs, so a paddle or a ball
 * appears to move less than one character.
 *
 * The invariant worth protecting is that a bar KEEPS ITS LENGTH when it steps
 * half a cell: a 10-wide paddle covers 10 cells of ink whether it is aligned
 * or halfway between, otherwise it would visibly grow and shrink as it slid.
 */

import {
  horizontalBar,
  verticalBar,
  subcellPoint,
  offsetFor,
  dominantAxis,
  SUBCELL_CHARS,
} from '../../engines/graphics/subcell';

/** Total cells of ink, counting a half block as half a cell. */
function inkWidth(spans: { partial: boolean }[]): number {
  return spans.reduce((sum, s) => sum + (s.partial ? 0.5 : 1), 0);
}

describe('where a fractional coordinate sits', () => {
  it('snaps to the cell when barely into it', () => {
    expect(offsetFor(10.1)).toBe('whole');
  });

  it('takes the half step in the middle', () => {
    expect(offsetFor(10.5)).toBe('half');
  });

  it('snaps to the next cell when nearly there', () => {
    expect(offsetFor(10.9)).toBe('next');
  });

  it('treats a whole number as whole', () => {
    expect(offsetFor(10)).toBe('whole');
  });
});

describe('a horizontal bar (the paddle)', () => {
  it('draws solid cells when aligned', () => {
    const spans = horizontalBar(10, 5, 4);

    expect(spans).toHaveLength(4);
    expect(spans.every(s => s.char === SUBCELL_CHARS.full)).toBe(true);
    expect(spans.every(s => !s.partial)).toBe(true);
    expect(spans[0].x).toBe(10);
  });

  it('half-fills the end cells when halfway between columns', () => {
    const spans = horizontalBar(10.5, 5, 4);

    expect(spans[0]).toMatchObject({ x: 10, char: SUBCELL_CHARS.right, partial: true });
    expect(spans[spans.length - 1]).toMatchObject({ x: 14, char: SUBCELL_CHARS.left, partial: true });
  });

  it('keeps its length across the half step, so it does not grow as it slides', () => {
    expect(inkWidth(horizontalBar(10, 5, 10))).toBe(10);
    expect(inkWidth(horizontalBar(10.5, 5, 10))).toBe(10);
    expect(inkWidth(horizontalBar(11, 5, 10))).toBe(10);
  });

  it('advances by half a cell, not a whole one', () => {
    // The point of the exercise: three distinct renderings across one column.
    const a = horizontalBar(10, 5, 4);
    const b = horizontalBar(10.5, 5, 4);
    const c = horizontalBar(11, 5, 4);

    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(c));
  });

  it('stays on one row', () => {
    const spans = horizontalBar(10.5, 7, 6);

    expect(spans.every(s => s.y === 7)).toBe(true);
  });

  it('draws nothing for a zero width', () => {
    expect(horizontalBar(10, 5, 0)).toEqual([]);
  });
});

describe('a vertical bar', () => {
  it('half-fills the end cells when halfway between rows', () => {
    const spans = verticalBar(3, 10.5, 4);

    expect(spans[0]).toMatchObject({ y: 10, char: SUBCELL_CHARS.bottom, partial: true });
    expect(spans[spans.length - 1]).toMatchObject({ y: 14, char: SUBCELL_CHARS.top, partial: true });
  });

  it('keeps its length across the half step', () => {
    expect(inkWidth(verticalBar(3, 10, 6))).toBe(6);
    expect(inkWidth(verticalBar(3, 10.5, 6))).toBe(6);
  });
});

describe('a single cell object (the ball)', () => {
  it('is one solid cell when aligned', () => {
    const spans = subcellPoint(10, 5, 'horizontal');

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ x: 10, y: 5, char: SUBCELL_CHARS.full });
  });

  it('straddles two cells when halfway across', () => {
    const spans = subcellPoint(10.5, 5, 'horizontal');

    expect(spans).toHaveLength(2);
    expect(spans[0].char).toBe(SUBCELL_CHARS.right);
    expect(spans[1].char).toBe(SUBCELL_CHARS.left);
    expect(inkWidth(spans)).toBe(1);
  });

  it('straddles two rows when halfway down', () => {
    const spans = subcellPoint(10, 5.5, 'vertical');

    expect(spans.map(s => s.char)).toEqual([SUBCELL_CHARS.bottom, SUBCELL_CHARS.top]);
    expect(spans.map(s => s.y)).toEqual([5, 6]);
  });

  it('does not smooth the axis it was not asked to smooth', () => {
    // Only one axis can be half-stepped - the quadrant glyphs that would do
    // both are not CP437 - so the other coordinate must land on a whole cell.
    const spans = subcellPoint(10.5, 5.5, 'vertical');

    expect(spans.every(s => Number.isInteger(s.x))).toBe(true);
  });
});

describe('choosing the axis to smooth', () => {
  it('follows the way the object is mostly travelling', () => {
    expect(dominantAxis(0.2, 1.0)).toBe('vertical');
    expect(dominantAxis(1.0, 0.2)).toBe('horizontal');
  });

  it('breaks a tie horizontally, where a half step is the finer move', () => {
    // A cell is about twice as tall as it is wide.
    expect(dominantAxis(1.0, 1.0)).toBe('horizontal');
  });

  it('ignores direction, only speed', () => {
    expect(dominantAxis(-1.0, 0.2)).toBe('horizontal');
    expect(dominantAxis(0.2, -1.0)).toBe('vertical');
  });
});
