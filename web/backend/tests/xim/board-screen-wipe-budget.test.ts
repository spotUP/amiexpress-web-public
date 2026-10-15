/**
 * A wipe that would outrun the door's 5 s answer deadline is cut to the
 * budget before it plays: playCapture must hand playWipeFrames the CAPPED
 * list (frames within WIPE_BUDGET_MS, then the finished picture).
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/utils/screen-wipe.util', () => ({
  getWipeFrames: jest.fn(),
  getWipeOutFrames: jest.fn(),
  wipeEffectsEnabled: jest.fn(() => true),
}));
jest.mock('../../src/utils/wipe-playback', () => ({ playWipeFrames: jest.fn(async () => undefined) }));

import { boardScreenAnswer, WIPE_BUDGET_MS, type BoardScreenContext } from '../../src/amiga-emulation/xim/board-screen';
import { getWipeFrames } from '../../src/utils/screen-wipe.util';
import { playWipeFrames } from '../../src/utils/wipe-playback';

test('WIPE END plays a long wipe capped to the budget, ending on the final frame', async () => {
  const frames = Array.from({ length: 1000 }, (_, i) => ({ delay: 100, content: `f${i}` }));
  (getWipeFrames as jest.Mock).mockReturnValue(frames);
  const ctx: BoardScreenContext = {
    session: {}, socket: { emit: jest.fn() },
    state: { wipeCapture: { kind: 'in', letter: 'H', text: ['picture'] } },
    mouse: null, armMouse: jest.fn(), columns: () => 80,
  };

  expect(await boardScreenAnswer('WIPE END', ctx)).toBe('OK');

  const played = (playWipeFrames as jest.Mock).mock.calls[0][1] as typeof frames;
  expect(played.length).toBeLessThan(frames.length);
  expect(played.reduce((ms, f) => ms + f.delay, 0)).toBeLessThanOrEqual(WIPE_BUDGET_MS + 100);
  expect(played[played.length - 1]).toBe(frames[frames.length - 1]);
});
