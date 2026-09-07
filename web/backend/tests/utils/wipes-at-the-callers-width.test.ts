/**
 * A screen wipe plays at the width the caller reads at.
 *
 * The wipes were refused to every PETSCII caller because the engine composed
 * the screen onto an 80-column grid whatever his width, so on a C64's 40 the
 * animation smeared the screen the 40-column work had just fitted - and the
 * board's own menu carries `~WX`. "try to fix the wipes for petscii 40 cols as
 * well" (sysop, 2026-09-07).
 *
 * The grid is the caller's width now, so what is asserted here is that no
 * ANIMATION frame puts a glyph past his last column - measured on the frames
 * themselves, by replaying each one onto a terminal model.
 *
 * The LAST frame is excluded on purpose, and is asserted separately: the wipe
 * deliberately ends on the caller's OWN bytes rather than on the model's
 * repaint of them, so whatever the direct-display path would have sent him is
 * exactly what he is left looking at.
 */
import { widestColumnPainted as widestColumn } from '../helpers/painted-columns';
import {
  getWipeFrames,
  wipeEffectsEnabled,
  renderScreenGrid,
  type WipeType,
} from '../../src/utils/screen-wipe.util';

const WIPES: WipeType[] = [
  'matrix', 'hblinds', 'vblinds', 'spiral', 'checker',
  'radial', 'blocks', 'noise', 'typewriter', 'explode',
];

/** An 80-column screen, already folded to 40 the way the reflow folds it. */
const NARROW_SCREEN = [
  '\x1b[1;36m.--------------------------------------.',
  '| \x1b[0;37mUPROUGH BBS - THE FILE AREAS         \x1b[1;36m|',
  '|                                      |',
  '| \x1b[0;33m1. Amiga                             \x1b[1;36m|',
  '| \x1b[0;33m2. Commodore 64                      \x1b[1;36m|',
  '| \x1b[0;33m3. Demos                             \x1b[1;36m|',
  '`--------------------------------------\x27\x1b[0m',
].join('\r\n');

/** The furthest column any ANIMATION frame paints to (the last frame is the
 * caller's own screen, and is asserted on its own below). */
function widestColumnPainted(frames: ReadonlyArray<{ content: string }>): number {
  return Math.max(0, ...frames.slice(0, -1).map((f) => widestColumn(f.content)));
}

describe('every caller may see a wipe', () => {
  it('a PETSCII caller is no longer refused one, at either width', () => {
    expect(wipeEffectsEnabled({ petsciiMode: true })).toBe(true);
    expect(wipeEffectsEnabled({ petsciiMode: false })).toBe(true);
    expect(wipeEffectsEnabled(undefined)).toBe(true);
  });
});

/**
 * A screen WIDER than the caller. The reflow folds prose to his width before
 * the wipe is built, but art does not fold - and the model has to wrap it
 * where his terminal wraps it, or the reveal paints into columns he has not
 * got. This is the screen that tells a width-aware engine from a width-blind
 * one; NARROW_SCREEN above cannot, because it already fits.
 */
const WIDE_SCREEN = [
  '\x1b[1;36m' + '='.repeat(78),
  '\x1b[0;37m' + 'UPROUGH BBS '.repeat(6),
  '\x1b[0;33m' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.repeat(2),
  '\x1b[1;36m' + '='.repeat(78) + '\x1b[0m',
].join('\r\n');

describe('a wipe is composed at the width it is played at', () => {
  it.each(WIPES)('%s never paints past a C64\'s fortieth column', (wipe) => {
    const frames = getWipeFrames(wipe, NARROW_SCREEN, 40);
    expect(frames.length).toBeGreaterThan(1);
    expect({ wipe, widest: widestColumnPainted(frames) <= 40 }).toEqual({ wipe, widest: true });
  });

  it.each(WIPES)('%s wraps an 80-column screen into a C64\'s forty rather than painting off the edge', (wipe) => {
    const frames = getWipeFrames(wipe, WIDE_SCREEN, 40);
    expect(frames.length).toBeGreaterThan(1);
    expect({ wipe, widest: widestColumnPainted(frames) <= 40 }).toEqual({ wipe, widest: true });
  });

  it('the same screen at 80 is unchanged - the default is what it always was', () => {
    // A long row is what tells the two apart: at 40 it wraps in the model, at
    // 80 it does not.
    const long = 'X'.repeat(70);
    expect(renderScreenGrid(long, 80).split(/\r\n/).length).toBe(1);
    expect(renderScreenGrid(long, 40).split(/\r\n/).length).toBe(2);
    // ...and the default is 80, so every existing caller is untouched.
    expect(renderScreenGrid(long)).toBe(renderScreenGrid(long, 80));
  });

  it('ends on the caller\'s own screen, at either width', () => {
    for (const columns of [40, 80]) {
      const frames = getWipeFrames('blocks', NARROW_SCREEN, columns);
      expect(frames[frames.length - 1].content).toContain('UPROUGH BBS');
    }
  });

  it('the last frame is the screen the direct path would have sent, untouched', () => {
    // Which is why it is exempt from the width check above: the bytes are the
    // caller's own, folded by the reflow before they ever reached this engine.
    const frames = getWipeFrames('blocks', WIDE_SCREEN, 40);
    expect(frames[frames.length - 1].content).toContain('='.repeat(78));
  });
});
