"use strict";
/**
 * Card Lobby - Game State Manager
 * Handles poker game logic, hand progression, and bot actions
 *
 * Note: We use PokerAction (local const) instead of SDK's ActionType to avoid
 * type incompatibility between SDK ActionType and @pokertools/types ActionType.
 * The values are correct at runtime; TypeScript just can't verify compatibility.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameStateManager = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const lib_1 = require("../lib");
const uno_engine_1 = require("../lib/uno-engine");
const cardEngine = new bbs_door_sdk_1.CardEngine();
class GameStateManager {
    /**
     * Set the AI system for intelligent bot play
     */
    setAI(ai) {
        this.ai = ai;
    }
    async finalizeHoldemHand(table, engine, beforeStacks, lobby, profiles, currentProfile, callbacks) {
        if (!lobby || !currentProfile)
            return;
        const pot = engine.state.pots.reduce((sum, potItem) => sum + potItem.amount, 0);
        const lastHand = {
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
            if (!player?.hand)
                return;
            lastHand.hands[player.id] = [...player.hand];
        });
        table.players = table.players.map((player) => {
            if (player.role !== 'player')
                return player;
            const enginePlayer = engine.state.players[player.seat];
            if (!enginePlayer)
                return player;
            return {
                ...player,
                stack: enginePlayer.stack,
            };
        });
        table.lastHand = lastHand;
        callbacks.clearTableHand(table);
        callbacks.updateTableStatus(table);
        table.players.forEach((player) => {
            if (player.role !== 'player' || (0, lib_1.isBotPlayer)(player))
                return;
            const profile = profiles[player.userId];
            if (!profile)
                return;
            if (beforeStacks[player.userId] === undefined)
                return;
            const before = beforeStacks[player.userId] ?? player.stack;
            const delta = player.stack - before;
            callbacks.updateStatsAfterHand(profile, delta, pot);
            profile.wallet.chips += lib_1.ACTIVITY_REWARD;
            profile.wallet.lifetimeEarned += lib_1.ACTIVITY_REWARD;
            if (delta > 0) {
                profile.wallet.chips += lib_1.WIN_REWARD;
                profile.wallet.lifetimeEarned += lib_1.WIN_REWARD;
            }
            callbacks.handleAchievementUnlocks(profile);
        });
        const currentDelta = (table.players.find((p) => p.userId === currentProfile?.userId)?.stack ?? 0) -
            (beforeStacks[currentProfile.userId] ?? 0);
        if (currentDelta > 0) {
            callbacks.pushNotice(`You won ${currentDelta} ${lib_1.CHIP_NAME}.`);
            callbacks.emitLiveChat(`BIG WIN: ${currentProfile.username} won ${currentDelta} in ${table.gameName} (#${table.id})`);
        }
        callbacks.pushEvent(`Hand played at table #${table.id} (${table.gameName} ${table.stakesLabel}).`);
        await callbacks.writeWeeklyBulletinIfNeeded();
        await callbacks.persistState();
    }
    async startHoldemHand(table, lobby, currentProfile, callbacks) {
        try {
            await callbacks.reloadState();
            if (!lobby || !currentProfile)
                return;
            const freshTable = callbacks.findTableById(table.id);
            if (!freshTable) {
                callbacks.pushNotice('Table not found.');
                return;
            }
            if (freshTable.hand) {
                callbacks.pushNotice('Hand already in progress.');
                return;
            }
            const rake = (0, lib_1.calculateRake)(freshTable.bigBlind);
            const engine = new bbs_door_sdk_1.PokerEngine({
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
            }
            catch (error) {
                callbacks.pushNotice(`Failed to deal a hand: ${error instanceof Error ? error.message : 'Unknown error'}`);
                return;
            }
            const beforeStacks = {};
            seatedPlayers.forEach((player) => {
                if (!(0, lib_1.isBotPlayer)(player)) {
                    beforeStacks[player.userId] = player.stack;
                }
            });
            callbacks.saveTableHand(freshTable, engine, beforeStacks, Date.now());
            callbacks.updateTableStatus(freshTable);
            callbacks.pushEvent(`Hand started at table #${freshTable.id} (${freshTable.gameName} ${freshTable.stakesLabel}).`);
            await callbacks.persistState();
            await callbacks.advanceHoldemHand(freshTable, engine, beforeStacks);
        }
        catch (error) {
            if (lobby) {
                const freshTable = callbacks.findTableById(table.id);
                if (freshTable) {
                    callbacks.clearTableHand(freshTable);
                    callbacks.updateTableStatus(freshTable);
                    await callbacks.persistState();
                }
            }
            callbacks.pushNotice(`Hand failed to start: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async advanceHoldemHand(table, engineOverride, beforeStacksOverride, lobby, currentProfile, callbacks) {
        if (!lobby || !currentProfile)
            return;
        try {
            const handState = engineOverride
                ? { engine: engineOverride, beforeStacks: beforeStacksOverride ?? table.hand?.beforeStacks ?? {} }
                : callbacks.loadTableHand(table);
            if (!handState)
                return;
            let safety = 0;
            while (!handState.engine.state.winners && safety < 400) {
                const state = handState.engine.state;
                const actionSeat = state.actionTo;
                if (actionSeat === null || actionSeat === undefined)
                    break;
                const actor = state.players[actionSeat];
                if (!actor)
                    break;
                if (!(0, lib_1.isBotId)(actor.id)) {
                    callbacks.saveTableHand(table, handState.engine, handState.beforeStacks);
                    await callbacks.persistState();
                    callbacks.updateTablePanel();
                    return;
                }
                await callbacks.performBotAction(handState.engine, actionSeat, actor.id, table);
                callbacks.saveTableHand(table, handState.engine, handState.beforeStacks);
                await callbacks.persistState();
                safety += 1;
            }
            // Check if safety limit was reached
            if (safety >= 400 && !handState.engine.state.winners) {
                callbacks.pushNotice('Hand stalled after 400 bot actions. Canceling hand.');
                // Cancel the hand and return chips to players
                table.hand = undefined;
                table.updatedAt = Date.now();
                await callbacks.persistState();
                callbacks.updateTablePanel();
                return;
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
        }
        catch (error) {
            callbacks.pushNotice(`Hand error: ${error instanceof Error ? error.message : 'Unknown error'}. Returning to lobby.`);
            callbacks.updateTablePanel();
        }
    }
    async performBotAction(engine, seat, playerId, pushEvent, table) {
        // Use AI if available, otherwise fall back to legacy random bot
        if (this.ai && table) {
            return this.performBotActionAI(engine, seat, playerId, pushEvent, table);
        }
        return this.performBotActionLegacy(engine, seat, playerId, pushEvent);
    }
    /**
     * AI-powered bot action (new system)
     */
    async performBotActionAI(engine, seat, playerId, pushEvent, table) {
        const actorSeat = engine.state.players[seat];
        if (!actorSeat)
            return;
        // Get bot difficulty from table player
        const tablePlayer = table.players.find((p) => p.userId === playerId);
        const difficulty = tablePlayer?.botDifficulty ?? 'medium';
        try {
            // Make AI decision
            const decision = await this.ai.makePokerDecision({
                engine,
                seat,
                playerId,
                difficulty,
            });
            // Execute the decision
            const currentBet = (0, lib_1.getCurrentBet)(engine);
            const playerBet = (0, lib_1.getPlayerBet)(engine, seat);
            const toCall = Math.max(0, currentBet - playerBet);
            switch (decision.action) {
                case 'fold':
                    // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                    engine.act({ type: lib_1.PokerAction.FOLD, playerId });
                    pushEvent(`${actorSeat.name} folds`);
                    break;
                case 'check':
                    // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                    engine.act({ type: lib_1.PokerAction.CHECK, playerId });
                    pushEvent(`${actorSeat.name} checks`);
                    break;
                case 'call':
                    // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                    engine.act({ type: lib_1.PokerAction.CALL, playerId });
                    pushEvent(`${actorSeat.name} calls ${toCall}`);
                    break;
                case 'bet':
                    if (decision.amount) {
                        // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                        engine.act({ type: lib_1.PokerAction.BET, playerId, amount: decision.amount });
                        pushEvent(`${actorSeat.name} bets ${decision.amount}`);
                    }
                    else {
                        // Fallback: check if amount missing
                        // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                        engine.act({ type: lib_1.PokerAction.CHECK, playerId });
                        pushEvent(`${actorSeat.name} checks`);
                    }
                    break;
                case 'raise':
                    if (decision.amount) {
                        // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                        engine.act({ type: lib_1.PokerAction.RAISE, playerId, amount: decision.amount });
                        pushEvent(`${actorSeat.name} raises to ${decision.amount}`);
                    }
                    else {
                        // Fallback: call if amount missing
                        // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                        engine.act({ type: lib_1.PokerAction.CALL, playerId });
                        pushEvent(`${actorSeat.name} calls ${toCall}`);
                    }
                    break;
                case 'all-in':
                    // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                    engine.act({ type: lib_1.PokerAction.CALL, playerId });
                    pushEvent(`${actorSeat.name} is all-in!`);
                    break;
            }
        }
        catch (error) {
            // Fallback to safe action on error
            try {
                const currentBet = (0, lib_1.getCurrentBet)(engine);
                const playerBet = (0, lib_1.getPlayerBet)(engine, seat);
                const toCall = Math.max(0, currentBet - playerBet);
                if (toCall === 0) {
                    // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                    engine.act({ type: lib_1.PokerAction.CHECK, playerId });
                }
                else {
                    // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                    engine.act({ type: lib_1.PokerAction.FOLD, playerId });
                }
            }
            catch {
                // If even fallback fails, do nothing
            }
        }
    }
    /**
     * Legacy random bot action (backward compatibility)
     */
    async performBotActionLegacy(engine, seat, playerId, pushEvent) {
        const actorSeat = engine.state.players[seat];
        if (!actorSeat)
            return;
        const currentBet = (0, lib_1.getCurrentBet)(engine);
        const playerBet = (0, lib_1.getPlayerBet)(engine, seat);
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
                    engine.act({ type: lib_1.PokerAction.BET, playerId, amount: target });
                    pushEvent(`${actorSeat.name} bets ${target}`);
                }
                else {
                    // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                    engine.act({ type: lib_1.PokerAction.CHECK, playerId });
                    pushEvent(`${actorSeat.name} checks`);
                }
                return;
            }
            if (stack <= toCall) {
                if (random < 0.2) {
                    // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                    engine.act({ type: lib_1.PokerAction.FOLD, playerId });
                    pushEvent(`${actorSeat.name} folds`);
                }
                else {
                    // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                    engine.act({ type: lib_1.PokerAction.CALL, playerId });
                    pushEvent(`${actorSeat.name} calls ${toCall}`);
                }
                return;
            }
            if (random < 0.15 && toCall > engine.state.bigBlind * 2) {
                // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                engine.act({ type: lib_1.PokerAction.FOLD, playerId });
                pushEvent(`${actorSeat.name} folds`);
                return;
            }
            if (random < aggression) {
                const maxRaise = playerBet + stack;
                const minRaise = Math.min(engine.state.minRaise, maxRaise);
                const raiseLimit = Math.min(maxRaise, minRaise + engine.state.bigBlind * 4);
                const raiseTo = minRaise + Math.floor(Math.random() * Math.max(1, raiseLimit - minRaise + 1));
                // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                engine.act({ type: lib_1.PokerAction.RAISE, playerId, amount: raiseTo });
                pushEvent(`${actorSeat.name} raises to ${raiseTo}`);
                return;
            }
            // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
            engine.act({ type: lib_1.PokerAction.CALL, playerId });
            pushEvent(`${actorSeat.name} calls ${toCall}`);
        }
        catch (error) {
            try {
                if (toCall === 0) {
                    // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                    engine.act({ type: lib_1.PokerAction.CHECK, playerId });
                }
                else {
                    // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                    engine.act({ type: lib_1.PokerAction.CALL, playerId });
                }
            }
            catch {
                // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                engine.act({ type: lib_1.PokerAction.FOLD, playerId });
            }
        }
    }
    async handlePlayerAction(action, currentProfile, lobby, callbacks) {
        if (!currentProfile || !lobby)
            return;
        const tableId = currentProfile.currentTableId;
        if (!tableId)
            return;
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
        const currentBet = (0, lib_1.getCurrentBet)(engine);
        const playerBet = (0, lib_1.getPlayerBet)(engine, actionSeat);
        const toCall = Math.max(0, currentBet - playerBet);
        if (action === 'fold') {
            try {
                // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                engine.act({ type: lib_1.PokerAction.FOLD, playerId: actor.id });
            }
            catch (error) {
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
                engine.act({ type: (toCall === 0 ? lib_1.PokerAction.CHECK : lib_1.PokerAction.CALL), playerId: actor.id });
            }
            catch (error) {
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
            const amountValue = await callbacks.showPromptDialog('Bet/Raise', `${label}: ${minAmount}-${maxAmount}`, String(minAmount));
            if (amountValue === null)
                return;
            const amount = (0, lib_1.safeNumber)(amountValue);
            if (amount === null || amount < minAmount || amount > maxAmount) {
                callbacks.pushNotice(`Amount must be ${minAmount}-${maxAmount}.`);
                return;
            }
            const actionType = (currentBet > 0 ? lib_1.PokerAction.RAISE : lib_1.PokerAction.BET);
            try {
                // @ts-expect-error - PokerAction values are compatible with ActionType at runtime
                engine.act({ type: actionType, playerId: actor.id, amount });
            }
            catch (error) {
                callbacks.pushNotice('Action rejected.');
                return;
            }
            callbacks.saveTableHand(table, engine, handState.beforeStacks);
            await callbacks.persistState();
            await callbacks.advanceHoldemHand(table, engine, handState.beforeStacks);
        }
    }
    // ============================================================================
    // UNO GAME METHODS
    // ============================================================================
    async startUnoGame(table, lobby, currentProfile, callbacks) {
        try {
            await callbacks.reloadState();
            if (!lobby || !currentProfile)
                return;
            const freshTable = callbacks.findTableById(table.id);
            if (!freshTable) {
                callbacks.pushNotice('Table not found.');
                return;
            }
            if (freshTable.hand) {
                callbacks.pushNotice('Game already in progress.');
                return;
            }
            const seatedPlayers = freshTable.players.filter((player) => player.role === 'player');
            if (seatedPlayers.length < freshTable.minPlayers) {
                callbacks.pushNotice('Not enough players to start UNO.');
                return;
            }
            // Determine variant from gameId
            const variant = freshTable.gameId === 'uno-house' ? 'house-rules' : 'standard';
            // Create UNO engine
            const playerIds = seatedPlayers.map(p => p.userId);
            const playerNames = seatedPlayers.map(p => p.username);
            const isBot = seatedPlayers.map(p => p.isBot || false);
            const engine = new uno_engine_1.UnoGameEngine(variant, playerIds, playerNames, isBot);
            // Save before-stacks for chip delta calculation
            const beforeStacks = {};
            seatedPlayers.forEach((player) => {
                if (!(0, lib_1.isBotPlayer)(player)) {
                    beforeStacks[player.userId] = player.stack;
                }
            });
            callbacks.saveUnoGameState(freshTable, engine, beforeStacks, Date.now());
            callbacks.updateTableStatus(freshTable);
            callbacks.pushEvent(`UNO game started at table #${freshTable.id} (${freshTable.gameName} ${freshTable.stakesLabel}).`);
            // Broadcast game started event
            await callbacks.broadcastEvent(freshTable.id, 'gameStarted', {
                variant,
                players: seatedPlayers.map(p => ({ userId: p.userId, username: p.username, seat: p.seat })),
            });
            await callbacks.persistState();
            await callbacks.advanceUnoGame(freshTable, engine, beforeStacks);
        }
        catch (error) {
            if (lobby) {
                const freshTable = callbacks.findTableById(table.id);
                if (freshTable) {
                    callbacks.clearTableHand(freshTable);
                    callbacks.updateTableStatus(freshTable);
                    await callbacks.persistState();
                }
            }
            callbacks.pushNotice(`Game failed to start: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async advanceUnoGame(table, engineOverride, beforeStacksOverride, lobby, currentProfile, callbacks) {
        if (!lobby || !currentProfile)
            return;
        try {
            const gameState = engineOverride
                ? { engine: engineOverride, beforeStacks: beforeStacksOverride ?? {} }
                : callbacks.loadUnoGameState(table);
            if (!gameState)
                return;
            const engine = gameState.engine;
            let safety = 0;
            while (!engine.isGameOver() && safety < 200) {
                // Check for expired challenge windows
                if (engine.checkExpiredChallengeWindow()) {
                    callbacks.pushEvent('Challenge window expired');
                }
                const currentPlayer = engine.getCurrentPlayer();
                if (!currentPlayer)
                    break;
                // If it's a human player's turn, stop and wait for input
                if (!currentPlayer.isBot) {
                    callbacks.saveUnoGameState(table, engine, gameState.beforeStacks);
                    await callbacks.persistState();
                    callbacks.updateTablePanel();
                    return;
                }
                // Bot's turn - perform bot action
                await callbacks.performBotUnoAction(engine, currentPlayer.id, callbacks.pushEvent);
                // Broadcast card played event
                const state = engine.getGameState();
                await callbacks.broadcastEvent(table.id, 'cardPlayed', {
                    playerId: currentPlayer.id,
                    playerName: currentPlayer.name,
                    lastAction: state.lastAction,
                    currentColor: state.currentColor,
                    direction: state.direction,
                });
                callbacks.saveUnoGameState(table, engine, gameState.beforeStacks);
                await callbacks.persistState();
                safety += 1;
            }
            // Check if safety limit was reached
            if (safety >= 200 && !engine.isGameOver()) {
                callbacks.pushNotice('Game stalled after 200 bot actions. Canceling game.');
                table.hand = undefined;
                table.updatedAt = Date.now();
                await callbacks.persistState();
                callbacks.updateTablePanel();
                return;
            }
            // Check if game is over
            if (engine.isGameOver()) {
                await callbacks.finalizeUnoGame(table, engine, gameState.beforeStacks);
                callbacks.updateTablePanel();
                return;
            }
            callbacks.saveUnoGameState(table, engine, gameState.beforeStacks);
            await callbacks.persistState();
            callbacks.updateTablePanel();
        }
        catch (error) {
            callbacks.pushNotice(`Game error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            callbacks.updateTablePanel();
        }
    }
    async performBotUnoAction(engine, playerId, pushEvent) {
        const player = engine.getPlayer(playerId);
        if (!player)
            return;
        const state = engine.getGameState();
        // If there's a draw stack, bot must draw (no option to play cards)
        if (state.drawStack > 0) {
            const result = engine.drawCard(playerId);
            pushEvent(result.message);
            return;
        }
        // Call UNO if we have 2 cards left (before playing second-to-last card)
        if (player.hand.length === 2 && !player.calledUno) {
            engine.callUno(playerId);
            pushEvent(`${player.name} called UNO!`);
        }
        // Get playable cards
        const playableIndices = engine.getPlayableCards(playerId);
        if (playableIndices.length === 0) {
            // No playable cards - must draw
            const result = engine.drawCard(playerId);
            pushEvent(result.message);
            // If drawn card is playable, bot will play it (25% chance for variety)
            if (result.canPlayDrawnCard && Math.random() > 0.25) {
                const lastCardIndex = player.hand.length - 1;
                const card = player.hand[lastCardIndex];
                // If it's a wild, choose color strategically
                let chosenColor;
                if (card.value === 'Wild' || card.value === 'Wild4' || card.value === 'WildChange') {
                    chosenColor = this.chooseBotWildColor(player);
                }
                const playResult = engine.playCard(playerId, lastCardIndex, chosenColor);
                if (playResult.success) {
                    pushEvent(playResult.message);
                }
            }
            return;
        }
        // Bot strategy: Prioritize action cards, then match color over number, save wilds
        let bestCardIndex = playableIndices[0];
        let bestPriority = -1;
        for (const index of playableIndices) {
            const card = player.hand[index];
            let priority = 0;
            // Prioritize action cards
            if (['Skip', 'Reverse', 'Draw2'].includes(card.value)) {
                priority = 3;
            }
            // Then color matches
            else if (card.color === state.currentColor) {
                priority = 2;
            }
            // Then number matches
            else if (card.color !== 'W') {
                priority = 1;
            }
            // Save wilds for last (unless it's the only option)
            else {
                priority = 0;
            }
            if (priority > bestPriority) {
                bestPriority = priority;
                bestCardIndex = index;
            }
        }
        const card = player.hand[bestCardIndex];
        // If playing a wild, choose color strategically
        let chosenColor;
        if (card.value === 'Wild' || card.value === 'Wild4' || card.value === 'WildChange') {
            chosenColor = this.chooseBotWildColor(player);
        }
        const result = engine.playCard(playerId, bestCardIndex, chosenColor);
        if (result.success) {
            pushEvent(result.message);
        }
    }
    chooseBotWildColor(player) {
        // Count cards by color
        const colorCounts = { 'R': 0, 'G': 0, 'B': 0, 'Y': 0 };
        for (const card of player.hand) {
            if (card.color !== 'W') {
                colorCounts[card.color] = (colorCounts[card.color] || 0) + 1;
            }
        }
        // Choose color with most cards
        let bestColor = 'R';
        let maxCount = -1;
        for (const [color, count] of Object.entries(colorCounts)) {
            if (count > maxCount) {
                maxCount = count;
                bestColor = color;
            }
        }
        return bestColor;
    }
    async finalizeUnoGame(table, engine, beforeStacks, lobby, profiles, currentProfile, callbacks) {
        if (!lobby || !currentProfile)
            return;
        const state = engine.getGameState();
        const scores = engine.getScores();
        // Winner is first player to go out
        const winnerId = state.winners[0];
        const winner = state.players.find(p => p.id === winnerId);
        if (!winner)
            return;
        // Calculate points - winner gets sum of all other players' scores
        let totalPoints = 0;
        for (const [playerId, points] of Object.entries(scores)) {
            if (playerId !== winnerId) {
                totalPoints += points;
            }
        }
        // Convert points to chips using stake as multiplier (bigBlind)
        const chipMultiplier = table.bigBlind;
        const winnings = totalPoints * chipMultiplier;
        // Update stacks
        table.players = table.players.map((player) => {
            if (player.role !== 'player')
                return player;
            if (player.userId === winnerId) {
                return {
                    ...player,
                    stack: player.stack + winnings,
                };
            }
            else {
                // Losers pay proportional to their points
                const playerPoints = scores[player.userId] || 0;
                const loss = playerPoints * chipMultiplier;
                return {
                    ...player,
                    stack: Math.max(0, player.stack - loss),
                };
            }
        });
        callbacks.clearTableHand(table);
        callbacks.updateTableStatus(table);
        // Update profiles
        table.players.forEach((player) => {
            if (player.role !== 'player' || (0, lib_1.isBotPlayer)(player))
                return;
            const profile = profiles[player.userId];
            if (!profile)
                return;
            if (beforeStacks[player.userId] === undefined)
                return;
            const before = beforeStacks[player.userId] ?? player.stack;
            const delta = player.stack - before;
            callbacks.updateStatsAfterHand(profile, delta, winnings);
            profile.wallet.chips += lib_1.ACTIVITY_REWARD;
            profile.wallet.lifetimeEarned += lib_1.ACTIVITY_REWARD;
            if (delta > 0) {
                profile.wallet.chips += lib_1.WIN_REWARD;
                profile.wallet.lifetimeEarned += lib_1.WIN_REWARD;
            }
            callbacks.handleAchievementUnlocks(profile);
        });
        const currentDelta = (table.players.find((p) => p.userId === currentProfile?.userId)?.stack ?? 0) -
            (beforeStacks[currentProfile.userId] ?? 0);
        if (currentDelta > 0) {
            callbacks.pushNotice(`You won ${currentDelta} ${lib_1.CHIP_NAME}.`);
            callbacks.emitLiveChat(`BIG WIN: ${currentProfile.username} won ${currentDelta} in ${table.gameName} (#${table.id})`);
        }
        callbacks.pushEvent(`${winner.name} wins! Game finished at table #${table.id}.`);
        // Broadcast game ended event
        await callbacks.broadcastEvent(table.id, 'gameEnded', {
            winnerId,
            winnerName: winner.name,
            winnings,
            scores,
        });
        await callbacks.persistState();
    }
    async handleUnoAction(action, cardIndex, chosenColor, currentProfile, lobby, callbacks) {
        if (!currentProfile || !lobby)
            return;
        const tableId = currentProfile.currentTableId;
        if (!tableId)
            return;
        await callbacks.reloadState();
        const table = callbacks.findTableById(tableId);
        if (!table || !table.hand) {
            callbacks.pushNotice('No active game to act on.');
            return;
        }
        const gameState = callbacks.loadUnoGameState(table);
        if (!gameState) {
            callbacks.pushNotice('Failed to load game state.');
            return;
        }
        const engine = gameState.engine;
        const currentPlayer = engine.getCurrentPlayer();
        if (!currentPlayer || currentPlayer.id !== currentProfile.userId) {
            callbacks.pushNotice('Not your turn.');
            return;
        }
        const state = engine.getGameState();
        switch (action) {
            case 'play-card':
                if (cardIndex === undefined) {
                    callbacks.pushNotice('No card selected.');
                    return;
                }
                const card = currentPlayer.hand[cardIndex];
                if (!engine.canPlayCard(currentProfile.userId, card)) {
                    callbacks.pushNotice('Cannot play that card.');
                    return;
                }
                // If it's a wild and no color chosen, prompt for color
                let color = chosenColor;
                if ((card.value === 'Wild' || card.value === 'Wild4' || card.value === 'WildChange') && !color) {
                    if (callbacks.showColorSelectionDialog) {
                        const selectedColor = await callbacks.showColorSelectionDialog();
                        if (!selectedColor)
                            return; // User canceled
                        color = selectedColor;
                    }
                    else {
                        callbacks.pushNotice('Must choose a color for wild cards.');
                        return;
                    }
                }
                const playResult = engine.playCard(currentProfile.userId, cardIndex, color);
                if (!playResult.success) {
                    callbacks.pushNotice(playResult.message);
                    return;
                }
                callbacks.pushEvent(playResult.message);
                // Broadcast card played event
                await callbacks.broadcastEvent(table.id, 'cardPlayed', {
                    playerId: currentProfile.userId,
                    playerName: currentProfile.username,
                    cardId: card.id,
                    chosenColor: color,
                });
                if (playResult.challengeOpened) {
                    await callbacks.broadcastEvent(table.id, 'challengeOpened', {
                        type: state.challengeWindow?.type,
                        targetPlayerId: state.challengeWindow?.targetPlayerId,
                        expiresAt: state.challengeWindow?.expiresAt,
                    });
                }
                break;
            case 'draw-card':
                const drawResult = engine.drawCard(currentProfile.userId);
                if (!drawResult.success) {
                    callbacks.pushNotice(drawResult.message);
                    return;
                }
                callbacks.pushEvent(drawResult.message);
                await callbacks.broadcastEvent(table.id, 'cardDrawn', {
                    playerId: currentProfile.userId,
                    playerName: currentProfile.username,
                    count: drawResult.cards.length,
                });
                break;
            case 'call-uno':
                engine.callUno(currentProfile.userId);
                callbacks.pushEvent(`${currentProfile.username} called UNO!`);
                await callbacks.broadcastEvent(table.id, 'unoCalled', {
                    playerId: currentProfile.userId,
                    playerName: currentProfile.username,
                });
                break;
            case 'challenge-uno':
                if (!state.challengeWindow || state.challengeWindow.type !== 'uno') {
                    callbacks.pushNotice('No UNO challenge available.');
                    return;
                }
                const targetId = state.challengeWindow.targetPlayerId;
                const unoResult = engine.challengeUno(currentProfile.userId, targetId);
                callbacks.pushEvent(unoResult.message);
                await callbacks.broadcastEvent(table.id, 'challengeClosed', {
                    type: 'uno',
                    success: unoResult.success,
                    challengerId: currentProfile.userId,
                    targetId,
                    penaltyCards: unoResult.penaltyCards,
                });
                break;
            case 'challenge-wild-four':
                if (!state.challengeWindow || state.challengeWindow.type !== 'wild-draw-four') {
                    callbacks.pushNotice('No Wild Draw 4 challenge available.');
                    return;
                }
                const wild4Result = engine.challengeWildDrawFour(currentProfile.userId);
                callbacks.pushEvent(wild4Result.message);
                await callbacks.broadcastEvent(table.id, 'challengeClosed', {
                    type: 'wild-four',
                    success: wild4Result.success,
                    challengerId: currentProfile.userId,
                    penaltyCards: wild4Result.penaltyCards,
                });
                break;
            default:
                callbacks.pushNotice('Unknown action.');
                return;
        }
        callbacks.saveUnoGameState(table, engine, gameState.beforeStacks);
        await callbacks.persistState();
        await callbacks.advanceUnoGame(table, engine, gameState.beforeStacks);
    }
}
exports.GameStateManager = GameStateManager;
