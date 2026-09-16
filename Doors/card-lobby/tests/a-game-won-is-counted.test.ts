/**
 * WHO WINS, PER GAME.
 *
 * "skitgubbe can have a highscore list that tracks games won same for uno
 * etc" (sysop, 2026-09-16).
 *
 * The lobby already counted WINS - hands that PAID, a chip delta, which is
 * the right measure for poker and no measure at all for a game played for the
 * title: "skitgubbe is a social game, it requires no buy in" (2026-09-15), so
 * every hand of it settles at zero and nobody has ever won one by that count.
 * A game that ENDS is recorded separately, per game.
 */

import assert from 'assert';
import { Scores } from '../managers/Scores';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('gamescores');

/** A door just real enough to record into. */
function aScoreboard(names: string[]): { scores: Scores; profiles: Record<string, any>; board: string[] } {
  const profiles: Record<string, any> = {};
  names.forEach((name, index) => {
    profiles[`u${index + 1}`] = {
      userId: `u${index + 1}`,
      username: name,
      stats: { handsPlayed: 0, wins: 0, losses: 0, net: 0, biggestPot: 0, winStreak: 0, bestWinStreak: 0,
        daily: { hands: 0, wins: 0, net: 0 }, weekly: { hands: 0, wins: 0, net: 0 } },
      achievements: [],
      wallet: { chips: 0, lifetimeEarned: 0 },
      status: 'lobby',
    };
  });
  const board: string[] = [];
  const scores = new Scores({
    profiles,
    pushNotice: () => {},
    reportToBoard: (type: string, opts?: { key?: string }) => { board.push(`${type}:${opts?.key ?? ''}`); },
  } as never);
  return { scores, profiles, board };
}

export async function aFinishedGameCountsForEverybodyWhoPlayedIt(): Promise<void> {
  const { scores, profiles } = aScoreboard(['Ann', 'Bo', 'Cai']);

  scores.recordGameResult('skitgubbe', ['u1', 'u2', 'u3'], 'u1');

  assert.deepStrictEqual(profiles.u1.stats.byGame.skitgubbe, { played: 1, won: 1 },
    'the winner played one and won one');
  assert.deepStrictEqual(profiles.u2.stats.byGame.skitgubbe, { played: 1, won: 0 },
    'and the others played one - a table of wins with no games beside it says nothing');
}

export async function aGameWonIsReportedToTheBoardAsWell(): Promise<void> {
  // A social game pays nothing, and winning one is still winning.
  const { scores, board } = aScoreboard(['Ann', 'Bo']);
  scores.recordGameResult('skitgubbe', ['u1', 'u2'], 'u1');
  assert.ok(board.includes('door.cardlobby.win:skitgubbe'), board.join(' '));
}

export async function aGameNobodyWonIsStillAGamePlayed(): Promise<void> {
  // Three at a table of trick-taking Skitgubbe: one loses, nobody "wins".
  const { scores, profiles } = aScoreboard(['Ann', 'Bo', 'Cai']);
  scores.recordGameResult('skitgubbe-trick', ['u1', 'u2', 'u3'], null);
  for (const id of ['u1', 'u2', 'u3']) {
    assert.deepStrictEqual(profiles[id].stats.byGame['skitgubbe-trick'], { played: 1, won: 0 });
  }
}

export async function theTableIsOrderedByWinsThenByFewestGames(): Promise<void> {
  // Two players on four wins are not level if one needed twenty games.
  const { scores } = aScoreboard(['Ann', 'Bo', 'Cai']);
  for (let game = 0; game < 4; game += 1) scores.recordGameResult('uno', ['u1', 'u2', 'u3'], 'u1');
  for (let game = 0; game < 6; game += 1) scores.recordGameResult('uno', ['u2', 'u3'], 'u2');
  for (let game = 0; game < 2; game += 1) scores.recordGameResult('uno', ['u2', 'u3'], 'u3');

  const table = scores.table('uno');
  assert.deepStrictEqual(table.map((row) => `${row.username} ${row.won}/${row.played}`),
    ['Bo 6/12', 'Ann 4/4', 'Cai 2/12'],
    'most wins first, and the shorter road breaks a tie');
}

export async function aPlayerWhoHasFinishedNothingIsNotOnTheBoard(): Promise<void> {
  const { scores } = aScoreboard(['Ann', 'Bo']);
  scores.recordGameResult('uno', ['u1'], 'u1');
  assert.deepStrictEqual(scores.table('uno').map((row) => row.username), ['Ann']);
}

export async function everyGameAnybodyHasFinishedIsListed(): Promise<void> {
  const { scores } = aScoreboard(['Ann']);
  scores.recordGameResult('uno', ['u1'], 'u1');
  scores.recordGameResult('skitgubbe', ['u1'], null);
  assert.deepStrictEqual(scores.gamesPlayed(), ['skitgubbe', 'uno']);
}

export async function anOldProfileWithNoRecordIsNotBroken(): Promise<void> {
  // Every profile saved before this existed has no `byGame` at all.
  const { scores, profiles } = aScoreboard(['Ann']);
  delete profiles.u1.stats.byGame;
  assert.deepStrictEqual(scores.table('uno'), [], 'it is empty, not an error');
  scores.recordGameResult('uno', ['u1'], 'u1');
  assert.deepStrictEqual(profiles.u1.stats.byGame.uno, { played: 1, won: 1 });
}

export async function everyGameThatEndsRecordsItsResult(): Promise<void> {
  // The wiring, so a game that ends without recording is caught here rather
  // than by a caller wondering why the board is empty.
  const { readFileSync } = await import('fs');
  const { join } = await import('path');
  const read = (path: string): string => readFileSync(join(__dirname, '..', path), 'utf8');
  for (const [game, path] of [
    ['Skitgubbe (vandtia)', 'lib/games/vandtia/module.ts'],
    ['Skitgubbe (trick-taking)', 'lib/games/skitgubbe/module.ts'],
    ['UNO', 'managers/GameStateManager.ts'],
  ] as Array<[string, string]>) {
    assert.ok(/recordGameResult\(/.test(read(path)), `${game} records its result`);
  }
}
