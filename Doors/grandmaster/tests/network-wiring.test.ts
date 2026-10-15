/**
 * Networked wiring regression tests — two GrandmasterNetworkManagers sharing
 * the in-process broker, exactly as two players on the same BBS do.
 *
 * Guards the three links that were dead (2026-08-25): lobby chat only echoed
 * locally (the other player never saw it), game:attack had a sender with no
 * caller and a receiver with no subscriber, and sendUpdate never carried a
 * death flag so the survivor never learned the opponent topped out.
 */

import assert from 'assert';
import { GrandmasterNetworkManager } from '../network/network-manager';

function manager(id: string, name: string, node: number): any {
  return new GrandmasterNetworkManager({
    user: { id, username: name },
    bbsSession: { nodeNumber: node },
    nodeNumber: node,
  } as any);
}

const settle = (ms = 200) => new Promise(r => setTimeout(r, ms));

async function pair() {
  const a = manager(`uA-${Date.now()}`, 'alice', 1);
  const b = manager(`uB-${Date.now()}`, 'bob', 2);
  const lobbyId = await a.createLobby('versus_1v1', false);
  await settle(120);
  await b.joinLobby(lobbyId);
  await settle(200);
  return { a, b };
}

export async function lobbyChatCrossesTheBroker(): Promise<void> {
  const { a, b } = await pair();
  const got: string[] = [];
  b.on('chat:message', (m: any) => got.push(`${m.playerName}: ${m.text}`));
  a.sendLobbyChat('hello bob');
  await settle();
  assert.deepStrictEqual(got, ['alice: hello bob']);
}

export async function chatEchoesBackToSender(): Promise<void> {
  // The adapter no longer appends locally — the sender's own message must
  // come back via the broker broadcast or it would vanish from their log.
  const { a } = await pair();
  const got: string[] = [];
  a.on('chat:message', (m: any) => got.push(m.text));
  a.sendLobbyChat('echo check');
  await settle();
  assert.deepStrictEqual(got, ['echo check']);
}

export async function attacksCrossTheBroker(): Promise<void> {
  const { a, b } = await pair();
  const got: Array<{ from: string; lines: number }> = [];
  b.onAttack((at: any) => got.push({ from: at.from, lines: at.lines }));
  a.sendAttack({ from: a.getLocalPlayerId(), to: null, lines: 3, type: 'triple', combo: 0, backToBack: false });
  await settle();
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].lines, 3);
  assert.strictEqual(got[0].from, a.getLocalPlayerId());
}

export async function deathNoticeReachesOpponent(): Promise<void> {
  const { a, b } = await pair();
  const seen: Array<{ alive?: boolean }> = [];
  b.onUpdate((u: any) => seen.push({ alive: u.alive }));
  a.sendUpdate({ board: { width: 10, height: 24, grid: [] }, level: 1, score: 0, grade: '9', combo: 0 } as any, false);
  await settle();
  assert.ok(seen.some(u => u.alive === false), 'bob must see alive:false');
}
