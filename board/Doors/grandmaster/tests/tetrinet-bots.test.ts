/**
 * TetriNET lobby bot-management regression tests.
 *
 * Symptom (reported live 2026-08-25): starting a local TetriNET game showed
 * "Bot management not available".
 *
 * The lobby widget guards bot actions with
 *   `!isHost || !adapter.fillWithBots || !adapter.removeBots`
 * and the TetriNET adapter implemented only HALF the pair - fillWithBots
 * existed, removeBots did not - so the whole feature was refused and no
 * bots could be added to a local game at all.
 *
 * fillWithBots also still used the old single-argument signature
 * `(difficulty)` while the widget calls `(count, difficulty)`, so the target
 * player count arrived as a difficulty level.
 */

import assert from 'assert';
import { TetriNetLobbyAdapter } from '../network/tetrinet-lobby-adapter';
import { GrandmasterNetworkManager } from '../network/network-manager';

function adapter(): any {
  const net: any = new GrandmasterNetworkManager({
    user: { id: `tn-${Date.now()}`, username: 'sysop' },
    bbsSession: { nodeNumber: 1 },
    nodeNumber: 1,
  } as any);
  return new TetriNetLobbyAdapter(net);
}

export async function exposesBothHalvesOfTheBotContract(): Promise<void> {
  const a = adapter();
  // The widget requires BOTH; having only one refuses bot management outright.
  assert.strictEqual(typeof a.fillWithBots, 'function', 'fillWithBots must exist');
  assert.strictEqual(typeof a.removeBots, 'function', 'removeBots must exist');
}

export async function fillWithBotsReachesTheRequestedCount(): Promise<void> {
  const a = adapter();
  await a.createLobby('standard');
  a.addLocalPlayer('sysop', 1);

  // (count, difficulty) - the widget's calling convention.
  await a.fillWithBots(4, 1);

  const players = a.getState().players;
  assert.ok(players.length >= 4, `expected at least 4 players, got ${players.length}`);
  assert.ok(players.some((p: any) => p.isBot), 'bots must be present');
}

export async function removeBotsClearsOnlyBots(): Promise<void> {
  const a = adapter();
  await a.createLobby('standard');
  a.addLocalPlayer('sysop', 1);
  await a.fillWithBots(4, 1);

  a.removeBots();

  const players = a.getState().players;
  assert.ok(!players.some((p: any) => p.isBot), 'no bots should remain');
  assert.ok(players.some((p: any) => p.name === 'sysop'), 'the human must survive');
}
