/**
 * TetriNET winlist regression tests.
 *
 * TetriNET ranks players by WINS, not by score. The reference server
 * (TetriNET2.Server/Game.cs, end of game) awards 3 points to the winner,
 * then walks the players who lost in order of latest death giving 2 and 1,
 * and stops. Entries accumulate across games, keyed by player and team.
 *
 * The lobby's Winlist tab was filled from the door's own high score table,
 * so a big solo score outranked somebody who actually won matches.
 */

import assert from 'assert';
import { awardPoints, WIN_POINTS, type WinListEntry } from '../core/tetrinet/winlist';

export async function theWinnerTakesThreeAndTheNextTwoScoreTwoAndOne(): Promise<void> {
  const entries = awardPoints([], [
    { name: 'winner' },
    { name: 'second' },
    { name: 'third' },
  ]);

  assert.deepStrictEqual(WIN_POINTS, [3, 2, 1], 'the reference server\'s points');
  assert.strictEqual(entries.find(e => e.name === 'winner')?.points, 3);
  assert.strictEqual(entries.find(e => e.name === 'second')?.points, 2);
  assert.strictEqual(entries.find(e => e.name === 'third')?.points, 1);
}

export async function nobodyBelowThirdScores(): Promise<void> {
  const entries = awardPoints([], [
    { name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' },
  ]);

  assert.strictEqual(entries.find(e => e.name === 'd'), undefined, 'fourth place scores nothing');
  assert.strictEqual(entries.find(e => e.name === 'e'), undefined);
}

export async function pointsAccumulateAcrossGames(): Promise<void> {
  let entries: WinListEntry[] = awardPoints([], [{ name: 'sysop' }, { name: 'bot' }]);
  entries = awardPoints(entries, [{ name: 'bot' }, { name: 'sysop' }]);

  assert.strictEqual(entries.find(e => e.name === 'sysop')?.points, 3 + 2);
  assert.strictEqual(entries.find(e => e.name === 'bot')?.points, 2 + 3);
  assert.strictEqual(entries.find(e => e.name === 'sysop')?.games, 2);
}

export async function theTableIsSortedByPoints(): Promise<void> {
  let entries = awardPoints([], [{ name: 'loser' }, { name: 'nobody' }]);
  entries = awardPoints(entries, [{ name: 'champ' }]);
  entries = awardPoints(entries, [{ name: 'champ' }]);

  assert.strictEqual(entries[0].name, 'champ', 'most points first');
  assert.strictEqual(entries[0].points, 6);
}

export async function theSameNickOnTwoTeamsKeepsTwoRecords(): Promise<void> {
  // The reference keys its entries on player AND team.
  let entries = awardPoints([], [{ name: 'ace', team: 'red' }]);
  entries = awardPoints(entries, [{ name: 'ace', team: 'blue' }]);

  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries.find(e => e.team === 'red')?.points, 3);
  assert.strictEqual(entries.find(e => e.team === 'blue')?.points, 3);
}

export async function anEmptyResultChangesNothing(): Promise<void> {
  const before = awardPoints([], [{ name: 'sysop' }]);
  const after = awardPoints(before, []);

  assert.deepStrictEqual(after, before, 'a match with no winner records nothing');
}

/** A finished match reported by the screen, end to end. */
export async function theScreenReportsWhoFinishedWhere(): Promise<void> {
  const { Screen } = await import('@amiexpress/bbs-door-sdk/engines/ui/blessed');
  const { TetriNetEngine } = await import('../core/tetrinet/tetrinet-engine');
  const { TetriNetScreen } = await import('../ui/tetrinet-screen');
  const { TetriNetAI } = await import('../ai/tetrinet-ai');

  const screen: any = new (Screen as any)({ title: 'tnet-winlist', width: 80, height: 30 });
  const engine: any = new (TetriNetEngine as any)({} as any, { nextPieceDelayMs: 0, delayBeforeSuddenDeath: 0 } as any);
  const ai: any = new (TetriNetAI as any)();
  const bots = ai.createOpponents(3, 5, {} as any, { nextPieceDelayMs: 0 } as any);
  const scr: any = new (TetriNetScreen as any)({
    screen, engine,
    inputHandler: { on() {}, off() {}, setEnabled() {}, getConfig() { return {}; }, updateConfig() {} } as any,
    sounds: { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} } as any,
    state: { settings: {} } as any, network: null, playerName: 'sysop', aiController: ai,
  } as any);

  try {
    engine.start();
    scr.refreshOpponents();          // everyone alive

    bots[1].alive = false;           // ai-2 dies first
    scr.refreshOpponents();
    bots[0].alive = false;           // then ai-1
    scr.refreshOpponents();
    bots[2].alive = false;           // ai-3 dies last
    scr.refreshOpponents();

    const order = scr.getFinishOrder().map((p: any) => p.name);

    assert.strictEqual(order[0], 'sysop', 'the survivor won');
    assert.strictEqual(order[1], bots[2].name, 'the last to die is runner-up');
    assert.strictEqual(order[2], bots[0].name, 'then the one before that');
  } finally { screen.destroy(); }
}

export async function anAbandonedMatchScoresNobody(): Promise<void> {
  const { Screen } = await import('@amiexpress/bbs-door-sdk/engines/ui/blessed');
  const { TetriNetEngine } = await import('../core/tetrinet/tetrinet-engine');
  const { TetriNetScreen } = await import('../ui/tetrinet-screen');
  const { TetriNetAI } = await import('../ai/tetrinet-ai');

  const screen: any = new (Screen as any)({ title: 'tnet-winlist2', width: 80, height: 30 });
  const engine: any = new (TetriNetEngine as any)({} as any, { nextPieceDelayMs: 0, delayBeforeSuddenDeath: 0 } as any);
  const ai: any = new (TetriNetAI as any)();
  ai.createOpponents(3, 5, {} as any, { nextPieceDelayMs: 0 } as any);
  const scr: any = new (TetriNetScreen as any)({
    screen, engine,
    inputHandler: { on() {}, off() {}, setEnabled() {}, getConfig() { return {}; }, updateConfig() {} } as any,
    sounds: { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} } as any,
    state: { settings: {} } as any, network: null, playerName: 'sysop', aiController: ai,
  } as any);

  try {
    engine.start();
    scr.refreshOpponents();
    // The human quits with three bots still playing: no single survivor, so
    // the reference server records nothing and neither do we.
    engine.gameOver();

    assert.deepStrictEqual(scr.getFinishOrder(), []);
  } finally { screen.destroy(); }
}
