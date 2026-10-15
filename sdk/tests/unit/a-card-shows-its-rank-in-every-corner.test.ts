/**
 * A CARD SAYS WHAT IT IS FROM WHICHEVER CORNER IS SHOWING.
 *
 * "the cards needs their numbers in all 4 corners so visibility is better"
 * (sysop, 2026-09-16).
 *
 * Real cards are printed that way for one reason: a card overlapped from
 * either side still reads. On a board the cards are fanned and stacked - the
 * pile shows three cards overlapping, a long hand fans with a column of each
 * card visible - so whichever corner is covered, the other one answers.
 *
 * A mini card is the top half of a card and has only two corners; both of
 * them carry the rank.
 */

import { renderCardLines, renderUnoCardLines } from '../../engines/cards/card-engine';

const plain = { color: 'none' as const };
const corners = (lines: string[]): { topLeft: string; topRight: string; bottomLeft: string; bottomRight: string } => {
  const inner = (line: string): string => line.slice(1, -1);
  const first = inner(lines[1] ?? '');
  const last = inner(lines[lines.length - 2] ?? '');
  return {
    topLeft: first.trimStart().split(/\s/)[0] ?? '',
    topRight: first.trimEnd().split(/\s/).pop() ?? '',
    bottomLeft: last.trimStart().split(/\s/)[0] ?? '',
    bottomRight: last.trimEnd().split(/\s/).pop() ?? '',
  };
};

describe('a full card', () => {
  it('prints its rank in all four corners', () => {
    for (const style of ['unicode', 'ascii'] as const) {
      const found = corners(renderCardLines({ rank: 'Q', suit: 'H' }, { ...plain, style, size: 'full' }));
      expect(found).toEqual({ topLeft: 'Q', topRight: 'Q', bottomLeft: 'Q', bottomRight: 'Q' });
    }
  });

  it('fits a ten in them, which is two characters wide', () => {
    const found = corners(renderCardLines({ rank: '10', suit: 'S' }, { ...plain, style: 'unicode', size: 'full' }));
    expect(found).toEqual({ topLeft: '10', topRight: '10', bottomLeft: '10', bottomRight: '10' });
  });

  it('is still the same width it always was', () => {
    // Nine columns inside two borders: every layout in every door counts on it.
    for (const line of renderCardLines({ rank: 'K', suit: 'D' }, { ...plain, style: 'unicode', size: 'full' })) {
      expect(line.length).toBe(11);
    }
  });
});

describe('a mini card', () => {
  it('carries the rank in both corners it has', () => {
    const lines = renderCardLines({ rank: '9', suit: 'C' }, { ...plain, style: 'unicode', size: 'mini' });
    const inner = lines[1].slice(1, -1);
    expect(inner.trimStart().split(/\s/)[0]).toBe('9');
    expect(inner.trimEnd().split(/\s/).pop()).toBe('9');
  });

  it('keeps its width when the art is a wide one', () => {
    for (const style of ['unicode', 'ascii'] as const) {
      for (const suit of ['S', 'H', 'D', 'C'] as const) {
        for (const line of renderCardLines({ rank: '10', suit }, { ...plain, style, size: 'mini' })) {
          expect(line.length).toBe(11);
        }
      }
    }
  });
});

describe('an UNO card', () => {
  it('shows its value at both ends of both label rows', () => {
    const lines = renderUnoCardLines({ color: 'R', value: '7' }, { ...plain, style: 'unicode', size: 'full' });
    const first = lines[1].slice(1, -1);
    const last = lines[lines.length - 2].slice(1, -1);
    expect(first.trimStart().startsWith('R7')).toBe(true);
    expect(first.trimEnd().endsWith('R7')).toBe(true);
    expect(last.trimStart().startsWith('R7')).toBe(true);
    expect(last.trimEnd().endsWith('R7')).toBe(true);
  });

  it('is the same width as a standard card', () => {
    for (const line of renderUnoCardLines({ color: 'G', value: 'skip' }, { ...plain, style: 'unicode', size: 'full' })) {
      expect(line.length).toBe(11);
    }
  });
});
