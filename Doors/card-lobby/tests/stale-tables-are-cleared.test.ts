/**
 * A TABLE NOBODY IS AT GOES AWAY.
 *
 * "stale games needs to be cleared from the lobby", and "ai players needs to
 * count as nobody in this case" (sysop, 2026-09-16). Nothing ever removed a
 * table, so they accumulated for as long as the board has been up - the lobby
 * found on 2026-09-15 held 120 - and a caller looking for a game read past
 * every table anyone had ever opened.
 *
 * The rules are pure (`lib/stale-tables.ts`) and are asked directly here,
 * clock included, so half an hour of staleness costs no time at all.
 */

import assert from 'assert';
import { pruneStaleTables, STALE_AFTER_MS } from '../lib/stale-tables';

const NOW = 1_700_000_000_000;

function aTable(over: Partial<Record<string, unknown>> = {}): any {
  return {
    id: 1, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
    smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
    minPlayers: 2, maxPlayers: 3, status: 'open',
    createdAt: NOW, updatedAt: NOW, hostUserId: '1',
    autoStart: false, isPrivate: false, observers: [],
    players: [{
      userId: '1', username: 'sysop', seat: 0, stack: 0, buyIn: 0,
      role: 'player', joinedAt: NOW, isBot: false,
    }],
    ...over,
  };
}

const bots = (count: number) => Array.from({ length: count }, (_, seat) => ({
  userId: `cpu:1:${seat}`, username: `Nova-${seat}`, seat, stack: 0, buyIn: 0,
  role: 'player', joinedAt: NOW, isBot: true,
}));

export async function aTableWithAHumanAtItIsKept(): Promise<void> {
  const { kept, removed } = pruneStaleTables([aTable()], { now: NOW });
  assert.strictEqual(kept.length, 1);
  assert.strictEqual(removed.length, 0);
}

export async function aTableOfNothingButBotsIsCleared(): Promise<void> {
  // "ai players needs to count as nobody in this case".
  const { kept, removed } = pruneStaleTables([aTable({ players: bots(3) })], { now: NOW });
  assert.strictEqual(kept.length, 0, 'bots are not company');
  assert.strictEqual(removed.length, 1);
}

export async function anEmptyTableIsCleared(): Promise<void> {
  const { removed } = pruneStaleTables([aTable({ players: [] })], { now: NOW });
  assert.strictEqual(removed.length, 1);
}

export async function aBotTableMidHandIsLeftToTheClock(): Promise<void> {
  /*
   * A game in play is never swept out from under itself - but nothing drives
   * those bots without a door watching them, so the clock still collects it.
   */
  const playing = aTable({ players: bots(3), hand: { snapshot: {}, beforeStacks: {} } });
  assert.strictEqual(pruneStaleTables([playing], { now: NOW }).kept.length, 1,
    'not while a hand is in progress');

  const later = NOW + STALE_AFTER_MS;
  assert.strictEqual(pruneStaleTables([playing], { now: later }).removed.length, 1,
    'but half an hour of silence means nobody is playing it');
}

export async function aTableNobodyHasTouchedForHalfAnHourGoes(): Promise<void> {
  const forgotten = aTable({ updatedAt: NOW - STALE_AFTER_MS });
  const { removed } = pruneStaleTables([forgotten], { now: NOW });
  assert.strictEqual(removed.length, 1, 'even with a human seated, nobody is there');
}

export async function aTableInUseIsKeptHoweverLongTheGameRuns(): Promise<void> {
  // Two players thinking hard are not an empty room: every action stamps
  // `updatedAt`, so a table in use never reaches the threshold.
  const busy = aTable({ updatedAt: NOW - 60_000 });
  assert.strictEqual(pruneStaleTables([busy], { now: NOW }).kept.length, 1);
}

export async function theCallersOwnTableIsNeverTakenAway(): Promise<void> {
  /*
   * A player who steps away from the keyboard mid-hand must not come back to
   * a lobby that has forgotten their game.
   */
  const mine = aTable({ id: 7, players: bots(2), updatedAt: NOW - STALE_AFTER_MS * 10 });
  const { kept, removed } = pruneStaleTables([mine], { now: NOW, keepTableId: 7 });
  assert.strictEqual(kept.length, 1, 'kept whatever the clock says');
  assert.strictEqual(removed.length, 0);
}

export async function theOrderOfWhatIsKeptIsUnchanged(): Promise<void> {
  const a = aTable({ id: 1 });
  const dead = aTable({ id: 2, players: bots(2) });
  const c = aTable({ id: 3 });
  const { kept } = pruneStaleTables([a, dead, c], { now: NOW });
  assert.deepStrictEqual(kept.map((table: any) => table.id), [1, 3],
    'the lobby keeps its order, minus what went');
}
