/**
 * Somebody else's frame fits YOUR tile (Doors/livechat/ui/frame-fit.ts).
 *
 * A sender encodes ASCII for the size of its OWN tile, and every viewer's
 * tile can differ - a phone, a maximised window and an 80x25 BBS view all
 * watching the same person. Whoever's tile did not match got a frame too
 * wide for it, every row wrapped onto the next, and the picture arrived as
 * stripes (screenshot, 2026-08-26: one tile a proper image, the other
 * horizontal bands).
 *
 * ASCII cannot be rescaled - half a block character is nothing - so it is
 * clipped. A smaller picture is honest; a wrapped one is unreadable.
 */

import {
  visibleWidth,
  clipToWidth,
  fitFrameToTile,
} from '../../../../Doors/livechat/ui/frame-fit';

describe('measuring a row', () => {
  it('ignores colour tags', () => {
    expect(visibleWidth('{red-fg}abc{/red-fg}')).toBe(3);
  });

  it('counts plain text as itself', () => {
    expect(visibleWidth('abcde')).toBe(5);
  });
});

describe('clipping a row', () => {
  it('leaves a row that already fits', () => {
    expect(clipToWidth('abc', 10)).toBe('abc');
  });

  it('cuts a row that is too wide', () => {
    expect(clipToWidth('abcdefgh', 3)).toBe('abc');
  });

  it('does not count tags towards the width', () => {
    // Three visible characters, however many tags surround them.
    const clipped = clipToWidth('{red-fg}a{/red-fg}{blue-fg}b{/blue-fg}{green-fg}c{/green-fg}d', 3);

    expect(visibleWidth(clipped)).toBe(3);
  });

  it('never cuts inside a tag', () => {
    // A half-written `{cyan-f` would be printed as text by blessed.
    const clipped = clipToWidth('{cyan-fg}abcdef{/cyan-fg}', 2);

    expect(clipped).not.toMatch(/\{[^}]*$/);
  });

  it('closes the colour it was cut in', () => {
    // Otherwise the row's colour leaks into whatever is drawn after it.
    const clipped = clipToWidth('{cyan-fg}abcdef', 2);

    expect(clipped.endsWith('{/}')).toBe(true);
  });

  it('adds no reset to a row that never had a tag', () => {
    expect(clipToWidth('abcdef', 2)).toBe('ab');
  });

  it('returns nothing for a zero width', () => {
    expect(clipToWidth('abc', 0)).toBe('');
  });
});

describe('fitting a frame', () => {
  const frame = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd'].join('\n');

  it('clips every row to the tile width', () => {
    const rows = fitFrameToTile(frame, 3, 10).split('\n');

    expect(rows.every(r => visibleWidth(r) <= 3)).toBe(true);
  });

  it('drops rows past the tile height', () => {
    // A frame one row too tall used to push the status bar off its own tile.
    expect(fitFrameToTile(frame, 8, 2).split('\n')).toHaveLength(2);
  });

  it('leaves a frame that already fits alone', () => {
    expect(fitFrameToTile(frame, 8, 4)).toBe(frame);
  });

  it('leaves a SMALLER frame alone rather than stretching it', () => {
    // It simply occupies less of the tile. Stretching ASCII means inventing
    // characters that were never sent.
    const small = ['ab', 'cd'].join('\n');

    expect(fitFrameToTile(small, 40, 20)).toBe(small);
  });

  it('survives a tile with no size', () => {
    expect(fitFrameToTile(frame, 0, 0)).toBe('');
  });
});
