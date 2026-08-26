/**
 * When the video grid is allowed to rebuild its tiles
 * (Doors/livechat/features/video-layout.ts).
 *
 * Reported as "every second frame in some render modes in the video mode in
 * LiveChat is broken", and narrowed by the reporter to the 80x25 view only.
 *
 * A probe in the video tile gave the decisive evidence: what arrived
 * alternated between
 *
 *   rows=15 widths=[54]      a video frame
 *   rows=8  widths=[27]      NOT a frame - the avatar
 *
 * 27 is `{red-fg}` + a ten-column block letter + `{/red-fg}`, and 8 is two
 * blank lines plus six glyph rows. The tile was painting the avatar between
 * every pair of frames, because the grid destroys and rebuilds every tile on
 * relayout and a new tile holds no picture.
 *
 * The relayouts came from setActiveSpeaker(), which voice activity toggles
 * continuously. It only bit the 80x25 view because that view runs in SPEAKER
 * mode, where the active speaker decides who is on screen; grid mode answers
 * the same event by recolouring a border.
 */

import {
  layoutSignature,
  pickSpeaker,
} from '../../../../Doors/livechat/features/video-layout';

const ME = 'me';
const OTHER = 'other';
const ALONE = [{ userId: ME }];
const PAIR = [{ userId: ME }, { userId: OTHER }];

/** The signature the grid compares against to decide whether to rebuild. */
function speakerSig(participants: { userId: string }[], activeSpeaker?: string, w = 56, h = 16) {
  return layoutSignature('speaker', w, h, participants, activeSpeaker, ME);
}

describe('speaking does not move any tile', () => {
  it('is the same signature whether or not someone is speaking, when alone', () => {
    // The exact reported case: one person, a dark room, and the speaker
    // flag flipping with every sound they make.
    const quiet = speakerSig(ALONE, undefined);
    const talking = speakerSig(ALONE, ME);

    expect(talking).toBe(quiet);
  });

  it('is the same signature when the speaker flag flips repeatedly', () => {
    const flips = [undefined, ME, undefined, ME, undefined].map(s => speakerSig(ALONE, s));

    expect(new Set(flips).size).toBe(1);
  });

  it('is the same signature in grid mode no matter who speaks', () => {
    const a = layoutSignature('grid', 80, 24, PAIR, undefined, ME);
    const b = layoutSignature('grid', 80, 24, PAIR, OTHER, ME);

    expect(b).toBe(a);
  });
});

describe('things that DO move tiles', () => {
  it('changes when the person on screen changes', () => {
    // Speaker mode really does swap the tile here - it must rebuild.
    expect(speakerSig(PAIR, OTHER)).not.toBe(speakerSig(PAIR, ME));
  });

  it('changes when someone joins a grid', () => {
    const before = layoutSignature('grid', 80, 24, ALONE, undefined, ME);
    const after = layoutSignature('grid', 80, 24, PAIR, undefined, ME);

    expect(after).not.toBe(before);
  });

  it('changes when the container is resized', () => {
    expect(speakerSig(ALONE, ME, 56, 16)).not.toBe(speakerSig(ALONE, ME, 80, 24));
    expect(speakerSig(ALONE, ME, 56, 16)).not.toBe(speakerSig(ALONE, ME, 56, 24));
  });

  it('changes when the view mode is toggled', () => {
    const speaker = layoutSignature('speaker', 80, 24, ALONE, ME, ME);
    const grid = layoutSignature('grid', 80, 24, ALONE, ME, ME);

    expect(grid).not.toBe(speaker);
  });

  it('does not change in speaker mode when someone joins off screen', () => {
    // Only one tile is on screen; a second participant moves nothing.
    expect(speakerSig(PAIR, ME)).toBe(speakerSig(ALONE, ME));
  });
});

describe('who is on screen in speaker mode', () => {
  it('is the active speaker', () => {
    expect(pickSpeaker(PAIR, OTHER, ME)?.userId).toBe(OTHER);
  });

  it('falls back to yourself when nobody is speaking', () => {
    expect(pickSpeaker(PAIR, undefined, ME)?.userId).toBe(ME);
  });

  it('falls back to the first participant when you are not in the call', () => {
    expect(pickSpeaker(PAIR, undefined, 'nobody')?.userId).toBe(ME);
  });

  it('matches ids across types', () => {
    // Ids arrive as numbers from the database and strings from sockets.
    expect(pickSpeaker([{ userId: 7 }], '7', 'x')?.userId).toBe(7);
    expect(pickSpeaker([{ userId: '7' }], undefined, 7)?.userId).toBe('7');
  });

  it('has nobody to show in an empty call', () => {
    expect(pickSpeaker([], undefined, ME)).toBeUndefined();
  });
});

describe('measuring the grid container', () => {
  const { resolveBoxSize } = require('../../../../Doors/livechat/features/video-layout');

  /** A box built with a layout spec, as the video grid's container is. */
  const specBox = (coords: any) => ({
    width: '100%',
    height: '100%',
    _getCoords: () => coords,
  });

  it('reads the resolved size, not the spec', () => {
    // container.width returns '100%' - the string it was built with - which
    // never changes however the window is resized. Measuring with it made
    // the grid believe its size was constant, so tiles were never rebuilt
    // and the video never resized.
    const size = resolveBoxSize(specBox({ xi: 15, xl: 99, yi: 1, yl: 44 }), { width: 80, height: 24 });

    expect(size).toEqual({ width: 84, height: 43 });
  });

  it('changes when the window changes', () => {
    const narrow = resolveBoxSize(specBox({ xi: 0, xl: 80, yi: 0, yl: 24 }), { width: 80, height: 24 });
    const wide = resolveBoxSize(specBox({ xi: 0, xl: 170, yi: 0, yl: 26 }), { width: 80, height: 24 });

    expect(wide).not.toEqual(narrow);
  });

  it('falls back when coords are not available yet', () => {
    const size = resolveBoxSize({ width: '100%', height: '100%', _getCoords: () => undefined }, { width: 80, height: 24 });

    expect(size).toEqual({ width: 80, height: 24 });
  });

  it('accepts a numeric spec as a fallback', () => {
    const size = resolveBoxSize({ width: 56, height: 16, _getCoords: () => undefined }, { width: 80, height: 24 });

    expect(size).toEqual({ width: 56, height: 16 });
  });

  it('never returns a zero or negative size', () => {
    const size = resolveBoxSize(specBox({ xi: 10, xl: 10, yi: 5, yl: 5 }), { width: 80, height: 24 });

    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });
});

describe('what makes the grid rebuild', () => {
  const { readFileSync } = require('fs');
  const { join } = require('path');
  const grid = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'Doors', 'livechat', 'features', 'video-grid.ts'),
    'utf8'
  );

  it('listens to the SCREEN, not only its own container', () => {
    // An Element emits 'resize' only when its own width or height is SET.
    // The grid container is sized '100%', so its size changes with its
    // parent without anything being assigned to it, and it stays silent
    // through every window resize. Only the Screen knows the window moved.
    //
    // Without this the tiles keep the size they were built at, the camera is
    // never asked to re-encode, and the picture is stuck at whatever the
    // window was when the session started.
    expect(grid).toMatch(/this\.screen\.on\('resize'[\s\S]{0,200}?this\.updateGrid\(\)/);
  });

  it('still rebuilds when the container itself is resized', () => {
    expect(grid).toMatch(/this\.container\.on\('resize'[\s\S]{0,120}?this\.updateGrid\(\)/);
  });
});

describe('choosing the view mode', () => {
  const { autoViewMode } = require('../../../../Doors/livechat/features/video-layout');

  it('fills the panel with one person when you are alone', () => {
    // A grid of one is just a smaller picture.
    expect(autoViewMode(1, false, 'speaker')).toBe('speaker');
    expect(autoViewMode(1, false, 'grid')).toBe('speaker');
  });

  it('shows everyone once somebody else is there', () => {
    // Two people in a call showed ONE video, in both browsers.
    expect(autoViewMode(2, false, 'speaker')).toBe('grid');
    expect(autoViewMode(5, false, 'speaker')).toBe('grid');
  });

  it('never overrides a mode the user picked', () => {
    // Someone who asked for fullscreen focus does not want it undone
    // because a third person joined.
    expect(autoViewMode(3, true, 'speaker')).toBe('speaker');
    expect(autoViewMode(1, true, 'grid')).toBe('grid');
  });
});
