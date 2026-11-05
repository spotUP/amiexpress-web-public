/**
 * A theme covers the board's screen; the manager must not call it dead.
 *
 * "almost all screens in the gallery says: No screen on this board reads this
 * file ... but it's not true. even the obvious mainmenus and confbulls say
 * it". The themed index answers what a caller WEARING the theme is served, so
 * the board's own menu is not the file that resolves - but every caller
 * without the theme still reads it.
 */
import { describe, expect, it } from 'vitest';
import { describeReader, type ScreenReaderShape } from '../src/pages/screen-index-view';

const reader = (over: Partial<ScreenReaderShape>): ScreenReaderShape =>
  ({ screen: 'MENU', scope: 'conf', id: 1, scopeName: 'Amiga Demoscene', via: 'resolved', ...over }) as ScreenReaderShape;

describe('a board screen a theme covers', () => {
  it('says who still reads it, not that nothing does', () => {
    expect(describeReader(reader({ via: 'shadowed', shadowedBy: 'tango' })))
      .toBe('MENU in Amiga Demoscene (conference 1) - for callers not wearing tango');
  });

  it('keeps the levels it serves', () => {
    expect(describeReader(reader({ via: 'shadowed', shadowedBy: 'tango', serves: '250 and above' })))
      .toMatch(/level 250 and above.*not wearing tango/);
  });

  it('names the theme even when the server did not', () => {
    expect(describeReader(reader({ via: 'shadowed' }))).toMatch(/not wearing this theme/);
  });

  it('leaves the board\'s own view worded as it was', () => {
    expect(describeReader(reader({}))).toBe('MENU in Amiga Demoscene (conference 1)');
    expect(describeReader(reader({ via: 'include' }))).toMatch(/^Included by MENU/);
  });
});
