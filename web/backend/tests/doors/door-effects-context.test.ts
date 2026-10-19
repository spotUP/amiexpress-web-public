/**
 * W row 23 (animations off) reaches the SDK effect gate a TypeScript door
 * calls, for the caller whose door it is and no other (plan A25/A26).
 */
import type { BBSSession } from '../../src/index';
import { bindToDoorContext, runInDoorContext } from '../../src/doors/door-effects-context';
import { effectsAllowed } from '../../../../sdk/engines/ui/blessed/core/responsive-constants';

const caller = (noAnimations: boolean, runningDoorIsGame = false): BBSSession =>
  ({ user: { noAnimations }, runningDoorIsGame } as unknown as BBSSession);

test('outside any door the gate is width-only', () => {
  expect(effectsAllowed(80)).toBe(true);
  expect(effectsAllowed(40)).toBe(false);
});

test('inside a flagged caller\'s door the gate says no at 80 columns', () => {
  expect(runInDoorContext(caller(true), () => effectsAllowed(80))).toBe(false);
  expect(runInDoorContext(caller(false), () => effectsAllowed(80))).toBe(true);
});

test('a game door keeps its effects for a flagged caller', () => {
  expect(runInDoorContext(caller(true, true), () => effectsAllowed(80))).toBe(true);
});

test('a timer started by the door and a handler it registered answer for that door', async () => {
  const flagged = caller(true);
  let fromTimer: boolean | undefined;
  let handler: (() => boolean) | undefined;
  await runInDoorContext(flagged, () => new Promise<void>((resolve) => {
    handler = bindToDoorContext(() => effectsAllowed(80));
    setTimeout(() => { fromTimer = effectsAllowed(80); resolve(); }, 0);
  }));
  expect(fromTimer).toBe(false);
  // Called later from outside, as socket.io would: still this caller's answer.
  expect(handler?.()).toBe(false);
  expect(effectsAllowed(80)).toBe(true);
});

test('two callers\' doors running at once never share an answer', async () => {
  const [a, b] = await Promise.all([
    runInDoorContext(caller(true), async () => { await new Promise((r) => setTimeout(r, 5)); return effectsAllowed(80); }),
    runInDoorContext(caller(false), async () => { await new Promise((r) => setTimeout(r, 1)); return effectsAllowed(80); }),
  ]);
  expect(a).toBe(false);
  expect(b).toBe(true);
});
