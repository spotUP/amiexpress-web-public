/**
 * door-capture.ts (the jest harness) and repaint-cost.ts (the probe) each carried their own idea of "a rail tick":
 * the probe's looked at the opening cursor save only, so a key's answer that began with one was dropped from its cost.
 * Both now use dev/scripts/door-probe/rail-tick.ts.
 */
import { isRailTick as probeTick } from '../../../../dev/scripts/door-probe/rail-tick';
import { isRailTick as harnessTick } from './compact-40/door-capture';

describe('a rail tick, for the probe and the harness alike', () => {
  const tick = '\x1b7\x1b[1;38;2;1;2;3m\x1b[1;1H////  ///\x1b8';

  test('it is the one function: the harness re-exports the probe\'s', () => {
    expect(harnessTick).toBe(probeTick);
  });

  test('a save, the rail on row 1 and the restore is a tick; so is a lone restore', () => {
    expect(probeTick(tick)).toBe(true);
    expect(probeTick('\x1b8')).toBe(true);
  });

  test('a message that opens with a save but addresses another row is an answer, not a tick', () => {
    expect(probeTick('\x1b7\x1b[1;1Habc\x1b[5;1Hdef\x1b8')).toBe(false);
    expect(probeTick('\x1b[1;1Habc')).toBe(false);          // row 1 alone, with no opening save: a frame's first message
  });
});
