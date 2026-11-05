/**
 * Sideways movement timing.
 *
 * Reported live 2026-08-26: "the sideways scrolling in GMASTER accelerates
 * and goes too quick in the end."
 *
 * Two faults behind that. The handler read module-level constants rather
 * than the player's settings, so the DAS and ARR sliders in the settings
 * screen did nothing at all. And the constants were DAS 133ms / ARR 10ms -
 * ten milliseconds is a hundred cells a second, so the piece sat still
 * through DAS and then crossed the board instantly, which reads as
 * accelerating.
 *
 * TGM3, the reference this door follows, charges DAS over 16 frames and then
 * slides one cell per frame. This door renders at 20fps, so a cell per
 * VISIBLE frame is 50ms.
 */

import assert from 'assert';
import { TIMING } from '../input/config';

/** GameScreen renders at this rate; see RENDER_FPS. */
const RENDER_FPS = 20;
const FRAME_MS = 1000 / RENDER_FPS;

export async function autoRepeatIsAtMostOneCellPerVisibleFrame(): Promise<void> {
  assert.ok(
    TIMING.ARR_RATE >= FRAME_MS,
    `ARR ${TIMING.ARR_RATE}ms moves more than one cell per ${FRAME_MS}ms frame - the piece teleports`
  );
}

export async function delayedAutoShiftMatchesTheReference(): Promise<void> {
  // TGM3: 16 frames at 60fps.
  const TGM3_DAS_MS = Math.round((16 / 60) * 1000);
  assert.ok(
    Math.abs(TIMING.DAS_DELAY - TGM3_DAS_MS) <= 20,
    `DAS ${TIMING.DAS_DELAY}ms is not TGM3's ${TGM3_DAS_MS}ms`
  );
}

export async function theHandlerTakesThePlayersOwnTiming(): Promise<void> {
  // The settings screen has always offered DAS and ARR; before this the
  // handler never read them.
  const { InputHandler } = await import('../input/handler');
  assert.strictEqual(
    typeof (InputHandler.prototype as any).setTiming, 'function',
    'InputHandler must accept the player\'s DAS/ARR'
  );
}

export async function theAppHandsTheHandlerItsTiming(): Promise<void> {
  // Wiring, not just capability: a setter nobody calls is no better than
  // the constants it replaced.
  const { readFileSync } = await import('fs');
  const { join } = await import('path');
  const app = readFileSync(join(__dirname, '..', 'app.ts'), 'utf8');

  const calls = app.split('setTiming(').length - 1;
  assert.ok(calls >= 3, `expected setTiming at construction, after loadSettings and after the settings screen; found ${calls}`);
}

export async function timingIsIgnoredWhenItMakesNoSense(): Promise<void> {
  const { InputHandler } = await import('../input/handler');
  const handler: any = Object.create(InputHandler.prototype);
  handler.dasDelay = TIMING.DAS_DELAY;
  handler.arrRate = TIMING.ARR_RATE;

  handler.setTiming(0, -5);

  assert.strictEqual(handler.dasDelay, TIMING.DAS_DELAY);
  assert.strictEqual(handler.arrRate, TIMING.ARR_RATE);
}
