/**
 * A battle royale is 99 players.
 *
 * Reported 2026-09-01: "in gmaster only one bot joins in battle royale 99,
 * that's not much of a battle royale". The menu has said 99 since the mode
 * existed; the lobby adapter filled to a hardcoded TWO, so the field was
 * you and one CPU.
 *
 * There were two tables and they disagreed - bot-lobby.ts recommended five
 * bots and nothing called it, while the adapter's own literal said two and
 * ran. One table now, in the file that also makes the bots.
 *
 * The number is affordable, measured rather than assumed: 98 bots playing
 * thirty seconds of game time cost 0.16 ms per frame against a 50 ms tick,
 * and all 98 were laying pieces.
 */

import assert from 'assert';
import {
  modePlayerTarget, getRecommendedBotCount, fillLobbyWithBots, generateBotPlayers,
} from '../network/bot-lobby';
import { VersusAI } from '../ai/versus-ai';
import { MinimapRenderer } from '../ui/minimap';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const settings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
};

function human(id: string): any {
  return { id, name: id, rank: 1000, rating: 1000, ready: true, isBot: false };
}

export async function aBattleRoyaleIsNinetyNinePlayers(): Promise<void> {
  assert.strictEqual(modePlayerTarget('battle_royale'), 99,
    'the mode is called Battle Royale (99) in the menu and must field 99');
  assert.strictEqual(modePlayerTarget('versus_1v1'), 2);
  assert.strictEqual(modePlayerTarget('team_2v2'), 4);
  assert.strictEqual(modePlayerTarget('something_else'), 2, 'an unknown mode is a duel');
}

export async function theTwoTablesAgree(): Promise<void> {
  // The defect was two answers to one question, and only the wrong one had
  // a caller.
  for (const mode of ['versus_1v1', 'team_2v2', 'battle_royale']) {
    assert.strictEqual(getRecommendedBotCount(mode), modePlayerTarget(mode) - 1,
      `${mode}: the bot count and the player target must be the same fact`);
  }
}

export async function oneHumanIsJoinedByNinetyEightBots(): Promise<void> {
  const filled = fillLobbyWithBots([human('sysop')], modePlayerTarget('battle_royale'), 5);
  assert.strictEqual(filled.length, 99);
  assert.strictEqual(filled.filter(p => p.isBot).length, 98);
  assert.strictEqual(filled.filter(p => !p.isBot).length, 1);
}

export async function humansTakeTheirSeatsFirst(): Promise<void> {
  const filled = fillLobbyWithBots([human('a'), human('b'), human('c')], 99, 5);
  assert.strictEqual(filled.length, 99, 'the field is still 99');
  assert.strictEqual(filled.filter(p => p.isBot).length, 96, 'and the bots make up the rest');
}

export async function everyBotHasItsOwnIdentity(): Promise<void> {
  // 98 bots sharing an id would collapse into one entry in the tracker,
  // which keys by id - the field would look like a handful of players.
  const bots = generateBotPlayers(98, 5);
  assert.strictEqual(new Set(bots.map(b => b.id)).size, 98);
}

export async function ninetyEightBotsAllActuallyPlay(): Promise<void> {
  // The cheap way to "support" 99 is to create engines that never move.
  const ai: any = new VersusAI();
  const opponents = ai.createOpponents(98, 5, settings, sounds);
  try {
    for (let frame = 0; frame < 400; frame++) ai.update(50);   // 20s of play
    const playing = opponents.filter((o: any) =>
      o.engine.getState().board.grid.flat().some((c: any) => c.filled)).length;
    assert.strictEqual(playing, 98, 'every CPU in the field is laying pieces');
  } finally {
    ai.cleanup?.();
  }
}

export async function theGridSaysHowManyItIsNotShowing(): Promise<void> {
  // 18 names out of 98, with nothing to say so, reads as the whole field.
  const renderer = new MinimapRenderer({ height: 10, compact: true });
  const board: any = {
    width: 10, height: 22,
    grid: Array.from({ length: 22 }, () => Array.from({ length: 10 }, () => ({ filled: false }))),
  };
  const opponents = Array.from({ length: 98 }, (_, i) => ({
    id: `b${i}`, name: `CPU${i}`, board, level: 1, grade: '9', alive: true, isBot: true, rank: i + 1,
  }));

  let content = '';
  const container: any = { width: 41, setContent: (c: string) => { content = c; }, screen: null };
  renderer.renderBuckets(container, opponents as any, 41);

  const lines = content.split('\n');
  const listed = lines.filter(l => /CPU\d/.test(l)).length;
  assert.ok(listed > 0 && listed <= 18, `the list holds what fits, saw ${listed}`);
  assert.ok(content.includes('more still playing'),
    'and the tail says how many are not on it');
  assert.ok(content.includes(String(98 - listed)), 'with the right number');
}

export async function aWideGridShowsFourTimesTheField(): Promise<void> {
  // "since we made it responsive space is not an issue at least" - so the
  // list lays itself out in columns rather than stopping at the eighteen
  // rows an 80-column panel has.
  const renderer = new MinimapRenderer({ height: 10, compact: true });
  const board: any = {
    width: 10, height: 22,
    grid: Array.from({ length: 22 }, () => Array.from({ length: 10 }, () => ({ filled: false }))),
  };
  const opponents = Array.from({ length: 98 }, (_, i) => ({
    id: `b${i}`, name: `CPU${i}`, board, level: 1, grade: '9', alive: true, isBot: true, rank: i + 1,
  }));

  const listed = (width: number, height: number): number => {
    let content = '';
    const container: any = { width, height, setContent: (c: string) => { content = c; }, screen: null };
    renderer.renderBuckets(container, opponents as any, width);
    return content.split('\n')
      .flatMap(line => line.match(/CPU\d+/g) ?? []).length;
  };

  const narrow = listed(41, 20);      // the 80-column panel
  const wide = listed(160, 20);       // a responsive terminal
  assert.ok(narrow > 0 && narrow <= 18, `80 columns lists what it can, saw ${narrow}`);
  assert.ok(wide >= narrow * 3, `a 160-column panel lists far more, saw ${wide} against ${narrow}`);

  // And no row may run past the panel it is drawn in.
  let content = '';
  const container: any = { width: 160, height: 20, setContent: (c: string) => { content = c; }, screen: null };
  renderer.renderBuckets(container, opponents as any, 160);
  for (const line of content.split('\n')) {
    const printable = line.replace(/\{[^}]*\}/g, '');
    assert.ok(printable.length <= 160, `"${printable}" (${printable.length}) fits in 160 columns`);
  }
}

export async function theTallerThePanelTheMoreItLists(): Promise<void> {
  const renderer = new MinimapRenderer({ height: 10, compact: true });
  const board: any = {
    width: 10, height: 22,
    grid: Array.from({ length: 22 }, () => Array.from({ length: 10 }, () => ({ filled: false }))),
  };
  const opponents = Array.from({ length: 98 }, (_, i) => ({
    id: `b${i}`, name: `CPU${i}`, board, level: 1, grade: '9', alive: true, isBot: true, rank: i + 1,
  }));
  const listed = (height: number): number => {
    let content = '';
    const container: any = { width: 41, height, setContent: (c: string) => { content = c; }, screen: null };
    renderer.renderBuckets(container, opponents as any, 41);
    return content.split('\n').flatMap(l => l.match(/CPU\d+/g) ?? []).length;
  };
  assert.ok(listed(38) > listed(20), 'a taller terminal shows more of the field');
}
