/**
 * Select marquee to highlight runs: what the sysop drags is what they see.
 */
import { describe, expect, it } from 'vitest';
import { selectionHighlightRuns } from './screen-editor-state';

const stateWith = (sel: any) => sel;

describe('selectionHighlightRuns', () => {
  it('is empty with no selection', () => {
    expect(selectionHighlightRuns(stateWith(null))).toEqual([]);
    expect(selectionHighlightRuns(stateWith({
      startPoint: null, endPoint: null, bounds: null, selectedRegion: null,
    }))).toEqual([]);
  });
  it('normalizes a live drag to row runs', () => {
    expect(selectionHighlightRuns(stateWith({
      startPoint: { line: 3, col: 8 }, endPoint: { line: 1, col: 2 }, bounds: null, selectedRegion: null,
    }))).toEqual([
      { x: 2, y: 1, length: 7 },
      { x: 2, y: 2, length: 7 },
      { x: 2, y: 3, length: 7 },
    ]);
  });
  it('falls back to committed bounds after mouse-up', () => {
    expect(selectionHighlightRuns(stateWith({
      startPoint: { line: 0, col: 0 }, endPoint: { line: 0, col: 0 },
      bounds: { x1: 4, y1: 5, x2: 6, y2: 5 }, selectedRegion: null,
    }))).toEqual([{ x: 4, y: 5, length: 3 }]);
  });
});
