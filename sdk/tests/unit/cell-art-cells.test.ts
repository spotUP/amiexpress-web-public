/**
 * The cell-art foundation: a buffer of coloured cells and the one function
 * that turns a row of them into blessed tags.
 *
 * Two behaviours carry the whole system and are pinned hard:
 * - null is TRANSPARENT: blitting never erases what is underneath it, and
 *   rendering paints the fallback, so sprites sit on terrain;
 * - tag output GROUPS runs of one colour, because a tag pair per cell for
 *   a 75-column row is 150 tags per line, 20 lines per tick.
 */

import {
  Cell,
  CellBuffer,
  PALETTE,
  createBuffer,
  blitCells,
  rowToTags,
  bufferToTags,
} from '../../engines/graphics/cell-art/cells';

const red = (char: string): Cell => ({ char, fg: 9, bg: 0 });

describe('the palette', () => {
  it('names all sixteen colours in ANSI order', () => {
    expect(PALETTE).toHaveLength(16);
    expect(PALETTE[0]).toBe('black');
    expect(PALETTE[4]).toBe('blue');
    expect(PALETTE[7]).toBe('white');
    expect(PALETTE[8]).toBe('gray');
    expect(PALETTE[11]).toBe('lightyellow');
    expect(PALETTE[15]).toBe('lightwhite');
  });
});

describe('createBuffer', () => {
  it('makes width x height of the fill', () => {
    const b = createBuffer(3, 2);
    expect(b).toHaveLength(2);
    expect(b[0]).toHaveLength(3);
    expect(b[0][0]).toBeNull();
  });

  it('clones the fill cell so rows do not share one object', () => {
    const b = createBuffer(2, 2, { char: '.', fg: 7, bg: 0 });
    (b[0][0] as Cell).char = 'X';
    expect((b[1][1] as Cell).char).toBe('.');
  });
});

describe('blitCells', () => {
  it('copies cells at the offset', () => {
    const dest = createBuffer(4, 3);
    blitCells(dest, [[red('A'), red('B')]], 1, 2);
    expect((dest[2][1] as Cell).char).toBe('A');
    expect((dest[2][2] as Cell).char).toBe('B');
  });

  it('treats null as transparent: what is underneath survives', () => {
    const dest = createBuffer(2, 1, { char: '#', fg: 7, bg: 4 });
    blitCells(dest, [[null, red('X')]], 0, 0);
    expect((dest[0][0] as Cell).char).toBe('#');
    expect((dest[0][1] as Cell).char).toBe('X');
  });

  it('clips at the edges instead of throwing', () => {
    const dest = createBuffer(2, 2);
    expect(() => blitCells(dest, [[red('A'), red('B')]], 1, 1)).not.toThrow();
    expect((dest[1][1] as Cell).char).toBe('A');
  });

  it('paints in call order: the last blit to a cell wins, null never erases', () => {
    const dest = createBuffer(1, 1);
    blitCells(dest, [[red('A')]], 0, 0);
    blitCells(dest, [[{ char: 'B', fg: 2, bg: 0 }]], 0, 0);
    expect((dest[0][0] as Cell).char).toBe('B');
    blitCells(dest, [[null]], 0, 0);
    expect((dest[0][0] as Cell).char).toBe('B');
  });
});

describe('rowToTags', () => {
  it('paints a cell in its own colours', () => {
    expect(rowToTags([{ char: 'A', fg: 9, bg: 4 }]))
      .toBe('{lightred-fg}{blue-bg}A{/}');
  });

  it('groups a run of one colour under one tag pair', () => {
    const row = [red('A'), red('B'), { char: 'C', fg: 2, bg: 0 }];
    expect(rowToTags(row))
      .toBe('{lightred-fg}{black-bg}AB{/}{green-fg}{black-bg}C{/}');
  });

  it('renders null as the fallback cell', () => {
    expect(rowToTags([null, red('X')], { char: '.', fg: 8, bg: 0 }))
      .toBe('{gray-fg}{black-bg}.{/}{lightred-fg}{black-bg}X{/}');
  });

  it('defaults the fallback to a space on black', () => {
    expect(rowToTags([null])).toBe('{white-fg}{black-bg} {/}');
  });
});

describe('bufferToTags', () => {
  it('renders one string per row', () => {
    const b = createBuffer(2, 2, { char: '#', fg: 7, bg: 0 });
    const lines = bufferToTags(b);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('{white-fg}{black-bg}##{/}');
  });
});
