"use strict";
/**
 * SKITGUBBE at a lobby table.
 *
 * The rules live in `engine.ts` and know nothing about the door; this is the
 * part that seats people, drives the bots, keeps the game in
 * `table.hand.snapshot` so every node sees the same position, and settles up
 * when somebody is left holding the cards.
 *
 * It implements `TableGameModule`, so index.ts never learns its name: the
 * registry hands the table to whoever serves its `gameId`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkitgubbeGameModule = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const utils_1 = require("../../utils");
const constants_1 = require("../../constants");
const engine_1 = require("./engine");
const refusal_1 = require("../refusal");
class SkitgubbeGameModule {
    constructor(host) {
        this.host = host;
        this.ids = ['skitgubbe-tricks'];
        /** Its snapshot is a SkitgubbeSnapshot; the poker engine must not touch it. */
        this.usesPokerEngine = false;
        this.hintKind = 'skitgubbe';
        /** The card the caller has picked out of their hand, if any. */
        this.selectedCardIndex = null;
    }
    // ------------------------------------------------------------------
    // State, as the lobby stores it
    // ------------------------------------------------------------------
    load(table) {
        if (!table.hand)
            return null;
        try {
            const engine = engine_1.SkitgubbeEngine.deserialize(table.hand.snapshot);
            return { engine, beforeStacks: table.hand.beforeStacks ?? {} };
        }
        catch (error) {
            this.host.pushNotice(`Failed to restore Skitgubbe: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    save(table, engine, beforeStacks, startedAt) {
        table.hand = {
            snapshot: engine.serialize(),
            beforeStacks,
            startedAt: startedAt ?? table.hand?.startedAt ?? Date.now(),
            updatedAt: Date.now(),
        };
        table.updatedAt = Date.now();
    }
    // ------------------------------------------------------------------
    // Starting
    // ------------------------------------------------------------------
    async start(table) {
        try {
            await this.host.reloadState();
            const fresh = this.host.findTableById(table.id);
            if (!fresh) {
                this.host.pushNotice('Table not found.');
                return;
            }
            if (fresh.hand) {
                this.host.pushNotice('Game already in progress.');
                return;
            }
            const seated = fresh.players.filter((player) => player.role === 'player');
            if (seated.length < Math.max(2, fresh.minPlayers)) {
                this.host.pushNotice('Skitgubbe needs at least two players.');
                return;
            }
            const engine = new engine_1.SkitgubbeEngine(seated.map((p) => p.userId), seated.map((p) => p.username), seated.map((p) => (0, utils_1.isBotPlayer)(p)));
            const beforeStacks = {};
            for (const player of seated) {
                if (!(0, utils_1.isBotPlayer)(player))
                    beforeStacks[player.userId] = player.stack;
            }
            this.selectedCardIndex = null;
            this.save(fresh, engine, beforeStacks, Date.now());
            this.host.updateTableStatus(fresh);
            this.host.pushEvent(`Skitgubbe started at table #${fresh.id}.`);
            await this.host.persistState();
            await this.advance(fresh);
        }
        catch (error) {
            const fresh = this.host.findTableById(table.id);
            if (fresh) {
                this.host.clearTableHand(fresh);
                this.host.updateTableStatus(fresh);
                await this.host.persistState();
            }
            this.host.pushNotice(`Game failed to start: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    // ------------------------------------------------------------------
    // Driving the game on
    // ------------------------------------------------------------------
    /**
     * Play out every bot whose turn it is, then stop and let the table be
     * looked at. A guard counts the turns: a rules bug that left nobody able
     * to move would otherwise spin the node rather than show a broken game.
     */
    async advance(table) {
        const loaded = this.load(table);
        if (!loaded)
            return;
        const { engine, beforeStacks } = loaded;
        let guard = 0;
        while (engine.state.phase !== 'over' && guard < 400) {
            guard += 1;
            const currentId = engine.currentPlayerId();
            if (!currentId)
                break;
            const player = engine.playerById(currentId);
            if (!player?.isBot)
                break;
            const moved = await this.playBotTurn(engine, currentId);
            if (!moved)
                break;
            this.host.pushEvent(engine.state.lastAction);
        }
        this.save(table, engine, beforeStacks);
        await this.host.persistState();
        this.host.updateAllPanels();
        if (engine.state.phase === 'over') {
            await this.finalize(table, engine, beforeStacks);
        }
    }
    /** One bot decision, through the SDK's AI if the door gave us one. */
    async playBotTurn(engine, playerId) {
        const legal = engine.legalPlays(playerId);
        const difficulty = bbs_door_sdk_1.Difficulty.MEDIUM;
        if (this.host.cardGameAI?.hasStrategy('skitgubbe')) {
            const decision = await this.host.cardGameAI.makeDecision('skitgubbe', {
                difficulty,
                playerId,
                engine: engine,
            });
            if (decision?.action === bbs_door_sdk_1.SkitgubbeActionType.TAKE_CARD && engine.canTake(playerId)) {
                return engine.takeCard(playerId).success;
            }
            if (typeof decision?.cardIndex === 'number') {
                const result = engine.playCard(playerId, decision.cardIndex);
                if (result.success)
                    return true;
            }
        }
        // No strategy registered, or it offered something the position refuses:
        // play the first legal card, or take. A bot must never wedge a table.
        if (legal.length > 0)
            return engine.playCard(playerId, legal[0]).success;
        if (engine.canTake(playerId))
            return engine.takeCard(playerId).success;
        return false;
    }
    // ------------------------------------------------------------------
    // What the caller can do
    // ------------------------------------------------------------------
    currentTable() {
        const tableId = this.host.currentProfile?.currentTableId;
        return tableId ? this.host.findTableById(tableId) ?? null : null;
    }
    /** What this caller was dealt, for the door's deal animation. */
    dealtHand(table, userId) {
        return this.load(table)?.engine.playerById(userId)?.hand ?? [];
    }
    /** The card a second press of the same key - or ENTER - would play. */
    selectedCard() {
        return this.selectedCardIndex;
    }
    /** The move that is available when the picked card will not go. */
    refusalAdvice() {
        return 'Pick another card with the arrows, or press C to take the card in front of you.';
    }
    selectCard(index) {
        const table = this.currentTable();
        if (!table)
            return;
        const loaded = this.load(table);
        if (!loaded)
            return;
        const userId = this.host.currentProfile?.userId;
        const player = userId ? loaded.engine.playerById(userId) : undefined;
        if (!player)
            return;
        if (index < 0 || index >= player.hand.length)
            return;
        this.selectedCardIndex = index;
        this.host.pushNotice(`Selected ${(0, engine_1.cardId)(player.hand[index])} - press it again, or ENTER, to play.`);
        this.host.updateAllPanels();
    }
    /**
     * Left/right: walk the hand, wrapping at both ends. Starts at the first
     * card that can legally be played, so the arrow keys are useful before
     * they are precise.
     */
    moveSelection(delta) {
        const table = this.currentTable();
        if (!table)
            return;
        const loaded = this.load(table);
        if (!loaded)
            return;
        const userId = this.host.currentProfile?.userId;
        const player = userId ? loaded.engine.playerById(userId) : undefined;
        if (!player || player.hand.length === 0)
            return;
        const size = player.hand.length;
        if (this.selectedCardIndex === null) {
            const legal = userId ? loaded.engine.legalPlays(userId) : [];
            this.selectedCardIndex = legal.length > 0 ? legal[0] : (delta >= 0 ? 0 : size - 1);
        }
        else {
            this.selectedCardIndex = ((this.selectedCardIndex + delta) % size + size) % size;
        }
        this.host.pushNotice(`Selected ${(0, engine_1.cardId)(player.hand[this.selectedCardIndex])} - ENTER plays it.`);
        this.host.updateAllPanels();
    }
    /** X / pad A: play the selected card. */
    primaryAction() {
        const table = this.currentTable();
        if (!table)
            return;
        this.host.runAction(async () => {
            await this.host.reloadState();
            const fresh = this.host.findTableById(table.id);
            if (!fresh)
                return;
            const loaded = this.load(fresh);
            if (!loaded) {
                this.host.pushNotice('No game in progress. Press D to deal.');
                return;
            }
            const userId = this.host.currentProfile?.userId;
            if (!userId)
                return;
            if (loaded.engine.currentPlayerId() !== userId) {
                // A table waiting on a bot should be moving, not answering every
                // keypress with "Not your turn." - see the vandtia module for the
                // whole argument (sysop, 2026-09-16).
                const onTurn = loaded.engine.playerById(loaded.engine.currentPlayerId() ?? '');
                if (onTurn?.isBot) {
                    await this.advance(fresh);
                    return;
                }
                this.host.pushNotice(`Waiting for ${onTurn?.name ?? 'the next player'}.`);
                return;
            }
            if (this.selectedCardIndex === null) {
                this.host.pushNotice('Pick a card first - press its number.');
                return;
            }
            const result = loaded.engine.playCard(userId, this.selectedCardIndex);
            if (!result.success) {
                this.host.pushNotice((0, refusal_1.explainRefusal)(result.message, this.refusalAdvice()));
                return;
            }
            this.selectedCardIndex = null;
            this.host.pushEvent(result.message);
            this.save(fresh, loaded.engine, loaded.beforeStacks);
            await this.host.persistState();
            await this.advance(fresh);
        });
    }
    /** C / pad B: take the card in front of you rather than beating it. */
    secondaryAction() {
        const table = this.currentTable();
        if (!table)
            return;
        this.host.runAction(async () => {
            await this.host.reloadState();
            const fresh = this.host.findTableById(table.id);
            if (!fresh)
                return;
            const loaded = this.load(fresh);
            if (!loaded)
                return;
            const userId = this.host.currentProfile?.userId;
            if (!userId)
                return;
            if (!loaded.engine.canTake(userId)) {
                this.host.pushNotice('There is nothing to take.');
                return;
            }
            const result = loaded.engine.takeCard(userId);
            if (!result.success) {
                this.host.pushNotice(result.message);
                return;
            }
            this.selectedCardIndex = null;
            this.host.pushEvent(result.message);
            this.save(fresh, loaded.engine, loaded.beforeStacks);
            await this.host.persistState();
            await this.advance(fresh);
        });
    }
    /** Skitgubbe has two moves; there is no third. */
    tertiaryAction() {
        this.host.pushNotice('Skitgubbe: pick a card and press it again - or ENTER - to play it. C takes it.');
    }
    render(painter, table) {
        painter.renderSkitgubbeGameView(table);
    }
    panelTitles() {
        return { board: 'The trick', players: 'Players', hand: 'Your hand' };
    }
    /** DEAL / PLAY and TAKE - the only two moves this game has. */
    updateActionButtons(table) {
        const loaded = this.load(table);
        const me = this.host.currentProfile?.userId;
        const canTake = Boolean(loaded && me && loaded.engine.canTake(me));
        this.host.labelSkitgubbeButtons(Boolean(loaded), canTake);
    }
    // ------------------------------------------------------------------
    // Settling up
    // ------------------------------------------------------------------
    /**
     * One loser, everybody else safe.
     *
     * Skitgubbe is a SOCIAL game and the board's table for it is free: "it
     * requires no buy in" (sysop, 2026-09-15). So when the stake is zero
     * nothing changes hands at all - the result is the whole point, and being
     * the Skitgubbe is the only thing anybody loses. A table created with a
     * stake (the catalogue could offer one later) settles it the way the other
     * games do: the loser pays each survivor.
     */
    async finalize(table, engine, beforeStacks) {
        const loserId = engine.state.loserId;
        const stake = Math.max(0, table.bigBlind);
        const seated = table.players.filter((player) => player.role === 'player');
        const survivors = seated.filter((player) => player.userId !== loserId);
        if (stake > 0) {
            table.players = table.players.map((player) => {
                if (player.role !== 'player')
                    return player;
                if (player.userId === loserId) {
                    return { ...player, stack: Math.max(0, player.stack - stake * survivors.length) };
                }
                return loserId ? { ...player, stack: player.stack + stake } : player;
            });
        }
        const loserName = engine.state.players.find((p) => p.id === loserId)?.name ?? 'Nobody';
        this.host.pushEvent(`${loserName} is the Skitgubbe at table #${table.id}!`);
        const me = this.host.currentProfile?.userId;
        if (me && loserId === me) {
            this.host.pushNotice(stake > 0
                ? `You are the Skitgubbe - ${stake * survivors.length} ${constants_1.CHIP_NAME} to the table.`
                : 'You are the Skitgubbe. Deal again?');
        }
        else if (me && loserId) {
            this.host.pushNotice(stake > 0
                ? `${loserName} is the Skitgubbe. You take ${stake} ${constants_1.CHIP_NAME}.`
                : `${loserName} is the Skitgubbe.`);
        }
        /*
         * Announced rather than only logged - "the game ended now, no dialog
         * announcing that i won or lost or anything" (sysop, 2026-09-16), and
         * every game in the lobby says so the same way.
         */
        this.host.announceGameOver(table.gameName, [
            me && loserId === me
                ? 'You are the Skitgubbe - last one holding cards.'
                : `${loserName} is the Skitgubbe.`,
            '',
            ...seated.map((player) => {
                const you = player.userId === me ? '  (you)' : '';
                return player.userId === loserId
                    ? `${player.username}${you} - the Skitgubbe`
                    : `${player.username}${you} - out`;
            }),
        ].join('\n'));
        /*
         * Counted for the lobby's table of games won (sysop, 2026-09-16). This
         * game names a LOSER rather than a winner, so with two players the other
         * one won it and with three nobody did - the table then records a game
         * played for everybody, which is the honest answer.
         */
        const humans = seated.filter((player) => !(0, utils_1.isBotPlayer)(player)).map((player) => player.userId);
        const survivorIds = survivors.map((player) => player.userId);
        this.host.recordGameResult('skitgubbe-trick', humans, survivorIds.length === 1 ? survivorIds[0] : null);
        // Keep the finished position on the table for a moment: the panels read
        // `table.hand` and a caller who blinks should still see who lost.
        table.lastHand = {
            board: engine.state.table.map(engine_1.cardId),
            hands: Object.fromEntries(engine.state.players.map((p) => [p.id, p.hand.map(engine_1.cardId)])),
            pot: stake * survivors.length,
            winners: survivors.map((player) => ({
                userId: player.userId,
                username: player.username,
                amount: stake,
            })),
            playedAt: Date.now(),
        };
        this.host.clearTableHand(table);
        this.host.updateTableStatus(table);
        await this.host.persistState();
        this.host.updateAllPanels();
    }
}
exports.SkitgubbeGameModule = SkitgubbeGameModule;
