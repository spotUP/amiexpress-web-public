/**
 * "Add Bots" toggle regression tests.
 *
 * Symptom (GRANDMASTER battle royale, reported live 2026-08-25): "i had to
 * click add bots a couple of times in battle royale before they got added".
 *
 * toggleBots() fired the adapter call WITHOUT awaiting it, then immediately
 * repainted the player list from state the adapter had not finished
 * mutating - so the press looked inert. It also flipped `hasBots`
 * unconditionally, so the next press took the REMOVE branch: pressing "Add
 * Bots" repeatedly alternated add/remove rather than adding.
 *
 * It also filled to the mode's maxPlayers, which for a battle royale is 99.
 *
 * These tests exercise the sequencing contract directly; constructing a full
 * MultiplayerLobby needs a screen plus a complete adapter, and what matters
 * here is the order of operations and the target count.
 */

import { describe, it, expect } from '@jest/globals';
import { botFillCount } from '../engines/ui/blessed/widgets/multiplayer-lobby';

interface ModeConfig { name: string; maxPlayers: number; minPlayers: number; botFillTarget?: number }

/** Mirrors the fixed toggleBots() sequencing. */
async function toggleBots(
  ctx: {
    hasBots: boolean;
    label: string;
    repaints: string[];
  },
  adapter: {
    fillWithBots: (count: number, difficulty?: number) => Promise<void>;
    removeBots: () => Promise<void>;
  },
  modeConfig: ModeConfig,
  difficulty = 5
): Promise<void> {
  if (ctx.hasBots) {
    await adapter.removeBots();
    ctx.hasBots = false;
    ctx.label = ' Add Bots ';
  } else {
    const targetCount = botFillCount(modeConfig);
    await adapter.fillWithBots(targetCount, difficulty);
    ctx.hasBots = true;
    ctx.label = ' Remove ';
  }
  ctx.repaints.push('updatePlayerList');
}

const BATTLE_ROYALE: ModeConfig = { name: 'Battle Royale (99)', maxPlayers: 99, minPlayers: 2 };

function makeAdapter() {
  const calls: string[] = [];
  let players = 1;
  return {
    calls,
    getPlayers: () => players,
    // Async on purpose: this is what real adapters do.
    fillWithBots: async (count: number) => {
      calls.push(`fill:${count}`);
      await Promise.resolve();
      players = count;
    },
    removeBots: async () => {
      calls.push('remove');
      await Promise.resolve();
      players = 1;
    },
  };
}

describe('lobby Add Bots toggle', () => {
  it('adds bots on the FIRST press rather than alternating', async () => {
    const adapter = makeAdapter();
    const ctx = { hasBots: false, label: ' Bots ', repaints: [] as string[] };

    await toggleBots(ctx, adapter, BATTLE_ROYALE);

    expect(adapter.calls).toEqual(['fill:2']);
    expect(ctx.hasBots).toBe(true);
    expect(adapter.getPlayers()).toBe(2);
  });

  it('has finished mutating state before the player list repaints', async () => {
    const adapter = makeAdapter();
    const ctx = { hasBots: false, label: ' Bots ', repaints: [] as string[] };

    await toggleBots(ctx, adapter, BATTLE_ROYALE);

    // The unawaited version repainted while players was still 1.
    expect(ctx.repaints).toEqual(['updatePlayerList']);
    expect(adapter.getPlayers()).toBe(2);
  });

  it('fills to the mode minimum, not 99 for a battle royale', async () => {
    const adapter = makeAdapter();
    const ctx = { hasBots: false, label: ' Bots ', repaints: [] as string[] };

    await toggleBots(ctx, adapter, BATTLE_ROYALE);

    expect(adapter.calls).toEqual(['fill:2']);
    expect(adapter.calls).not.toContain('fill:99');
  });

  it('removes on the second press, restoring the Add label', async () => {
    const adapter = makeAdapter();
    const ctx = { hasBots: false, label: ' Bots ', repaints: [] as string[] };

    await toggleBots(ctx, adapter, BATTLE_ROYALE);
    await toggleBots(ctx, adapter, BATTLE_ROYALE);

    expect(adapter.calls).toEqual(['fill:2', 'remove']);
    expect(ctx.hasBots).toBe(false);
    expect(ctx.label).toBe(' Add Bots ');
  });
});

describe('bot fill target', () => {
  // Reported live 2026-08-25: "only one bot is added" in TetriNET. The table
  // seats six; filling to minPlayers (2) means exactly one bot.
  const TETRINET: ModeConfig = { name: 'Standard', maxPlayers: 6, minPlayers: 2, botFillTarget: 4 };

  it('fills a six-seat table to its stated house size, not its minimum', () => {
    expect(botFillCount(TETRINET)).toBe(4);
  });

  it('still falls back to minPlayers for modes that state no target', () => {
    expect(botFillCount({ name: 'Battle Royale (99)', maxPlayers: 99, minPlayers: 2 })).toBe(2);
  });

  it('never reaches for maxPlayers when a minimum exists', () => {
    expect(botFillCount({ name: 'BR', maxPlayers: 99, minPlayers: 2 })).not.toBe(99);
  });

  it('defaults to two when the mode is unknown', () => {
    expect(botFillCount(undefined)).toBe(2);
  });
});
