/**
 * Q LEAVES ONE ROOM AT A TIME.
 *
 * "pressing q in a cardgame exits to the bbs instead of the lobby" (sysop,
 * 2026-09-16).
 *
 * Q sits among the keys a caller presses constantly, and from a table it used
 * to drop them out of the DOOR - out of a hand they were in the middle of,
 * past the lobby they came from, with no way back. A caller at a table is in
 * two rooms, so Q leaves the inner one; from the lobby, where leaving is what
 * Q means, it leaves the door.
 */

import assert from 'assert';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('qexit');

async function openApp(): Promise<any> {
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
  return app;
}

/** Answer every question with yes, and count what the door tried to do. */
function watchTheDoor(app: any): { asked: string[]; left: number } {
  const watch = { asked: [] as string[], left: 0 };
  app.dialogManager.showYesNoDialog = async (title: string) => { watch.asked.push(title); return true; };
  app.exitDoor = () => { watch.left += 1; };
  return watch;
}

async function seatedAtATable(app: any, id: number): Promise<void> {
  const me = app.currentProfile.userId;
  const table: any = {
    id, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
    smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
    minPlayers: 2, maxPlayers: 3, status: 'open',
    createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
    autoStart: false, isPrivate: false, observers: [],
    players: [{
      userId: me, username: 'sysop', seat: 0, stack: 0, buyIn: 0,
      role: 'player', joinedAt: Date.now(), isBot: false,
    }],
  };
  app.lobby.tables.unshift(table);
  app.currentProfile.currentTableId = id;
  app.currentProfile.status = 'table';
  await app.persistState();
  app.applyViewMode('table');
}

export async function qAtATableGoesBackToTheLobby(): Promise<void> {
  const app = await openApp();
  try {
    await seatedAtATable(app, 160);
    const watch = watchTheDoor(app);

    (app.screen as any)._handleKey('q', { name: 'q', full: 'q', ch: 'q' });
    await new Promise((r) => setTimeout(r, 400));

    assert.strictEqual(watch.left, 0, 'it did not leave the door');
    assert.deepStrictEqual(watch.asked, ['Leave the table?'],
      'and it asked about the table, not the BBS');
    assert.strictEqual(app.currentProfile.currentTableId, undefined,
      'the caller is back in the lobby');
  } finally { app.screen?.destroy?.(); }
}

export async function qInTheLobbyLeavesTheDoor(): Promise<void> {
  const app = await openApp();
  try {
    app.applyViewMode('lobby');
    const watch = watchTheDoor(app);

    (app.screen as any)._handleKey('q', { name: 'q', full: 'q', ch: 'q' });
    await new Promise((r) => setTimeout(r, 300));

    assert.deepStrictEqual(watch.asked, ['Leave the Card Lobby?'], 'it asks first');
    assert.strictEqual(watch.left, 1, 'and then leaves');
  } finally { app.screen?.destroy?.(); }
}

export async function qAlwaysAsksBeforeAnythingHappens(): Promise<void> {
  // "pressing q exits the cardlobby to the bbs without any confirm dialogue"
  // (sysop, 2026-09-16) - said of the door, and true of the table as well.
  const app = await openApp();
  try {
    await seatedAtATable(app, 161);
    const watch = { asked: 0, left: 0 };
    app.dialogManager.showYesNoDialog = async () => { watch.asked += 1; return false; };
    app.exitDoor = () => { watch.left += 1; };

    (app.screen as any)._handleKey('q', { name: 'q', full: 'q', ch: 'q' });
    await new Promise((r) => setTimeout(r, 300));

    assert.strictEqual(watch.asked, 1, 'it asked');
    assert.strictEqual(watch.left, 0, 'and a no leaves nothing');
    assert.strictEqual(app.currentProfile.currentTableId, 161, 'the caller is still at the table');
  } finally { app.screen?.destroy?.(); }
}
