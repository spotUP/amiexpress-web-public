/**
 * A GAME THAT ENDS SAYS SO.
 *
 * "the game ended now, no dialog announcing that i won or lost or anything"
 * (sysop, 2026-09-16).
 *
 * Every game pushed one line into the event list and left it at that, so a
 * hand played for ten minutes finished as a row of scrolling text among the
 * chat. There is one announcement now and every game reaches for it - which
 * is the thing this file actually protects: a game added later must end the
 * way the others do ("this goes for all card games dont do changes for only
 * one game", sysop 2026-09-15).
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('gameover');

const read = (path: string): string => readFileSync(join(__dirname, '..', path), 'utf8');

export async function everyGameThatFinishesAnnouncesIt(): Promise<void> {
  // The three that END (poker settles a HAND and deals another, so it has no
  // game over to announce - a dialog every hand would be noise).
  const ends: Array<[string, string]> = [
    ['Skitgubbe (vandtia)', 'lib/games/vandtia/module.ts'],
    ['Skitgubbe (trick-taking)', 'lib/games/skitgubbe/module.ts'],
    ['UNO', 'managers/GameStateManager.ts'],
  ];
  for (const [game, path] of ends) {
    assert.ok(/announceGameOver\(/.test(read(path)), `${game} announces its result`);
  }
}

export async function theAnnouncementIsOneSharedThing(): Promise<void> {
  // One implementation, not three dialogs that drift.
  const host = read('index.ts');
  assert.ok(/public announceGameOver\(/.test(host), 'the door owns the announcement');
  assert.ok(/showMessageDialog/.test(host.slice(host.indexOf('public announceGameOver('))),
    'and it is the dialog every other message uses');
}

export async function theSkitgubbeResultNamesTheLoserAndThePlaces(): Promise<void> {
  /*
   * What the dialog actually says, driven through the real door: the game is
   * ended at a table and the announcement is caught on its way to the screen.
   */
  const { CardLobbyApp } = await import('../index');
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 106, height: 30 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const app: any = new CardLobbyApp({
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: 30, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  } as any);
  void app.run();
  await new Promise((r) => setTimeout(r, 1500));

  try {
    const said: Array<{ title: string; body: string }> = [];
    app.showMessageDialog = async (title: string, body: string) => { said.push({ title, body }); };

    const me = app.currentProfile.userId;
    const table: any = {
      id: 150, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
      smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
      minPlayers: 2, maxPlayers: 3, status: 'open',
      createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
      autoStart: false, isPrivate: false, observers: [],
      players: [{
        userId: me, username: 'sysop', seat: 0, stack: 0, buyIn: 0,
        role: 'player', joinedAt: Date.now(), isBot: false,
      }],
    };
    app.syncBotsForTable(table);
    app.lobby.tables.unshift(table);
    app.currentProfile.currentTableId = 150;
    app.currentProfile.status = 'table';
    await app.persistState();
    await app.dealHand();
    (app.vandtia.constructor as any).BOT_PACE_MS = 0;
    app.vandtia.primaryAction();
    await new Promise((r) => setTimeout(r, 400));

    // Stand the game on its last card: everyone out but one.
    const fresh = app.findTableById(150);
    const loaded = app.vandtia.load(fresh);
    const engine = loaded.engine;
    engine.state.phase = 'over';
    engine.state.loserId = engine.state.players[1].id;
    engine.state.finishedOrder = [engine.state.players[0].id, engine.state.players[2].id];
    fresh.hand.snapshot = engine.serialize();
    await app.persistState();

    await (app.vandtia as any).finalize(fresh, engine);

    assert.strictEqual(said.length, 1, 'the game announced itself once');
    assert.strictEqual(said[0].title, 'Skitgubbe');
    assert.ok(/Skitgubbe/.test(said[0].body), `it names the loser: ${said[0].body}`);
    assert.ok(/1\./.test(said[0].body), 'and the order everybody went out in');
    assert.ok(/\(you\)/.test(said[0].body), 'and which one the caller is');
  } finally { app.screen?.destroy?.(); }
}
