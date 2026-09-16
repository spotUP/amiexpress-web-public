"use strict";
/**
 * SKITGUBBE (vändtia) at a lobby table.
 *
 * The rules are in `engine.ts`; this seats people, drives the bots through
 * the SDK's CardGameAI, keeps the position in `table.hand.snapshot` so every
 * node sees the same game, and says who the Skitgubbe was.
 *
 * KEYS, which the panel also prints:
 *   swap    1-3 pick a hand card, 4-6 the table card it changes places with,
 *           X when you are happy with what is face up
 *   playing 1-9/0 or the arrows pick a card, X plays it, C takes the pile
 *
 * Nothing is wagered here: "skitgubbe is a social game, it requires no buy
 * in" (sysop, 2026-09-15).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VandtiaGameModule = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const utils_1 = require("../../utils");
const engine_1 = require("./engine");
const refusal_1 = require("../refusal");
class VandtiaGameModule {
    toggleView() {
        this.handView = this.handView === 'hand' ? 'table' : 'hand';
        this.selectedCardIndex = null; // the numbers now mean other cards
        this.host.pushNotice(this.handView === 'table'
            ? 'Showing the cards in front of you. V shows your hand.'
            : 'Showing your hand. V shows the cards in front of you.');
        this.host.updateAllPanels();
    }
    constructor(host) {
        this.host = host;
        this.ids = ['skitgubbe'];
        this.usesPokerEngine = false;
        this.hintKind = 'vandtia';
        /** The card the caller has picked out of whatever they are playing from. */
        this.selectedCardIndex = null;
        /** During the swap: the hand card waiting for a table card to change with. */
        this.selectedHandIndex = null;
        /**
         * WHICH OF THE CALLER'S CARDS the hand panel shows.
         *
         * The upper panel is the middle of the table - the pile and the stock -
         * and stays that way; the lower one is yours, and you have two lots: the
         * cards in your hand and the six in front of you. `V` flips between them
         * ("add V to flip between my hand and my cards on the table. the upper
         * panel shows stack and pile", sysop 2026-09-15), which also answers the
         * complaint it came from: the table cards are not on screen at all until
         * you ask for them, or until they become the cards you are playing.
         */
        this.handView = 'hand';
    }
    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------
    load(table) {
        if (!table.hand)
            return null;
        try {
            const engine = engine_1.VandtiaEngine.deserialize(table.hand.snapshot);
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
    currentTable() {
        const tableId = this.host.currentProfile?.currentTableId;
        return tableId ? this.host.findTableById(tableId) ?? null : null;
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
            if (seated.length < 2) {
                this.host.pushNotice('Skitgubbe needs at least two players.');
                return;
            }
            const engine = new engine_1.VandtiaEngine(seated.map((p) => p.userId), seated.map((p) => p.username), seated.map((p) => (0, utils_1.isBotPlayer)(p)));
            this.selectedCardIndex = null;
            this.selectedHandIndex = null;
            this.save(fresh, engine, {}, Date.now());
            this.host.updateTableStatus(fresh);
            this.host.pushEvent(`Skitgubbe dealt at table #${fresh.id}. Swap, then play.`);
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
    // Driving the bots
    // ------------------------------------------------------------------
    async advance(table) {
        const loaded = this.load(table);
        if (!loaded)
            return;
        const { engine, beforeStacks } = loaded;
        // The swap happens all at once: every bot arranges its own table before
        // anybody plays, and a human's swap is what the rest are waiting on.
        if (engine.state.phase === 'swap') {
            for (const player of engine.state.players) {
                if (!player.isBot || player.ready)
                    continue;
                for (let attempt = 0; attempt < 6 && !player.ready; attempt += 1) {
                    await this.playBotSwap(engine, player.id);
                }
                // Whatever it thinks of its table, it is not holding the game up.
                if (!player.ready)
                    engine.finishSwap(player.id);
            }
            this.save(table, engine, beforeStacks);
            await this.host.persistState();
            this.host.updateAllPanels();
            // Somebody human has still to arrange their table.
            if (engine.state.phase !== 'playing')
                return;
        }
        let guard = 0;
        while (engine.state.phase === 'playing' && guard < 600) {
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
        if (engine.state.phase === 'over')
            await this.finalize(table, engine);
    }
    async playBotSwap(engine, playerId) {
        // No pause for a swap. It happens behind the other players' hands at a
        // real table and nobody watches it; pausing here only makes the door
        // answer "Please wait for current action to complete" to every key the
        // caller presses while it runs (sysop's screenshot, 2026-09-15).
        const decision = await this.decide(engine, playerId, 0);
        if (decision?.action === bbs_door_sdk_1.VandtiaActionType.SWAP
            && typeof decision.handIndex === 'number' && typeof decision.faceUpIndex === 'number') {
            engine.swap(playerId, decision.handIndex, decision.faceUpIndex);
            return;
        }
        engine.finishSwap(playerId);
    }
    async playBotTurn(engine, playerId) {
        const decision = await this.decide(engine, playerId);
        if (decision?.action === bbs_door_sdk_1.VandtiaActionType.TAKE_PILE) {
            return engine.takePile(playerId).success;
        }
        if (typeof decision?.cardIndex === 'number') {
            const result = engine.playCard(playerId, decision.cardIndex);
            if (result.success)
                return true;
        }
        // Whatever the strategy said, the position has the last word - a bot
        // must never wedge a table.
        const legal = engine.legalPlays(playerId);
        if (legal.length > 0)
            return engine.playCard(playerId, legal[0]).success;
        if (engine.state.pile.length > 0)
            return engine.takePile(playerId).success;
        return false;
    }
    async decide(engine, playerId, paceMs) {
        if (!this.host.cardGameAI?.hasStrategy('vandtia'))
            return null;
        return this.host.cardGameAI.makeDecision('vandtia', {
            difficulty: bbs_door_sdk_1.Difficulty.MEDIUM,
            playerId,
            engine: engine,
            thinkingDelayMs: paceMs ?? VandtiaGameModule.BOT_PACE_MS,
        });
    }
    // ------------------------------------------------------------------
    // The caller's moves
    // ------------------------------------------------------------------
    /**
     * A number key. Cards 1-3 are the hand and 4-6 the table while swapping;
     * afterwards it simply picks from whatever pile is in play.
     */
    /**
     * The card a second press of the same key would play.
     *
     * Nothing during the swap - there 1-3 picks a hand card and 4-6 the table
     * card it changes places with, so a repeat is half of somebody's move -
     * and nothing while the panel is showing the cards in front of you, which
     * are shown rather than played from.
     */
    selectedCard(table) {
        if (this.handView === 'table')
            return null;
        const loaded = this.load(table);
        if (!loaded || loaded.engine.state.phase === 'swap')
            return null;
        return this.selectedCardIndex;
    }
    /**
     * The way out of a refused card in this game.
     *
     * Taking the pile is always the answer - it is the rule for a player who
     * cannot go ("Om en spelare inte kan lägga ett kort, måste denne ta upp
     * hela högen") - but which cards WOULD go is worth saying while the pile is
     * still small enough to want.
     */
    refusalAdvice(table) {
        const loaded = this.load(table);
        const top = loaded?.engine.topOfPile();
        if (!top)
            return 'The pile is empty - anything goes.';
        return `Play ${(0, engine_1.cardId)(top)} or higher, a 2, or a 10 - or press C to take the pile.`;
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
        if (!player || !userId)
            return;
        if (loaded.engine.state.phase === 'swap') {
            this.handleSwapKey(table, loaded, userId, index);
            return;
        }
        const cards = loaded.engine.cardsInPlay(userId);
        if (index < 0 || index >= cards.length)
            return;
        this.selectedCardIndex = index;
        this.host.pushNotice(`Selected ${(0, engine_1.cardId)(cards[index])} - press it again, or ENTER, to play.`);
        this.host.updateAllPanels();
    }
    /** 1-3 picks a hand card, 4-6 the face-up card it changes places with. */
    handleSwapKey(table, loaded, userId, index) {
        const player = loaded.engine.playerById(userId);
        if (!player)
            return;
        if (index < 3) {
            if (index >= player.hand.length)
                return;
            this.selectedHandIndex = index;
            this.host.pushNotice(`${(0, engine_1.cardId)(player.hand[index])} picked - now 4, 5 or 6 for the table card.`);
            this.host.updateAllPanels();
            return;
        }
        const faceUpIndex = index - 3;
        if (faceUpIndex >= player.faceUp.length)
            return;
        if (this.selectedHandIndex === null) {
            this.host.pushNotice('Pick a hand card first - 1, 2 or 3.');
            return;
        }
        const result = loaded.engine.swap(userId, this.selectedHandIndex, faceUpIndex);
        this.selectedHandIndex = null;
        if (!result.success) {
            this.host.pushNotice(result.message);
            return;
        }
        this.save(table, loaded.engine, loaded.beforeStacks);
        void this.host.persistState();
        this.host.pushNotice(result.message);
        this.host.updateAllPanels();
    }
    moveSelection(delta) {
        const table = this.currentTable();
        if (!table)
            return;
        const loaded = this.load(table);
        if (!loaded)
            return;
        const userId = this.host.currentProfile?.userId;
        if (!userId)
            return;
        const cards = loaded.engine.state.phase === 'swap'
            ? loaded.engine.playerById(userId)?.hand ?? []
            : loaded.engine.cardsInPlay(userId);
        if (cards.length === 0)
            return;
        const size = cards.length;
        const current = loaded.engine.state.phase === 'swap' ? this.selectedHandIndex : this.selectedCardIndex;
        let next;
        if (current === null) {
            const legal = loaded.engine.legalPlays(userId);
            next = legal.length > 0 && loaded.engine.state.phase !== 'swap'
                ? legal[0]
                : (delta >= 0 ? 0 : size - 1);
        }
        else {
            next = ((current + delta) % size + size) % size;
        }
        if (loaded.engine.state.phase === 'swap')
            this.selectedHandIndex = next;
        else
            this.selectedCardIndex = next;
        this.host.pushNotice(`${(0, engine_1.cardId)(cards[next])} picked.`);
        this.host.updateAllPanels();
    }
    /** X: finish swapping, or play the picked card. */
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
            if (loaded.engine.state.phase === 'swap') {
                const result = loaded.engine.finishSwap(userId);
                if (!result.success) {
                    this.host.pushNotice(result.message);
                    return;
                }
                this.selectedHandIndex = null;
                this.host.pushEvent(`${this.host.currentProfile?.username ?? 'Someone'} is ready.`);
                this.save(fresh, loaded.engine, loaded.beforeStacks);
                await this.host.persistState();
                await this.advance(fresh);
                return;
            }
            if (loaded.engine.currentPlayerId() !== userId) {
                /*
                 * A BOT HOLDS THE TURN, SO PLAY IT - do not just say so.
                 *
                 * "skitgubbe says not my turn and the game doesnt advance" (sysop,
                 * 2026-09-16). The bots are pumped by `advance`, and the only thing
                 * that called it was the tail of the caller's own successful play. So
                 * any way of arriving at a bot's turn WITHOUT having just played -
                 * re-entering the door, a reload, a refresh, a play that was refused,
                 * or a rule that hands the turn around differently than it used to -
                 * left the table sitting on a bot for ever, answering every keypress
                 * with "Not your turn."
                 *
                 * A table that is waiting on a bot is a table that should be moving.
                 */
                const onTurn = loaded.engine.playerById(loaded.engine.currentPlayerId() ?? '');
                if (onTurn?.isBot) {
                    await this.advance(fresh);
                    return;
                }
                this.host.pushNotice(`Waiting for ${onTurn?.name ?? 'the next player'}.`);
                return;
            }
            if (this.selectedCardIndex === null) {
                const blind = loaded.engine.sourceFor(userId) === 'faceDown';
                this.host.pushNotice(blind
                    ? 'Pick one of your face-down cards - you will not know what it is until it lands.'
                    : 'Pick a card first - press its number, or use the arrows.');
                return;
            }
            const result = loaded.engine.playCard(userId, this.selectedCardIndex);
            if (!result.success) {
                this.host.pushNotice((0, refusal_1.explainRefusal)(result.message, this.refusalAdvice(fresh)));
                return;
            }
            this.selectedCardIndex = null;
            this.host.pushEvent(result.message);
            this.save(fresh, loaded.engine, loaded.beforeStacks);
            await this.host.persistState();
            await this.advance(fresh);
        });
    }
    /** C: take the pile, because nothing in your hand will go on it. */
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
            const result = loaded.engine.takePile(userId);
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
    tertiaryAction() {
        this.host.pushNotice('Skitgubbe: pick a card and press it again - or ENTER - to play it. C takes the pile.');
    }
    render(painter, table) {
        painter.renderVandtiaGameView(table);
    }
    /** The board panel changes hands mid-game, and the title says so. */
    panelTitles(table) {
        const loaded = this.load(table);
        const swapping = loaded?.engine.state.phase === 'swap';
        const meId = this.host.currentProfile?.userId;
        const source = loaded && meId ? loaded.engine.sourceFor(meId) : 'hand';
        /*
         * THE COUNTS GO IN THE TITLE, because the panel is the only place they
         * can survive.
         *
         * "pile and stock doesnt draw" (sysop, 2026-09-16). The pile and stock
         * numbers lived in the panel's TEXT - and drawing the cards hides that
         * text, by design: the widgets cover the fallback. So the moment a card
         * landed, a panel named PILE AND STOCK stopped showing either number,
         * and the stock - which is the clock this game is played against - was
         * invisible for the whole hand.
         *
         * A title is drawn by the frame, not by the widgets, so it is there
         * whether the cards draw or not.
         */
        const counts = loaded
            ? `  ${loaded.engine.state.pile.length} / stock ${loaded.engine.state.stock.length}`
            : '';
        return {
            // The middle of the table, always.
            board: `Pile${counts}`,
            players: 'Players',
            hand: this.handView === 'table' ? 'In front of you'
                : swapping ? 'Your hand'
                    : source === 'faceUp' ? 'Your table cards'
                        : source === 'faceDown' ? 'Face down' : 'Your hand',
        };
    }
    /**
     * The keys, for the activity panel - which is painted by one writer that
     * runs after `render()`, so a legend written into the widget directly does
     * not survive the frame (lib/games/types.ts).
     */
    activityLines(table) {
        const loaded = this.load(table);
        const meId = this.host.currentProfile?.userId;
        if (!loaded || !meId)
            return [];
        const engine = loaded.engine;
        const state = engine.state;
        const me = engine.playerById(meId);
        if (!me)
            return ['Observing.'];
        const label = (card) => `${card.rank}${card.suit}`;
        if (state.phase === 'swap') {
            const picked = this.selectedHandIndex;
            return [
                me.ready
                    ? '{cyan-fg}Ready.{/} Waiting for the others...'
                    : '{cyan-fg}1-3{/} hand  {cyan-fg}4-6{/} table  {cyan-fg}V{/} flip  {cyan-fg}X{/} ready',
                `Hand ${me.hand.map((card, i) => (i === picked ? `{yellow-bg}{black-fg}${i + 1}{/}{/}` : `{green-fg}${i + 1}{/}`)
                    + ':' + label(card)).join('  ')}`,
                `Tbl  ${me.faceUp.map((card, i) => `{green-fg}${i + 4}{/}:` + label(card)).join('  ')}`,
            ];
        }
        if (state.phase === 'over')
            return [];
        if (engine.currentPlayerId() !== meId)
            return ['Waiting for the other players...'];
        const source = engine.sourceFor(meId);
        const legal = engine.legalPlays(meId);
        const keys = legal.map((i) => i === this.selectedCardIndex ? `{yellow-bg}{black-fg}${i + 1}{/}{/}` : `{green-fg}${i + 1}{/}`).join(' ');
        const top = engine.topOfPile();
        if (source === 'faceDown') {
            return [
                `{cyan-fg}Blind.{/} Pick ${keys} and {cyan-fg}ENTER{/} turns it over`,
                top ? `On the pile: ${label(top)}` : 'The pile is empty - anything goes.',
            ];
        }
        const where = source === 'faceUp' ? ' (your table cards)' : '';
        if (legal.length === 0) {
            return [`{yellow-fg}Nothing will go{/}${where} - {cyan-fg}C{/} takes the pile`];
        }
        return [
            `Pick ${keys}  {cyan-fg}ENTER{/} plays${state.pile.length > 0 ? `  {cyan-fg}C{/} takes pile` : ''}`
                + `  {cyan-fg}V{/} ${this.handView === 'table' ? 'hand' : 'my table'}`,
            top ? `On the pile: ${label(top)}${where}` : `Lead anything${where}`,
        ];
    }
    updateActionButtons(table) {
        const loaded = this.load(table);
        const me = this.host.currentProfile?.userId;
        const swapping = loaded?.engine.state.phase === 'swap';
        const canTake = Boolean(loaded && me && !swapping && loaded.engine.state.pile.length > 0
            && loaded.engine.currentPlayerId() === me);
        this.host.labelVandtiaButtons(Boolean(loaded), Boolean(swapping), canTake);
    }
    // ------------------------------------------------------------------
    /** Social game: the title is the only thing anybody loses. */
    async finalize(table, engine) {
        const loserId = engine.state.loserId;
        const loserName = engine.state.players.find((p) => p.id === loserId)?.name ?? 'Nobody';
        this.host.pushEvent(`${loserName} is the Skitgubbe at table #${table.id}!`);
        const me = this.host.currentProfile?.userId;
        if (me && loserId === me)
            this.host.pushNotice('You are the Skitgubbe. Deal again?');
        else if (me && loserId)
            this.host.pushNotice(`${loserName} is the Skitgubbe.`);
        table.lastHand = {
            board: engine.state.pile.map(engine_1.cardId),
            hands: Object.fromEntries(engine.state.players.map((p) => [p.id, p.hand.map(engine_1.cardId)])),
            pot: 0,
            winners: engine.state.finishedOrder.map((id) => ({
                userId: id,
                username: engine.state.players.find((p) => p.id === id)?.name ?? id,
                amount: 0,
            })),
            playedAt: Date.now(),
        };
        this.host.clearTableHand(table);
        this.host.updateTableStatus(table);
        await this.host.persistState();
        this.host.updateAllPanels();
    }
}
exports.VandtiaGameModule = VandtiaGameModule;
/**
 * How long a bot appears to think here.
 *
 * The SDK's default is 0.8-2s, which is right for poker - a bot acts a
 * handful of times a hand. This game runs to hundreds of plays, three
 * quarters of them bots', so the same pause would turn one game into an
 * afternoon. Long enough to watch a card land, short enough to play.
 */
VandtiaGameModule.BOT_PACE_MS = 350;
