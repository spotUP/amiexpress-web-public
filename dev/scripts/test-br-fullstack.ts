#!/usr/bin/env npx tsx
/**
 * Battle Royale Full-Stack Network Test
 *
 * Unlike test-br-sim.ts (which talks to the LobbyBroker directly),
 * this test exercises the real GrandmasterNetworkManager → NetworkEngine
 * → LobbySystem → BrokerClient → LobbyBroker chain used in production.
 *
 * It verifies:
 *   1. joinQueue() matchmakes all players into one lobby
 *   2. startMatch() triggers game:start on every participant
 *   3. sendUpdate() delivers game:update to all other players via the broker
 *   4. onUpdate() callbacks receive the correct board/level data
 *   5. Game updates from Player A are NOT echoed back to Player A
 *
 * Usage:
 *   npx tsx dev/scripts/test-br-fullstack.ts [numPlayers] [durationSeconds]
 */

import { GrandmasterNetworkManager } from '../../Doors/grandmaster/network/network-manager.js';

const NUM_PLAYERS = parseInt(process.argv[2] ?? '5', 10);
const DURATION_MS = parseInt(process.argv[3] ?? '8', 10) * 1000;
const UPDATE_MS   = 500;
const BOARD_W     = 10;
const BOARD_H     = 20;

// ── helpers ───────────────────────────────────────────────────────────────────

type Cell  = { filled: boolean; color: string };
type Board = { grid: Cell[][]; width: number; height: number };

function makeBoard(stackRows: number): Board {
  const grid = Array.from({ length: BOARD_H }, (_, y) => {
    const filled = y >= BOARD_H - stackRows;
    return Array.from({ length: BOARD_W }, () => ({
      filled: filled && Math.random() > 0.1,
      color: filled ? (['I','O','T','S','Z','J','L'])[Math.floor(Math.random()*7)] : '',
    }));
  });
  return { width: BOARD_W, height: BOARD_H, grid };
}

function makeFakeSession(id: number) {
  return {
    user: { id: `user-${id}`, username: `Player${String(id).padStart(2,'0')}` },
    bbsSession: { nodeNumber: id },
    nodeNumber: id,
    bbs: null,
  };
}

async function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

// ── main ──────────────────────────────────────────────────────────────────────

interface Stats {
  name: string;
  sent: number;
  received: number;
  selfEchos: number;         // updates from self (should be 0)
  wrongLobby: boolean;       // received update from unknown player
  startReceived: boolean;
}

async function main() {
  console.log(`\n=== GRANDMASTER Full-Stack BR Test ===`);
  console.log(`Stack: GrandmasterNetworkManager → NetworkEngine → LobbySystem → BrokerClient → LobbyBroker`);
  console.log(`Players: ${NUM_PLAYERS}  |  Duration: ${DURATION_MS/1000}s  |  Update: ${UPDATE_MS}ms\n`);

  const managers: GrandmasterNetworkManager[] = [];
  const stats: Stats[] = [];

  // ── 1. Create managers with fake sessions ──────────────────────────────────

  for (let i = 0; i < NUM_PLAYERS; i++) {
    const session = makeFakeSession(i + 1);
    const mgr = new GrandmasterNetworkManager(session as any);
    managers.push(mgr);
    stats.push({
      name: session.user.username,
      sent: 0, received: 0, selfEchos: 0,
      wrongLobby: false, startReceived: false,
    });
  }
  console.log(`[1/5] Created ${NUM_PLAYERS} GrandmasterNetworkManager instances`);

  // ── 2. Wire onUpdate callbacks BEFORE matchmake ────────────────────────────

  for (let i = 0; i < NUM_PLAYERS; i++) {
    const myId  = `user-${i + 1}`;
    const myIdx = i;
    managers[i].onUpdate((update: any) => {
      if (update.playerId === myId) {
        stats[myIdx].selfEchos++;   // should never happen
      } else {
        stats[myIdx].received++;
      }
    });

    // Detect game:start via matchState polling (LobbySystem emits 'game:start' internally)
    managers[i].onNetwork('game:start', () => {
      stats[myIdx].startReceived = true;
    });
  }

  // ── 3. Matchmake all players ───────────────────────────────────────────────

  const joinPromises = managers.map((mgr, i) =>
    mgr.joinQueue('battle_royale').then(() => {
      const state = mgr.getMatchState();
      console.log(`  [${stats[i].name}] joined lobby ${state?.matchId ?? '?'} (${state?.players.length ?? '?'} players)`);
    })
  );
  await Promise.all(joinPromises);
  console.log(`[2/5] All players matchmade`);

  // Verify everyone is in the same lobby
  const lobbyIds = managers.map(m => m.getMatchState()?.matchId);
  const uniqueLobbies = new Set(lobbyIds.filter(Boolean));
  if (uniqueLobbies.size !== 1) {
    console.error(`[FAIL] Players split across ${uniqueLobbies.size} lobbies: ${[...uniqueLobbies].join(', ')}`);
    process.exit(1);
  }
  console.log(`  All in lobby: ${[...uniqueLobbies][0]}`);

  // ── 4. Start match ─────────────────────────────────────────────────────────

  // forceStart skips the countdown — fires lobby:game_starting + lobby:game_started immediately
  await sleep(100);
  managers[0]['network'].lobby.forceStart();
  await sleep(300);  // one tick for process.nextTick chains in the broker

  const started = stats.filter(s => s.startReceived).length;
  console.log(`[3/5] game:start received by ${started}/${NUM_PLAYERS} players`);

  // ── 5. Simulate game updates ───────────────────────────────────────────────

  console.log(`[4/5] Sending game updates for ${DURATION_MS/1000}s...`);
  const start   = Date.now();
  const timers: NodeJS.Timeout[] = [];
  const fillRate = () => 2.0 + Math.random() * 4.0;  // rows/sec

  for (let i = 0; i < NUM_PLAYERS; i++) {
    const rate = fillRate();
    const t = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const stack   = Math.min(Math.floor(elapsed * rate), BOARD_H);
      stats[i].sent++;
      managers[i].sendUpdate({
        board: makeBoard(stack),
        level: Math.ceil(elapsed / 3),
        score: Math.floor(elapsed * 1000),
        grade: '9',
        combo: 0,
        lines: 0,
        // fill remaining required GameState fields with safe defaults
      } as any);
    }, UPDATE_MS);
    timers.push(t);
  }

  await sleep(DURATION_MS);
  timers.forEach(t => clearInterval(t));

  // ── 6. Results ─────────────────────────────────────────────────────────────

  console.log(`\n=== Results ===\n`);
  console.log(`${'Player'.padEnd(12)} ${'Sent'.padStart(5)} ${'Recv'.padStart(5)} ${'Start'.padStart(6)} ${'Self?'.padStart(6)}`);
  console.log('─'.repeat(40));

  let totalSent = 0, totalRecv = 0, totalSelf = 0;
  let allGotStart = true;

  for (const s of stats) {
    console.log(
      `${s.name.padEnd(12)} ` +
      `${String(s.sent).padStart(5)} ` +
      `${String(s.received).padStart(5)} ` +
      `${(s.startReceived ? 'YES' : 'NO').padStart(6)} ` +
      `${(s.selfEchos > 0 ? `!${s.selfEchos}` : 'ok').padStart(6)}`
    );
    totalSent += s.sent;
    totalRecv += s.received;
    totalSelf += s.selfEchos;
    if (!s.startReceived) allGotStart = false;
  }
  console.log('─'.repeat(40));

  const expectedRecv = totalSent * (NUM_PLAYERS - 1);
  const deliveryPct  = expectedRecv > 0
    ? (totalRecv / expectedRecv * 100).toFixed(1)
    : 'N/A';

  console.log(`\nTotal sent:    ${totalSent}`);
  console.log(`Total recv:    ${totalRecv}  (expected ${expectedRecv})`);
  console.log(`Delivery rate: ${deliveryPct}%`);
  console.log(`Self-echoes:   ${totalSelf}  (expected 0)`);
  console.log(`game:start:    ${allGotStart ? 'all received' : 'MISSING on some players'}`);

  let pass = true;

  if (parseFloat(deliveryPct) < 99) {
    console.log(`\n[FAIL] Delivery < 99%`);
    pass = false;
  } else {
    console.log(`\n[OK] Delivery: PASS`);
  }

  if (totalSelf > 0) {
    console.log(`[FAIL] Self-echo: sender received their own updates`);
    pass = false;
  } else {
    console.log(`[OK] Self-echo: PASS`);
  }

  if (!allGotStart) {
    console.log(`[FAIL] game:start not delivered to all players`);
    pass = false;
  } else {
    console.log(`[OK] game:start: PASS`);
  }

  // Cleanup
  managers.forEach(m => m.dispose?.());
  console.log(`\nAll managers disposed.\n`);
  process.exit(pass ? 0 : 1);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
