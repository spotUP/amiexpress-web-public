/**
 * The flash a piece makes when it lands.
 *
 * Reported 2026-08-31: "when the tetris pieces lands against something there
 * is an animation that looks buggy".
 *
 * Two faults, both about the fact that this game draws at 20 frames a second
 * into a terminal:
 *
 *  - The flash was 100 ms long and visible for the first 56 ms of that - one
 *    render interval is 50 ms, so whether the player saw it at all depended
 *    on where the frame boundary happened to fall. An effect shorter than
 *    the display's frame time is not a fast effect, it is a coin toss.
 *
 *  - render() painted the board and THEN built the overlay the board is
 *    painted through, so every effect arrived a frame late; and when the
 *    overlay went empty nothing marked the board dirty, so the last painted
 *    frame stayed on screen. The landed piece kept its white flash until an
 *    unrelated change repainted the board - the next piece spawning. A block
 *    that turns white and stays white for the whole appearance delay is
 *    exactly "an animation that looks buggy".
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

/** GameScreen's RENDER_FPS. */
const RENDER_INTERVAL = 1000 / 20;

export async function theLockFlashOutlivesARenderedFrame(): Promise<void> {
  const { AnimationManager } = await import('../effects/animations');
  const { lockFlashChar } = await import('../ui/board-effects');
  const animations: any = new AnimationManager();

  animations.lockGlow([{ x: 0, y: 5 }], 'cyan');
  const anim = animations.getAnimationsByType('lockGlow')[0];

  // What matters is not how long the animation LIVES but how long it DRAWS.
  // The old one lived 100ms and drew for 56 of them, so at 50ms a frame it
  // was sampled once or not at all. Anything above two frame intervals is
  // seen at least twice whatever the phase.
  let visible = 0;
  while (visible < anim.duration && lockFlashChar(visible) !== null) visible++;

  assert.ok(
    visible > RENDER_INTERVAL * 2,
    `lock flash draws for ${visible}ms of its ${anim.duration}ms life; at ${RENDER_INTERVAL}ms a frame that is not reliably even two frames, so the landing flashes or does not at random`
  );
}

export async function theFlashIsSolidFirstThenDithersOut(): Promise<void> {
  const { lockFlashChar } = await import('../ui/board-effects');

  const first = lockFlashChar(0);
  const second = lockFlashChar(RENDER_INTERVAL * 1.5);
  const gone = lockFlashChar(10_000);

  assert.ok(first && first.includes('█'), 'the frame the piece lands on is a solid flash');
  assert.ok(second && second.includes('░'), 'the frame after it thins out');
  assert.strictEqual(gone, null, 'and then it is gone');
}

export async function everySampleOfTheFlashShowsSomething(): Promise<void> {
  // The point of the whole fix: wherever the 50ms render boundaries land,
  // the player sees the flash. Sweep every millisecond of its life at the
  // real frame spacing and check no phase draws nothing at all.
  const { lockFlashChar } = await import('../ui/board-effects');

  for (let phase = 0; phase < RENDER_INTERVAL; phase++) {
    assert.ok(
      lockFlashChar(phase) !== null,
      `a render landing ${phase}ms after the lock drew no flash`
    );
  }
}

export async function theBoardRepaintsWhenTheLastEffectDisappears(): Promise<void> {
  const { boardNeedsRepaint } = await import('../ui/board-effects');

  // Nothing moved, nothing is animating - but the previous frame painted a
  // flash and this one does not. Skipping the repaint is what left the
  // white block on screen.
  assert.strictEqual(
    boardNeedsRepaint({
      boardChanged: false,
      overlayChanged: true,
      hasTrails: false,
      hadTrails: false,
      isShaking: false,
    }),
    true,
    'the frame after an effect ends must repaint, or the effect stays on screen'
  );

  assert.strictEqual(
    boardNeedsRepaint({
      boardChanged: false,
      overlayChanged: false,
      hasTrails: false,
      hadTrails: false,
      isShaking: false,
    }),
    false,
    'a still board must not be repainted every frame - this runs over a socket'
  );
}

export async function anEmptyOverlayIsDistinguishableFromAFullOne(): Promise<void> {
  const { overlaySignature } = await import('../ui/board-effects');

  const empty = overlaySignature([]);
  const flash: (string | null)[][] = [[null, '{white-fg}██{/white-fg}']];

  assert.notStrictEqual(overlaySignature(flash), empty);
  assert.strictEqual(overlaySignature(flash), overlaySignature(flash));
}

export async function theOverlayIsBuiltBeforeTheBoardIsPainted(): Promise<void> {
  // renderBoard() composites the overlay into the board content. Building
  // the overlay after it means the board is painted through the PREVIOUS
  // frame's effects, so every flash, particle and popup is one frame late.
  const source = readFileSync(join(__dirname, '..', 'ui', 'game-screen.ts'), 'utf8');
  const render = source.slice(source.indexOf('  private render(): void {'));
  const body = render.slice(0, render.indexOf('\n  /** Render immediately'));

  const overlayAt = body.indexOf('BoardOverlay(');
  const boardAt = body.indexOf('this.renderBoard(');

  assert.ok(overlayAt > 0 && boardAt > 0, 'render() must build the overlay and paint the board');
  assert.ok(
    overlayAt < boardAt,
    'the overlay is built after the board is painted, so effects are drawn one frame late'
  );
}
