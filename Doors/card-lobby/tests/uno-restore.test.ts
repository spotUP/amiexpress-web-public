/**
 * An UNO table is never handed to the poker engine.
 *
 * Reported live 2026-09-02, one keypress after the sysop worked out that D
 * deals: "failed to restore hand: cannot restore undefined".
 *
 * Both games keep their state in the same place - `table.hand.snapshot` -
 * and `loadTableHand()` restores it with `PokerEngine.restore()`. Twelve
 * call sites asked "is this UNO?" before choosing an engine; two did not,
 * and the table screen calls one of them on every draw, so the notice
 * appeared the moment a game was dealt and again on every repaint.
 *
 * The guard now lives inside `loadTableHand` itself, which is the only place
 * a thirteenth caller cannot forget it.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-uno-restore-'));

function table(id: number, gameId: string): any {
  return {
    id, gameId, gameName: gameId.startsWith('uno') ? 'UNO' : "Texas Hold'em",
    stakesLabel: '10/20', smallBlind: 10, bigBlind: 20, buyIn: 200, entryFee: 0,
    minPlayers: 2, maxPlayers: 4, status: 'in-progress',
    createdAt: Date.now(), updatedAt: Date.now(), hostUserId: 'someone',
    autoStart: false, isPrivate: false, players: [], observers: [],
  };
}

async function openApp(): Promise<any> {
  const { CardLobbyApp } = await import('../index');
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: 25, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  };
  const app: any = new CardLobbyApp(session);
  void app.run();
  await new Promise((r) => setTimeout(r, 1500));
  return app;
}

/** An UNO snapshot is nothing PokerEngine.restore() can read. */
function unoHand(): any {
  return {
    snapshot: { players: [], drawPile: [], discardPile: [], currentColor: 'red' },
    beforeStacks: {},
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export async function anUnoTableHasNoPokerHandToRestore(): Promise<void> {
  const app = await openApp();
  try {
    for (const gameId of ['uno', 'uno-house']) {
      const t = table(7, gameId);
      t.hand = unoHand();
      assert.strictEqual(app.loadTableHand(t), null,
        `${gameId}: the poker restore must decline an UNO table, not throw inside it`);
    }
  } finally { app.screen?.destroy?.(); }
}

export async function decliningIsSilent(): Promise<void> {
  const app = await openApp();
  try {
    const before = (app.lobby?.notices ?? app.notices ?? []).length;

    const t = table(8, 'uno');
    t.hand = unoHand();
    app.loadTableHand(t);
    app.loadTableHand(t);
    app.loadTableHand(t);

    const after = (app.lobby?.notices ?? app.notices ?? []).length;
    assert.strictEqual(after, before,
      'no notice: the table screen calls this on every draw, and the failure used to post one each time');
  } finally { app.screen?.destroy?.(); }
}

export async function aPokerTableStillRestores(): Promise<void> {
  const app = await openApp();
  try {
    const t = table(9, 'holdem');
    assert.strictEqual(app.loadTableHand(t), null, 'a table with no hand yet restores nothing');
  } finally { app.screen?.destroy?.(); }
}
