/**
 * Card Lobby - Game State Manager
 * Handles poker game logic, hand progression, and bot actions
 *
 * Note: We use PokerAction (local const) instead of SDK's ActionType to avoid
 * type incompatibility between SDK ActionType and @pokertools/types ActionType.
 * The values are correct at runtime; TypeScript just can't verify compatibility.
 */

import { CardEngine, PokerEngine } from '@amiexpress/bbs-door-sdk';
import {
  type LobbyTable,
  type LobbyState,
  type PlayerProfile,
  type LastHandSummary,
  ACTIVITY_REWARD,
  WIN_REWARD,
  CHIP_NAME,
  PokerAction,
  calculateRake,
  getCurrentBet,
  getPlayerBet,
  isBotPlayer,
  isBotId,
  safeNumber,
} from '../lib';

const cardEngine = new CardEngine();

export class GameStateManager {
  async finalizeHoldemHand(
    table: LobbyTable,
    engine: PokerEngine,
    beforeStacks: Record<string, number>,
    lobby: LobbyState | null,
    profiles: Record<string, PlayerProfile>,
    currentProfile: PlayerProfile | null,
    callbacks: {
      clearTableHand: (table: LobbyTable) => void;
      updateTableStatus: (table: LobbyTable) => void;
      updateStatsAfterHand: (profile: PlayerProfile, delta: number, pot: number) => void;
      handleAchievementUnlocks: (profile: PlayerProfile) => void;
      pushNotice: (message: string) => void;
      pushEvent: (message: string) => void;
      emitLiveChat: (message: string) => void;
      writeWeeklyBulletinIfNeeded: () => Promise<void>;
      persistState: () => Promise<void>;
    },
  ): Promise<void> {
    if (!lobby || !currentProfile) return;

    const pot = engine.state.pots.reduce((sum, potItem) => sum + potItem.amount, 0);
    const lastHand: LastHandSummary = {
      board: engine.state.board.slice(),
      hands: {},
      pot,
      winners: (engine.state.winners ?? []).map((winner) => {
        const seat = winner.seat;
        const player = engine.state.players[seat];
        return {
          userId: player?.id ?? 'unknown',
          username: player?.name ?? 'Unknown',
          amount: winner.amount,
        };
      }),
      playedAt: Date.now(),
    };

    engine.state.players.forEach((player) => {
      if (!player?.hand) return;
      lastHand.hands[player.id] = [...player.hand];
    });

    table.players = table.players.map((player) => {
      if (player.role !== 'player') return player;
      const enginePlayer = engine.state.players[player.seat];
      if (!enginePlayer) return player;
      return {
        ...player,
        stack: enginePlayer.stack,
      };
    });

    table.lastHand = lastHand;
    callbacks.clearTableHand(table);
    callbacks.updateTableStatus(table);

    table.players.forEach((player) => {
      if (player.role !== 'player' || isBotPlayer(player)) return;
      const profile = profiles[player.userId];
      if (!profile) return;
      if (beforeStacks[player.userId] === undefined) return;
      const before = beforeStacks[player.userId] ?? player.stack;
      const delta = player.stack - before;
      callbacks.updateStatsAfterHand(profile, delta, pot);
      profile.wallet.chips += ACTIVITY_REWARD;
      profile.wallet.lifetimeEarned += ACTIVITY_REWARD;
      if (delta > 0) {
        profile.wallet.chips += WIN_REWARD;
        profile.wallet.lifetimeEarned += WIN_REWARD;
      }
      callbacks.handleAchievementUnlocks(profile);
    });

    const currentDelta = (table.players.find((p) => p.userId === currentProfile?.userId)?.stack ?? 0) -
      (beforeStacks[currentProfile.userId] ?? 0);
    if (currentDelta > 0) {
      callbacks.pushNotice(`You won ${currentDelta} ${CHIP_NAME}.`);
      callbacks.emitLiveChat(`BIG WIN: ${currentProfile.username} won ${currentDelta} in ${table.gameName} (#${table.id})`);
    }

    callbacks.pushEvent(`Hand played at table #${table.id} (${table.gameName} ${table.stakesLabel}).`);

    await callbacks.writeWeeklyBulletinIfNeeded();
    await callbacks.persistState();
  }

  async startHoldemHand(
    table: LobbyTable,
    lobby: LobbyState | null,
    currentProfile: PlayerProfile | null,
    callbacks: {
      reloadState: () => Promise<void>;
      findTableById: (id: number) => LobbyTable | undefined;
      saveTableHand: (table: LobbyTable, engine: PokerEngine, beforeStacks: Record<string, number>, timestamp?: number) => void;
      updateTableStatus: (table: LobbyTable) => void;
      clearTableHand: (table: LobbyTable) => void;
      pushNotice: (message: string) => void;
      pushEvent: (message: string) => void;
      persistState: () => Promise<void>;
      advanceHoldemHand: (table: LobbyTable, engine: PokerEngine, beforeStacks: Record<string, number>) => Promise<void>;
    },
  ): Promise<void> {
    try {
      await callbacks.reloadState();
      if (!lobby || !currentProfile) return;

      const freshTable = callbacks.findTableById(table.id);
      if (!freshTable) {
        callbacks.pushNotice('Table not found.');
        return;
      }

      if (freshTable.hand) {
        callbacks.pushNotice('Hand already in progress.');
        return;
      }

      const rake = calculateRake(freshTable.bigBlind);
      const engine = new PokerEngine({
        smallBlind: freshTable.smallBlind,
        bigBlind: freshTable.bigBlind,
        maxPlayers: freshTable.maxPlayers,
        rakePercent: rake.percent,
        rakeCap: rake.cap,
      }, { cardEngine });

      const seatedPlayers = freshTable.players.filter((player) => player.role === 'player' && player.stack > 0);
      if (seatedPlayers.length < freshTable.minPlayers) {
        callbacks.pushNotice('Not enough players to deal a hand.');
        return;
      }

      seatedPlayers.forEach((player) => {
        engine.sit(player.seat, player.userId, player.username, player.stack);
      });

      try {
        engine.deal();
      } catch (error) {
        console.error('[CardLobby] Holdem deal failed:', error);
        callbacks.pushNotice('Failed to deal a hand.');
        return;
      }

      const beforeStacks: Record<string, number> = {};
      seatedPlayers.forEach((player) => {
        if (!isBotPlayer(player)) {
          beforeStacks[player.userId] = player.stack;
        }
      });
      callbacks.saveTableHand(freshTable, engine, beforeStacks, Date.now());
      callbacks.updateTableStatus(freshTable);
      callbacks.pushEvent(`Hand started at table #${freshTable.id} (${freshTable.gameName} ${freshTable.stakesLabel}).`);
      await callbacks.persistState();
      await callbacks.advanceHoldemHand(freshTable, engine, beforeStacks);
    } catch (error) {
      console.error('[CardLobby] Holdem hand setup failed:', error);
      if (lobby) {
        const freshTable = callbacks.findTableById(table.id);
        if (freshTable) {
          callbacks.clearTableHand(freshTable);
          callbacks.updateTableStatus(freshTable);
          await callbacks.persistState();
        }
      }
      callbacks.pushNotice('Hand failed to start.');
    }
  }

  async advanceHoldemHand(
    table: LobbyTable,
    engineOverride: PokerEngine | undefined,
    beforeStacksOverride: Record<string, number> | undefined,
    lobby: LobbyState | null,
    currentProfile: PlayerProfile | null,
    callbacks: {
      loadTableHand: (table: LobbyTable) => { engine: PokerEngine; beforeStacks: Record<string, number> } | null;
      saveTableHand: (table: LobbyTable, engine: PokerEngine, beforeStacks: Record<string, number>) => void;
      persistState: () => Promise<void>;
      updateTablePanel: () => void;
      performBotAction: (engine: PokerEngine, seat: number, playerId: string) => Promise<void>;
      finalizeHoldemHand: (table: LobbyTable, engine: PokerEngine, beforeStacks: Record<string, number>) => Promise<void>;
      maybeAutoDeal: (table: LobbyTable) => Promise<void>;
      pushNotice: (message: string) => void;
    },
  ): Promise<void> {
    if (!lobby || !currentProfile) return;

    try {
      const handState = engineOverride
        ? { engine: engineOverride, beforeStacks: beforeStacksOverride ?? table.hand?.beforeStacks ?? {} }
        : callbacks.loadTableHand(table);
      if (!handState) return;

      let safety = 0;
      while (!handState.engine.state.winners && safety < 400) {
        const state = handState.engine.state;
        const actionSeat = state.actionTo;
        if (actionSeat === null || actionSeat === undefined) break;
        const actor = state.players[actionSeat];
        if (!actor) break;

        if (!isBotId(actor.id)) {
          callbacks.saveTableHand(table, handState.engine, handState.beforeStacks);
          await callbacks.persistState();
          callbacks.updateTablePanel();
          return;
        }

        await callbacks.performBotAction(handState.engine, actionSeat, actor.id);
        callbacks.saveTableHand(table, handState.engine, handState.beforeStacks);
        await callbacks.persistState();
        safety += 1;
      }

      if (!handState.engine.state.winners) {
        callbacks.saveTableHand(table, handState.engine, handState.beforeStacks);
        await callbacks.persistState();
        callbacks.updateTablePanel();
        return;
      }

      await callbacks.finalizeHoldemHand(table, handState.engine, handState.beforeStacks);
      callbacks.updateTablePanel();
      void callbacks.maybeAutoDeal(table);
    } catch (error) {
      console.error('[CardLobby] Holdem hand error:', error);
      callbacks.pushNotice('Hand error. Returning to lobby.');
      callbacks.updateTablePanel();
    }
  }

  async performBotAction(
    engine: PokerEngine,
    seat: number,
    playerId: string,
    pushEvent: (message: string) => void,
  ): Promise<void> {
    const actorSeat = engine.state.players[seat];
    if (!actorSeat) return;

    const currentBet = getCurrentBet(engine);
    const playerBet = getPlayerBet(engine, seat);
    const toCall = Math.max(0, currentBet - playerBet);
    const stack = actorSeat.stack;

    const aggression = 0.35;
    const random = Math.random();

    try {
      if (toCall === 0) {
        if (random < aggression && stack > 0) {
          const minBet = stack <= engine.state.bigBlind ? stack : engine.state.bigBlind;
          const maxBet = stack;
          const target = Math.min(maxBet, minBet + Math.floor(engine.state.bigBlind * (2 + Math.random() * 3)));
          // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
          engine.act({ type: PokerAction.BET, playerId, amount: target });
          pushEvent(`${actorSeat.name} bets ${target}`);
        } else {
          // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
          engine.act({ type: PokerAction.CHECK, playerId });
          pushEvent(`${actorSeat.name} checks`);
        }
        return;
      }

      if (stack <= toCall) {
        if (random < 0.2) {
          // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
          engine.act({ type: PokerAction.FOLD, playerId });
          pushEvent(`${actorSeat.name} folds`);
        } else {
          // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
          engine.act({ type: PokerAction.CALL, playerId });
          pushEvent(`${actorSeat.name} calls ${toCall}`);
        }
        return;
      }

      if (random < 0.15 && toCall > engine.state.bigBlind * 2) {
        // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
          engine.act({ type: PokerAction.FOLD, playerId });
        pushEvent(`${actorSeat.name} folds`);
        return;
      }

      if (random < aggression) {
        const maxRaise = playerBet + stack;
        const minRaise = Math.min(engine.state.minRaise, maxRaise);
        const raiseLimit = Math.min(maxRaise, minRaise + engine.state.bigBlind * 4);
        const raiseTo = minRaise + Math.floor(Math.random() * Math.max(1, raiseLimit - minRaise + 1));
        // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
          engine.act({ type: PokerAction.RAISE, playerId, amount: raiseTo });
        pushEvent(`${actorSeat.name} raises to ${raiseTo}`);
        return;
      }

      // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
          engine.act({ type: PokerAction.CALL, playerId });
      pushEvent(`${actorSeat.name} calls ${toCall}`);
    } catch (error) {
      try {
        if (toCall === 0) {
          // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
          engine.act({ type: PokerAction.CHECK, playerId });
        } else {
          // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
          engine.act({ type: PokerAction.CALL, playerId });
        }
      } catch {
        // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
          engine.act({ type: PokerAction.FOLD, playerId });
      }
    }
  }

  async handlePlayerAction(
    action: 'call' | 'bet' | 'fold',
    currentProfile: PlayerProfile | null,
    lobby: LobbyState | null,
    callbacks: {
      reloadState: () => Promise<void>;
      findTableById: (id: number) => LobbyTable | undefined;
      loadTableHand: (table: LobbyTable) => { engine: PokerEngine; beforeStacks: Record<string, number> } | null;
      saveTableHand: (table: LobbyTable, engine: PokerEngine, beforeStacks: Record<string, number>) => void;
      persistState: () => Promise<void>;
      advanceHoldemHand: (table: LobbyTable, engine: PokerEngine, beforeStacks: Record<string, number>) => Promise<void>;
      pushNotice: (message: string) => void;
      showPromptDialog: (title: string, text: string, value: string) => Promise<string | null>;
    },
  ): Promise<void> {
    if (!currentProfile || !lobby) return;
    const tableId = currentProfile.currentTableId;
    if (!tableId) return;

    await callbacks.reloadState();
    const table = callbacks.findTableById(tableId);
    if (!table || !table.hand) {
      callbacks.pushNotice('No active hand to act on.');
      return;
    }

    const handState = callbacks.loadTableHand(table);
    if (!handState) {
      callbacks.pushNotice('Failed to load hand state.');
      return;
    }

    const engine = handState.engine;
    const actionSeat = engine.state.actionTo;
    if (actionSeat === null || actionSeat === undefined) {
      callbacks.pushNotice('Waiting for the next action.');
      return;
    }
    const actor = engine.state.players[actionSeat];
    if (!actor || actor.id !== currentProfile.userId) {
      callbacks.pushNotice('Waiting for the next player to act.');
      return;
    }

    const currentBet = getCurrentBet(engine);
    const playerBet = getPlayerBet(engine, actionSeat);
    const toCall = Math.max(0, currentBet - playerBet);

    if (action === 'fold') {
      try {
        // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
          engine.act({ type: PokerAction.FOLD, playerId: actor.id });
      } catch (error) {
        callbacks.pushNotice('Action rejected.');
        return;
      }
      callbacks.saveTableHand(table, engine, handState.beforeStacks);
      await callbacks.persistState();
      await callbacks.advanceHoldemHand(table, engine, handState.beforeStacks);
      return;
    }

    if (action === 'call') {
      try {
        // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
          engine.act({ type: (toCall === 0 ? PokerAction.CHECK : PokerAction.CALL), playerId: actor.id });
      } catch (error) {
        callbacks.pushNotice('Action rejected.');
        return;
      }
      callbacks.saveTableHand(table, engine, handState.beforeStacks);
      await callbacks.persistState();
      await callbacks.advanceHoldemHand(table, engine, handState.beforeStacks);
      return;
    }

    if (action === 'bet') {
      const stack = actor.stack;
      if (stack <= 0) {
        callbacks.pushNotice('No chips left.');
        return;
      }

      const maxAmount = playerBet + stack;
      let minAmount = engine.state.bigBlind;
      if (currentBet > 0) {
        minAmount = engine.state.minRaise;
      }
      if (maxAmount < minAmount) {
        minAmount = maxAmount;
      }
      const label = currentBet > 0 ? 'Raise to (min/max)' : 'Bet amount (min/max)';
      const amountValue = await callbacks.showPromptDialog(
        'Bet/Raise',
        `${label}: ${minAmount}-${maxAmount}`,
        String(minAmount),
      );
      if (amountValue === null) return;

      const amount = safeNumber(amountValue);
      if (amount === null || amount < minAmount || amount > maxAmount) {
        callbacks.pushNotice(`Amount must be ${minAmount}-${maxAmount}.`);
        return;
      }

      const actionType = (currentBet > 0 ? PokerAction.RAISE : PokerAction.BET);
      try {
        // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
          engine.act({ type: actionType, playerId: actor.id, amount });
      } catch (error) {
        callbacks.pushNotice('Action rejected.');
        return;
      }

      callbacks.saveTableHand(table, engine, handState.beforeStacks);
      await callbacks.persistState();
      await callbacks.advanceHoldemHand(table, engine, handState.beforeStacks);
    }
  }
}
