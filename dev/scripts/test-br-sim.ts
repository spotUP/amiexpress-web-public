#!/usr/bin/env npx tsx
/**
 * Battle Royale Network Simulation
 *
 * Creates N virtual players that connect to the in-process lobby broker,
 * matchmake into a battle_royale lobby, start the game, and exchange
 * live game:update events for 20 seconds.
 *
 * Usage:
 *   npx tsx dev/scripts/test-br-sim.ts [numPlayers]
 *
 * Example:
 *   npx tsx dev/scripts/test-br-sim.ts 8
 */

import { BrokerClient } from '../../sdk/engines/network/broker/broker-client.js';
import { LobbyBroker } from '../../sdk/engines/network/broker/lobby-broker.js';

// ── config ────────────────────────────────────────────────────────────────────

const NUM_PLAYERS   = parseInt(process.argv[2] ?? '6', 10);
const DURATION_MS   = parseInt(process.argv[3] ?? '20', 10) * 1000;  // simulation length (seconds)
const UPDATE_INTERVAL = 500;    // board update rate (ms)
const BOARD_W = 10;
const BOARD_H = 20;

// ── helpers ───────────────────────────────────────────────────────────────────

type Cell  = { filled: boolean; color: string };
type Board = { grid: Cell[][]; width: number; height: number };

function emptyBoard(): Board {
  return {
    width:  BOARD_W,
    height: BOARD_H,
    grid: Array.from({ length: BOARD_H }, () =>
      Array.from({ length: BOARD_W }, () => ({ filled: false, color: '' }))
    ),
  };
}

/** Fill board from the bottom up to `rows` filled rows (simulates stack growing). */
function boardWithStack(rows: number): Board {
  const board = emptyBoard();
  for (let y = BOARD_H - rows; y < BOARD_H; y++) {
    for (let x = 0; x < BOARD_W; x++) {
      // Leave a few random gaps so it looks realistic
      board.grid[y][x] = {
        filled: Math.random() > 0.15,
        color: ['I','O','T','S','Z','J','L'][Math.floor(Math.random() * 7)],
      };
    }
  }
  return board;
}

// ── stats ─────────────────────────────────────────────────────────────────────

interface PlayerStats {
  name: string;
  sent: number;
  received: number;
  alive: boolean;
  eliminatedAt: number | null;
  finalStack: number;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

async function main() {
  console.log(`\n=== GRANDMASTER Battle Royale Simulation ===`);
  console.log(`Players: ${NUM_PLAYERS}  |  Duration: ${DURATION_MS / 1000}s  |  Update rate: ${UPDATE_INTERVAL}ms\n`);

  const broker  = LobbyBroker.getInstance();
  const clients: BrokerClient[] = [];
  const stats:   PlayerStats[]  = [];

  // ── 1. Create clients ────────────────────────────────────────────────────────

  for (let i = 0; i < NUM_PLAYERS; i++) {
    const name   = `Player${String(i + 1).padStart(2, '0')}`;
    const client = new BrokerClient({ playerId: i + 1, playerName: name, nodeId: i + 1 });
    clients.push(client);
    stats.push({ name, sent: 0, received: 0, alive: true, eliminatedAt: null, finalStack: 0 });

    const idx = i;
    // Count game:update events from OTHER players
    client.on('game:update', (_update: any) => {
      stats[idx].received++;
    });
    client.on('lobby:game_started', () => {
      console.log(`  [${name}] game:started`);
    });
    client.on('lobby:game_starting', () => {
      // no-op; just confirms delivery
    });
  }

  console.log(`[1/4] Created ${NUM_PLAYERS} broker clients`);

  // ── 2. Matchmake all players ─────────────────────────────────────────────────

  const matchmakeConfig = {
    maxPlayers: 99,
    minPlayers: 2,
    settings: { mode: 'battle_royale', matchmaking: true },
  };

  // Stagger joins slightly so the first player always creates the lobby
  for (let i = 0; i < NUM_PLAYERS; i++) {
    await new Promise<void>((resolve) => {
      clients[i].emit('lobby:matchmake', { config: matchmakeConfig, mode: 'battle_royale' }, (resp: any) => {
        const ok = resp?.success ?? false;
        console.log(`  [${stats[i].name}] matchmake → ${ok ? 'OK' : 'FAIL'} (lobbyId: ${resp?.lobbyId ?? '?'})`);
        resolve();
      });
    });
    await sleep(30); // small stagger
  }

  console.log(`[2/4] All players matchmade`);

  // ── 3. Force start ───────────────────────────────────────────────────────────

  await sleep(200);
  // force_start has no callback in the broker — fire and forget
  clients[0].emit('lobby:force_start', {});
  await sleep(400);   // give the broker time to broadcast game_starting + game_started

  console.log(`[3/4] Game started — simulating ${DURATION_MS / 1000}s of play`);
  console.log(`      Watching for cross-player game:update delivery...\n`);

  // ── 4. Simulate game updates ─────────────────────────────────────────────────

  const start   = Date.now();
  const timers: NodeJS.Timeout[] = [];
  let   rank    = NUM_PLAYERS;

  for (let i = 0; i < NUM_PLAYERS; i++) {
    const client  = clients[i];
    const info    = stats[i];

    // Each player fills their board at a different rate (Player 1 = fastest)
    // They "die" when their stack reaches the top
    // Each player fills at a different rate so we get staggered eliminations
    // within the sim window.  Range: ~2–6 rows/sec → board fills in 3–10s.
    const fillRate = 2.0 + Math.random() * 4.0;

    const t = setInterval(() => {
      if (!info.alive) return;

      const elapsed     = (Date.now() - start) / 1000;
      const stackRows   = Math.min(Math.floor(elapsed * fillRate), BOARD_H);
      info.finalStack   = stackRows;

      // Player dies when stack hits top
      if (stackRows >= BOARD_H && info.alive) {
        info.alive        = false;
        info.eliminatedAt = elapsed;
        const place       = rank--;
        console.log(`  [${info.name}] ELIMINATED at ${elapsed.toFixed(1)}s — place #${place}`);
        // Send a final dead update (counted in sent for accurate delivery stats)
        info.sent++;
        client.emit('game:update', {
          playerId: i + 1,
          playerName: info.name,
          timestamp: Date.now(),
          board: boardWithStack(BOARD_H),
          level: Math.ceil(elapsed / 3),
          score: Math.floor(elapsed * 1000),
          grade: '9',
          combo: 0,
          alive: false,
          attacking: false,
        });
        clearInterval(t);
        return;
      }

      info.sent++;
      client.emit('game:update', {
        playerId: i + 1,
        playerName: info.name,
        timestamp: Date.now(),
        board: boardWithStack(stackRows),
        level: Math.ceil(elapsed / 3),
        score: Math.floor(elapsed * 1000 + stackRows * 50),
        grade: '9',
        combo: 0,
        alive: true,
        attacking: false,
      });
    }, UPDATE_INTERVAL);

    timers.push(t);
  }

  // ── 5. Wait for simulation to finish ─────────────────────────────────────────

  await sleep(DURATION_MS);
  timers.forEach(t => clearInterval(t));

  // ── 6. Results ───────────────────────────────────────────────────────────────

  console.log(`\n=== Results ===\n`);
  console.log(`${'Player'.padEnd(12)} ${'Sent'.padStart(6)} ${'Recv'.padStart(6)} ${'Alive'.padStart(6)} ${'Stack'.padStart(6)}`);
  console.log('─'.repeat(42));

  let totalSent = 0, totalRecv = 0;
  for (const s of stats) {
    const aliveStr = s.alive ? 'yes' : `no@${s.eliminatedAt?.toFixed(1)}s`;
    console.log(
      `${s.name.padEnd(12)} ` +
      `${String(s.sent).padStart(6)} ` +
      `${String(s.received).padStart(6)} ` +
      `${aliveStr.padStart(6)} ` +
      `${String(s.finalStack).padStart(6)}`
    );
    totalSent += s.sent;
    totalRecv += s.received;
  }

  console.log('─'.repeat(42));

  // Expected receives: each player gets N-1 streams of updates from the others.
  // A perfect broker delivers every sent packet to every other client.
  const expectedRecv = totalSent * (NUM_PLAYERS - 1);
  const deliveryPct  = expectedRecv > 0 ? (totalRecv / expectedRecv * 100).toFixed(1) : 'N/A';

  console.log(`\nTotal sent:    ${totalSent}`);
  console.log(`Total recv:    ${totalRecv}`);
  console.log(`Expected recv: ${expectedRecv}  (each packet → ${NUM_PLAYERS - 1} others)`);
  console.log(`Delivery rate: ${deliveryPct}%`);

  if (parseFloat(deliveryPct) >= 99) {
    console.log(`\n[OK] Broker delivery: PASS`);
  } else {
    console.log(`\n[FAIL] Broker delivery below 99% — check LobbyBroker.broadcastToLobby`);
    process.exitCode = 1;
  }

  // Cleanup — force exit because the LobbyBroker singleton (globalThis) keeps the event loop alive
  clients.forEach(c => c.dispose());
  console.log(`\nAll clients disposed. Done.\n`);
  process.exit(process.exitCode ?? 0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
