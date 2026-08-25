/**
 * Spectator regression tests.
 *
 * Watching a match was impossible: the broker's LobbyPlayer type had
 * carried a `spectator` flag since it was written and NOTHING ever set it,
 * lobby:list filtered out every game that was already playing - the only
 * ones worth watching - and there was no viewer.
 *
 * Deliberately mode-agnostic: the TGM modes publish `game:update` and
 * TetriNET publishes `game:tnet_field`, and a spectator renders both.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { GrandmasterNetworkManager } from '../network/network-manager';
import { SpectatorScreen } from '../ui/spectator-screen';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const settle = (ms = 200) => new Promise(r => setTimeout(r, ms));

function manager(id: string, name: string, node: number): any {
  return new GrandmasterNetworkManager({
    user: { id, username: name },
    bbsSession: { nodeNumber: node },
    nodeNumber: node,
  } as any);
}

export async function aSpectatorCanJoinAGameInProgress(): Promise<void> {
  const stamp = Date.now();
  const host = manager(`spH-${stamp}`, 'alice', 1);
  const watcher = manager(`spW-${stamp}`, 'nosy', 2);

  const lobbyId = await host.createLobby('versus_1v1', false, 2);
  await settle(150);
  await host.startMatch();          // the game is now running
  await settle(150);

  await watcher.spectateLobby(lobbyId);
  await settle(200);

  const state = watcher.getMatchState();
  assert.ok(state, 'the spectator is in the lobby');
  assert.ok(state.players.some((p: any) => p.name === 'alice'),
    'and can see who is playing');
}

export async function aFullTableStillAcceptsSpectators(): Promise<void> {
  const stamp = Date.now();
  const host = manager(`fuH-${stamp}`, 'alice', 1);
  const guest = manager(`fuG-${stamp}`, 'bob', 2);
  const watcher = manager(`fuW-${stamp}`, 'nosy', 3);

  // Seats: two, both taken.
  const lobbyId = await host.createLobby('versus_1v1', false, 2);
  await settle(120);
  await guest.joinLobby(lobbyId);
  await settle(150);

  await watcher.spectateLobby(lobbyId);
  await settle(200);

  assert.ok(watcher.getMatchState(), 'a spectator takes no seat, so a full table is fine');
}

export async function runningGamesAreListedForWatching(): Promise<void> {
  const stamp = Date.now();
  const host = manager(`lsH-${stamp}`, 'alice', 1);
  const browser = manager(`lsB-${stamp}`, 'nosy', 2);

  const lobbyId = await host.createLobby('versus_1v1', false, 2);
  await settle(120);
  await host.startMatch();
  await settle(200);

  const joinable = await browser.listLobbies();
  const watchable = await browser.listLobbies({ includeInProgress: true });

  assert.ok(!joinable.some((l: any) => l.id === lobbyId),
    'a game in progress is not offered as somewhere to JOIN');
  assert.ok(watchable.some((l: any) => l.id === lobbyId),
    'but it is offered as somewhere to WATCH - the old filter hid every running game');
}

export async function theViewerRendersBothGameChannels(): Promise<void> {
  const stamp = Date.now();
  const player = manager(`vwP-${stamp}`, 'alice', 1);
  const watcher = manager(`vwW-${stamp}`, 'nosy', 2);

  const lobbyId = await player.createLobby('versus_1v1', false, 6);
  await settle(120);
  await watcher.spectateLobby(lobbyId);
  await settle(200);

  const screen: any = new Screen({ title: 'spectate', width: 80, height: 30 });
  const view: any = new SpectatorScreen({
    screen, network: watcher, sounds, title: 'test match',
  } as any);

  try {
    const board = { width: 10, height: 24, grid: Array.from({ length: 24 }, () => Array.from({ length: 10 }, () => ({ filled: false }))) };
    board.grid[23][0].filled = true;

    // A TGM mode publishes game:update...
    player.sendUpdate({ board, level: 3, score: 100, grade: 'S1', combo: 0 } as any, true);
    // ...and TetriNET publishes game:tnet_field.
    player.sendGameEvent('game:tnet_field', {
      playerId: 'ai-1', name: 'CPU', board, level: 7, alive: true, hasImmunity: false,
    });
    await settle(250);

    assert.strictEqual(view.getWatchedCount(), 2,
      'the viewer must render fields from BOTH game channels');

    view.render();
    const painted = screen.buffer.slice(0, 24)
      .map((row: any) => row.map((c: [number, string]) => c[1]).join(''))
      .join('\n');
    assert.ok(/Watching:/.test(painted), 'and say what it is watching');
    assert.ok(/CPU/.test(painted), 'naming the players it can see');
  } finally {
    view.cleanup();
    screen.destroy();
  }
}

export async function aSpectatorDoesNotBlockTheStart(): Promise<void> {
  // Spectators are marked ready when they join, so a table does not sit
  // waiting for somebody who is only watching.
  const stamp = Date.now();
  const host = manager(`bkH-${stamp}`, 'alice', 1);
  const watcher = manager(`bkW-${stamp}`, 'nosy', 2);

  const lobbyId = await host.createLobby('versus_1v1', false, 2);
  await settle(120);
  await watcher.spectateLobby(lobbyId);
  await settle(200);

  const state = host.getMatchState();
  const spectator = state?.players.find((p: any) => p.name === 'nosy');
  assert.ok(spectator, 'the spectator shows up in the lobby');
  assert.strictEqual(spectator.ready, true, 'already ready, so nobody waits for them');
}
