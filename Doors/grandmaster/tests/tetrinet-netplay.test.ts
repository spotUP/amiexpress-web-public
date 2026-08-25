/**
 * BBS-internal TetriNET multiplayer regression tests.
 *
 * Two GrandmasterNetworkManagers sharing the in-process broker, exactly as
 * two BBS users on different nodes do.
 *
 * What was dead before (2026-08-25): app.ts routed EVERY TetriNET lobby
 * result to `startTetriNetGame()`, which built a purely local game against
 * three bots and constructed TetriNetScreen with no `network` property at
 * all - so the humans who joined the lobby were not in the resulting match.
 * The lobby adapter itself was loopback-only: it pushed actions through
 * `emitNetwork('tetrinet:*')`, which never leaves the process, and listened
 * for the same events coming back.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import { TetriNetScreen } from '../ui/tetrinet-screen';
import { TetriNetAI } from '../ai/tetrinet-ai';
import { TetriNetBrokerTransport } from '../network/tetrinet-broker-transport';
import { TetriNetLobbyAdapter } from '../network/tetrinet-lobby-adapter';
import { GrandmasterNetworkManager } from '../network/network-manager';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const inputStub: any = { on() {}, off() {}, setEnabled() {} };
const appState: any = { settings: { blockGlow: false, glowIntensity: 0, clearStyle: 'instant' } };
const options: any = { classicMode: true, delayBeforeSuddenDeath: 0 };

const settle = (ms = 200) => new Promise(r => setTimeout(r, ms));

function manager(id: string, name: string, node: number): any {
  return new GrandmasterNetworkManager({
    user: { id, username: name },
    bbsSession: { nodeNumber: node },
    nodeNumber: node,
  } as any);
}

function filled(engine: any): number {
  return engine.getBoard().grid.flat().filter((c: any) => c.filled).length;
}

function fillRow(engine: any, y: number): void {
  const board = engine.getBoard();
  for (let x = 0; x < board.width; x++) {
    board.grid[y][x] = { filled: true, color: 'I', locked: true };
  }
}

/** One player's node: engine, screen and transport, wired to the broker. */
function node(net: any, name: string, botCount = 0): any {
  const screen: any = new Screen({ title: `tnet-${name}`, width: 80, height: 30 });
  const engine: any = new TetriNetEngine({} as any, options);
  const transport: any = new TetriNetBrokerTransport(net, name);
  let ai: any = null;
  if (botCount > 0) {
    ai = new TetriNetAI();
    ai.createOpponents(botCount, 5, {} as any, options);
  }
  const scr: any = new TetriNetScreen({
    screen, engine, inputHandler: inputStub, sounds, state: appState,
    network: transport, playerName: name, aiController: ai,
  } as any);
  engine.start();
  return {
    screen, engine, transport, ai, scr, net,
    id: net.getLocalPlayerId(),
    done: () => { transport.dispose(); screen.destroy(); },
  };
}

/** Two nodes in one broker lobby, each aware of the other's field. */
async function match(hostBots = 0): Promise<any> {
  const stamp = Date.now();
  const netA = manager(`tA-${stamp}`, 'alice', 1);
  const netB = manager(`tB-${stamp}`, 'bob', 2);
  const lobbyId = await netA.createLobby('standard', false, 6);
  await settle(120);
  await netB.joinLobby(lobbyId);
  await settle(200);

  const a = node(netA, 'alice', hostBots);
  const b = node(netB, 'bob');

  // One exchange of fields, which is what teaches each side who is present.
  a.scr.publishFields();
  b.scr.publishFields();
  await settle(150);

  return { a, b, done: () => { a.done(); b.done(); } };
}

export async function specialsCrossTheBroker(): Promise<void> {
  const m = await match();
  try {
    fillRow(m.b.engine, 21);
    assert.ok(filled(m.b.engine) > 0, 'test setup');

    m.a.engine.getInventory().add('nuke');
    m.a.engine.useSpecial(m.b.id);
    await settle(150);

    assert.strictEqual(filled(m.b.engine), 0,
      'a nuke aimed at the other node must clear that player\'s board');
  } finally { m.done(); }
}

export async function classicGarbageCrossesTheBroker(): Promise<void> {
  const m = await match();
  try {
    m.a.scr.routeGarbage(2, m.a.id);
    await settle(150);

    assert.ok(filled(m.b.engine) > 0,
      'classic garbage must reach the players on other nodes');
  } finally { m.done(); }
}

export async function switchFieldsSwapsAcrossNodes(): Promise<void> {
  const m = await match();
  try {
    fillRow(m.a.engine, 21);
    fillRow(m.b.engine, 20);
    fillRow(m.b.engine, 21);
    const aBefore = filled(m.a.engine);
    const bBefore = filled(m.b.engine);

    m.a.engine.getInventory().add('switch');
    m.a.engine.useSpecial(m.b.id);
    await settle(250);

    assert.strictEqual(filled(m.b.engine), aBefore, 'bob received alice\'s field');
    assert.strictEqual(filled(m.a.engine), bBefore,
      'and alice received bob\'s - a swap needs the reply half too');
  } finally { m.done(); }
}

export async function hostBotsAppearOnTheOtherNode(): Promise<void> {
  const m = await match(2);
  try {
    m.a.scr.publishFields();
    await settle(150);

    const remotes = Array.from(m.b.scr.remotes.keys());
    assert.ok(remotes.includes('ai-1') && remotes.includes('ai-2'),
      `the host's bots must be visible on the other node, saw ${JSON.stringify(remotes)}`);
    assert.ok(remotes.includes(m.a.id), 'and so must the host');
  } finally { m.done(); }
}

export async function botsAimAtPlayersOnOtherNodes(): Promise<void> {
  const m = await match(1);
  try {
    m.a.scr.refreshOpponents();

    const picks = new Set<string>();
    for (let i = 0; i < 300; i++) picks.add(m.a.ai.pickTarget(m.a.ai.getOpponents()[0]));

    assert.ok(picks.has(m.b.id),
      'a host bot must be able to attack a player on another node');
  } finally { m.done(); }
}

export async function botAttacksReachTheOtherNode(): Promise<void> {
  const m = await match(1);
  try {
    fillRow(m.b.engine, 21);
    const bot = m.a.ai.getOpponents()[0];
    bot.engine.getInventory().add('nuke');
    bot.engine.useSpecial(m.b.id);
    await settle(150);

    assert.strictEqual(filled(m.b.engine), 0,
      'a bot the host simulates must be able to hit a remote player');
  } finally { m.done(); }
}

export async function lastPlayerStandingWinsANetworkedMatch(): Promise<void> {
  const m = await match();
  try {
    m.a.scr.checkVictory();
    assert.strictEqual(m.a.engine.getState().status, 'playing', 'bob is still alive');

    // Bob tops out; his final field carries alive:false.
    m.b.engine.gameOver();
    m.b.scr.publishFields();
    await settle(150);

    m.a.scr.checkVictory();
    assert.strictEqual(m.a.engine.getState().status, 'won',
      'outliving every other node must end the match as a win');
  } finally { m.done(); }
}

export async function settingsChangesReachTheOtherLobby(): Promise<void> {
  const stamp = Date.now();
  const netA = manager(`sA-${stamp}`, 'alice', 1);
  const netB = manager(`sB-${stamp}`, 'bob', 2);
  const lobbyId = await netA.createLobby('standard', false, 6);
  await settle(120);
  await netB.joinLobby(lobbyId);
  await settle(200);

  const hostAdapter: any = new TetriNetLobbyAdapter(netA, netA.getLocalPlayerId(), 'standard');
  const guestAdapter: any = new TetriNetLobbyAdapter(netB, netB.getLocalPlayerId(), 'standard');
  try {
    await hostAdapter.updateSettings({ inventorySize: 5, startingLevel: 9 });
    await settle(200);

    assert.strictEqual(guestAdapter.getGameOptions().inventorySize, 5,
      'a host settings change must reach the other node\'s lobby');
    assert.strictEqual(guestAdapter.getGameOptions().startingLevel, 9);
  } finally {
    hostAdapter.dispose();
    guestAdapter.dispose();
  }
}

export async function everyLobbyPlayerGetsASlot(): Promise<void> {
  const stamp = Date.now();
  const netA = manager(`lA-${stamp}`, 'alice', 1);
  const netB = manager(`lB-${stamp}`, 'bob', 2);
  const lobbyId = await netA.createLobby('standard', false, 6);
  await settle(120);
  await netB.joinLobby(lobbyId);
  await settle(250);

  const adapter: any = new TetriNetLobbyAdapter(netA, netA.getLocalPlayerId(), 'standard');
  try {
    const players = adapter.getState()?.players ?? [];
    assert.strictEqual(players.length, 2,
      `both humans must share ONE lobby, saw ${players.length} - the old adapter gave each node its own`);
    assert.deepStrictEqual(players.map((p: any) => p.slot), [1, 2], 'slots are numbered');
  } finally {
    adapter.dispose();
  }
}
