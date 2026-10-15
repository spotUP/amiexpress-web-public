/**
 * Arkanoid pause control (Doors/arkanoid/client.ts).
 *
 * Space is the door's launch key, but when no ball is waiting it pauses
 * instead - one key with two meanings depending on game state. That is fine
 * on a keyboard and impossible to put on an on-screen Pause button, which
 * would launch the ball half the time. P always pauses.
 *
 * Asserted against the source: the door is a browser bundle with a renderer
 * and audio engine attached, so importing it to press one key would pull in
 * far more than it proves.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const client = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'Doors', 'arkanoid', 'client.ts'),
  'utf8'
);

/** The body of handleGameInput, where in-play keys are dispatched. */
function gameInput(): string {
  const start = client.indexOf('private handleGameInput(');
  expect(start).toBeGreaterThanOrEqual(0);
  return client.slice(start, client.indexOf('\n  private ', start + 10));
}

describe('arkanoid pause key', () => {
  it('pauses on P regardless of whether a ball is waiting', () => {
    const body = gameInput();

    expect(body).toMatch(/k === 'p'/);

    // Slice to the END of the branch, not a fixed number of characters -
    // the explanatory comment above the statement is longer than the
    // statement is.
    const from = body.indexOf("k === 'p'");
    const pBranch = body.slice(from, body.indexOf('} else if', from));

    expect(pBranch).toMatch(/state = 'paused'/);
    // Unlike space, it must not depend on whether a ball is waiting.
    expect(pBranch).not.toMatch(/balls\.some/);
  });

  it('leaves space doing launch-then-pause as it always did', () => {
    const body = gameInput();
    const spaceBranch = body.slice(body.indexOf("k === ' '"), body.indexOf("k === 'p'"));

    expect(spaceBranch).toMatch(/balls\.some\(b => !b\.active\)/);
    expect(spaceBranch).toMatch(/launchBall\(\)/);
  });

  it('still leaves the game on Q', () => {
    expect(gameInput()).toMatch(/k === 'q'/);
  });
});
