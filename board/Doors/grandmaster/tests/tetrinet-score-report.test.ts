/**
 * TetriNET score reporting regression tests.
 *
 * A finished TetriNET game reported NOTHING: the high score table, the BBS
 * score server, the livechat feed and the door_score Discord webhook are all
 * fed from a GameResult, and none of the three TetriNET paths ever built
 * one. broadcastScore() has carried a `'tetrinet' -> 'TetriNET'` label
 * branch the whole time that nothing could reach, so TetriNET was the one
 * game on the board whose scores never appeared anywhere.
 *
 * The second test class here is a wiring check: the reporting call has no
 * runtime seam inside app.ts, and "the function exists but nobody calls it"
 * is exactly the failure this door keeps hitting, so the call sites are
 * asserted directly against the source.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildTetriNetResult } from '../core/tetrinet/score-report';
import { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';

const options: any = { classicMode: true, delayBeforeSuddenDeath: 0 };

function finishedEngine(outcome: 'won' | 'gameover'): any {
  const engine: any = new TetriNetEngine({} as any, options);
  engine.start();
  if (outcome === 'won') {
    engine.win();
  } else {
    engine.gameOver();
  }
  return engine;
}

export async function aWinIsReportedAsCompleted(): Promise<void> {
  const result = buildTetriNetResult(finishedEngine('won').getState());

  assert.strictEqual(result.mode, 'tetrinet', 'the mode drives the leaderboard tab and the Discord label');
  assert.strictEqual(result.completed, true, 'outliving everyone completes the mode');
  assert.strictEqual(result.grade, 'WIN');
}

export async function aTopOutIsReportedAsNotCompleted(): Promise<void> {
  const result = buildTetriNetResult(finishedEngine('gameover').getState());

  assert.strictEqual(result.completed, false);
  assert.strictEqual(result.grade, 'OUT', 'TetriNET has no grades; the outcome goes in that field');
}

export async function theResultCarriesTheNumbersTheEmbedShows(): Promise<void> {
  const engine = finishedEngine('gameover');
  const state = engine.getState();

  const result = buildTetriNetResult(state);

  assert.strictEqual(result.score, state.score);
  assert.strictEqual(result.level, state.level);
  assert.strictEqual(result.lines, state.lines);
  assert.strictEqual(result.linesCleared, state.lines);
  assert.strictEqual(result.combo, state.combo);
}

export async function playTimeIsMeasuredFromTheStart(): Promise<void> {
  const engine = finishedEngine('gameover');
  const state: any = engine.getState();
  state.startTime = 1_000;
  state.endTime = 61_000;

  assert.strictEqual(buildTetriNetResult(state).time, 60_000);

  state.endTime = null;
  assert.strictEqual(buildTetriNetResult(state).time, null,
    'an unfinished clock reports no time rather than a bogus one');
}

/** Body of an app.ts method, from its signature to the next member. */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} not found in app.ts`);
  const next = source.indexOf('\n  private ', start + signature.length);
  return source.slice(start, next > 0 ? next : undefined);
}

export async function everyTetriNetPathReportsItsScore(): Promise<void> {
  const source = readFileSync(join(__dirname, '..', 'app.ts'), 'utf8');

  const paths = [
    ['private async startTetriNetGame(', 'local game vs AI'],
    ['private async startTetriNetNetworkGame(', 'BBS-internal multiplayer'],
    ['private async runTetriNetExternalGame(', 'external TetriNET server'],
  ];

  for (const [signature, label] of paths) {
    assert.ok(
      methodBody(source, signature).includes('reportTetriNetScore('),
      `the ${label} path must report its score - an unreported game reaches no leaderboard and no webhook`
    );
  }
}

export async function theNetworkedPathAnnouncesTheMatchResult(): Promise<void> {
  const source = readFileSync(join(__dirname, '..', 'app.ts'), 'utf8');
  const body = methodBody(source, 'private async startTetriNetNetworkGame(');

  assert.ok(/networked:\s*true/.test(body),
    'a multiplayer match must also broadcast who beat whom');
  assert.ok(/finishOrder:/.test(body),
    'and report the finishing order for the winlist');
}
