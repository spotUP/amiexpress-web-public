/**
 * Soft-drop speed: the player's setting, and the two systems that halve it.
 *
 * PlayerSettings.softDropSpeed had a settings row, a saved value and no
 * consumer - the input handler used a fixed 50 ms. And HeborisCE's ACE-SRS
 * and DS-WORLD deliberately fall at HALF speed under a held down key
 * (world.c:405, "ACE-SRSとDS-WORLDの高速落下を遅く"), where SRS-X gets one
 * and a half (world.c:407).
 */

import assert from 'assert';
import { TIMING } from '../input/config';
import {
  softDropFactor, softDropIntervalMs, DEFAULT_SOFT_DROP_SPEED,
} from '../core/soft-drop';

export async function theFactorsAreTheReferencesOwn(): Promise<void> {
  assert.strictEqual(softDropFactor('ACE-SRS'), 0.5, 'world.c:405 bs += 30');
  assert.strictEqual(softDropFactor('DS-WORLD'), 0.5, 'world.c:405 bs += 30');
  assert.strictEqual(softDropFactor('SRS-X'), 1.5, 'world.c:407 bs += 90');
  for (const system of ['SRS', 'ARS', 'NRS', 'BARS', 'TI-ARS', 'ACE-ARS', 'TI-WORLD'] as const) {
    assert.strictEqual(softDropFactor(system), 1, `${system} falls at the plain rate`);
  }
}

export async function theDefaultSettingIsExactlyWhatThisDoorAlreadyPlayed(): Promise<void> {
  // 20 cells per second is the 50 ms the handler used to hardcode, so a
  // player who never opened settings feels no change.
  assert.strictEqual(DEFAULT_SOFT_DROP_SPEED, 20);
  assert.strictEqual(softDropIntervalMs(20, 'SRS'), TIMING.SOFT_DROP_RATE);
  assert.strictEqual(softDropIntervalMs(undefined, 'SRS'), TIMING.SOFT_DROP_RATE);
}

export async function theSettingActuallyMovesTheRate(): Promise<void> {
  assert.strictEqual(softDropIntervalMs(10, 'SRS'), 100, '10 cells a second is 100 ms apart');
  assert.strictEqual(softDropIntervalMs(40, 'SRS'), 25, '40 is 25 ms');
  assert.ok(softDropIntervalMs(1, 'SRS') > softDropIntervalMs(40, 'SRS'),
    'a slower setting must be a longer interval');
}

export async function aceSrsAndDsWorldSoftDropAtHalfSpeed(): Promise<void> {
  const plain = softDropIntervalMs(20, 'SRS');
  assert.strictEqual(softDropIntervalMs(20, 'ACE-SRS'), plain * 2);
  assert.strictEqual(softDropIntervalMs(20, 'DS-WORLD'), plain * 2);
  assert.strictEqual(softDropIntervalMs(20, 'SRS-X'), Math.round(plain / 1.5));
}

export async function aBrokenSettingCannotStallOrFloodTheEngine(): Promise<void> {
  assert.strictEqual(softDropIntervalMs(0, 'SRS'), TIMING.SOFT_DROP_RATE, 'zero falls back');
  assert.strictEqual(softDropIntervalMs(-5, 'SRS'), TIMING.SOFT_DROP_RATE, 'negative falls back');
  assert.strictEqual(softDropIntervalMs(NaN, 'SRS'), TIMING.SOFT_DROP_RATE, 'NaN falls back');
  assert.ok(softDropIntervalMs(100000, 'SRS') >= 10, 'and an absurd one is clamped');
}

export async function theHandlerRepeatsAtTheRateItIsGiven(): Promise<void> {
  // Through the real InputHandler on a fake clock: hold down, advance time,
  // count what actually fires. The handler ignored the setting entirely
  // before setTiming carried it.
  const { InputHandler } = await import('../input/handler');

  let clock = 1_000_000;
  const realNow = Date.now;
  (Date as any).now = () => clock;
  try {
    let down: ((key: string) => void) | null = null;
    const screen: any = { on: () => {}, removeListener: () => {} };
    const session: any = {
      bbs: {
        onKeyDown: (cb: (key: string) => void) => { down = cb; },
        onKeyUp: () => {},
      },
    };
    const handler: any = new InputHandler(screen, session);
    let drops = 0;
    handler.on('soft_drop', () => { drops++; });

    handler.setTiming(undefined, undefined, 100);   // ten cells a second
    down!('ArrowDown');                             // the first press fires once
    const afterPress = drops;

    for (let step = 0; step < 10; step++) {         // 10 x 50 ms = 500 ms held
      clock += 50;
      handler.update(50);
    }

    const repeats = drops - afterPress;
    assert.ok(repeats >= 4 && repeats <= 6,
      `500 ms at a 100 ms repeat should fire about five times, fired ${repeats}`);
  } finally {
    (Date as any).now = realNow;
  }
}
