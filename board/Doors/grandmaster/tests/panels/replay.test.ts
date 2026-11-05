/**
 * End-to-end conformance: replay a real recorded game and check the outcome.
 *
 * This is the strongest test in the suite. `endlessReplayReproducesUpstreamsOutcome`
 * feeds 403 frames of input a human actually played in January 2023 through the
 * whole engine and asserts the death frame, the score and the panels cleared
 * against the values upstream's own basicEndlessTest asserts.
 *
 * Passing it means all of these agree with panel-attack simultaneously:
 * the legacy PRNG, generator and panel source; the 188-frame countdown and the
 * cursor walk inside it; the input codec and its run-length layer; cursor
 * auto-repeat; swap queueing and legality; matching, chains and combos; rise,
 * displacement and stop time; manual raise and both death conditions; scoring.
 *
 * A single wrong frame constant anywhere in that list moves the death frame.
 *
 * The fixtures are committed upstream, vendored here unmodified.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  loadLegacyEndlessReplay, simulateReplay, stackForReplay, usesLegacyPanelSource,
} from '../../core/panels/replay';
import { COUNTDOWN_END } from '../../core/panels/stack';

function fixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

/**
 * Upstream's basicEndlessTest asserts seed 7161965, game_over_clock 402 and
 * score 37 for this replay. All three, plus the panels cleared, must match.
 */
export async function endlessReplayReproducesUpstreamsOutcome(): Promise<void> {
  const replay = loadLegacyEndlessReplay(fixture('v046-Spd1-Dif3-endless.json'));

  assert.strictEqual(replay.seed, 7161965, 'the seed the game was played on');
  assert.strictEqual(replay.engineVersion, '046');
  assert.strictEqual(replay.inputs.length, 403, 'one character per frame');

  const stack = simulateReplay(replay);

  assert.strictEqual(stack.gameOverClock, 402, 'the exact frame the player died on');
  assert.strictEqual(stack.score, 37, 'the exact final score');
  assert.strictEqual(stack.panelsCleared, 3, 'and the panels they managed to clear');
}

/**
 * Engine version selects the panel source, and choosing wrong does not fail
 * loudly - it silently produces a different board. Before the legacy source
 * existed the fixture above died at 336 instead of 402 for exactly this reason.
 */
export async function preO48EngineVersionsUseTheLegacyPanelSource(): Promise<void> {
  assert.strictEqual(usesLegacyPanelSource('045'), true);
  assert.strictEqual(usesLegacyPanelSource('046'), true);
  assert.strictEqual(usesLegacyPanelSource('047'), true);
  assert.strictEqual(usesLegacyPanelSource('048'), false, 'LevelData onward is modern');
  assert.strictEqual(usesLegacyPanelSource('049'), false);
}

/**
 * A longer, busier recording - combined-button inputs, many more matches - run
 * to completion.
 *
 * There is NO published expected outcome for this one, so it deliberately
 * asserts nothing about the score: pinning our own output would enshrine
 * whatever we currently do, bug included. What it proves is that a complex
 * replay drives the engine to a natural end without throwing or hanging.
 */
export async function aLongerReplayRunsToCompletionWithoutFaulting(): Promise<void> {
  const replay = loadLegacyEndlessReplay(fixture('v046-Spd10-Dif3-endless.json'));
  assert.ok(replay.inputs.length > 1000, 'a much longer game than the first fixture');

  const stack = simulateReplay(replay);

  assert.ok(stack.gameEnded(), 'it reached a real game over rather than the frame cap');
  assert.ok(stack.gameOverClock > 0);
  assert.ok(stack.panelsCleared > 0, 'and the player actually cleared panels');
}

/**
 * The countdown positions the cursor before the first input is honoured, and
 * every recorded input is relative to where it stops.
 *
 * Checked at the END OF THE COUNTDOWN, not at game over: with no input the
 * stack still rises, and a rising stack carries the cursor up with it.
 */
export async function theCountdownLeavesTheCursorWhereTheReplayExpectsIt(): Promise<void> {
  const replay = loadLegacyEndlessReplay(fixture('v046-Spd1-Dif3-endless.json'));
  const stack = stackForReplay({ ...replay, inputs: '' });

  for (let frame = 0; frame <= COUNTDOWN_END; frame++) stack.run();

  // Four steps down and two left from the top right of the playfield.
  assert.strictEqual(stack.curRow, stack.height - 1 - 4, 'four steps down');
  assert.strictEqual(stack.curCol, stack.width - 1 - 2, 'and two to the left');
  assert.strictEqual(stack.doCountdown, false, 'and the countdown is over');
}
