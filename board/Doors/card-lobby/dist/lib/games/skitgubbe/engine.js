"use strict";
/**
 * SKITGUBBE - the engine.
 *
 * A Swedish game in two phases, played with a standard pack
 * (https://www.pagat.com/beating/skitgubbe.html, the basic game):
 *
 *   1. TRICKS. Everyone holds three cards. A trick is TWO cards - the leader
 *      and the next player in rotation - and the higher card takes both,
 *      face down. Each player draws after playing, so the hands stay at
 *      three while the stock lasts. Equal cards are a `stunsa`: they stay on
 *      the table, both draw, the same player leads again, and the pile goes
 *      to whoever wins the replay. The LAST card of the stock is turned into
 *      the trump suit and held back by whoever drew it. The phase ends the
 *      moment a player cannot play.
 *
 *   2. SHEDDING. The cards you won in phase one are now the cards you must
 *      get rid of. The trump drawer leads. You beat the card in front of you
 *      with a higher card of the same suit or with any trump; if you cannot
 *      or will not, you take that one card into your hand and the next
 *      player faces the card underneath. When the trick holds one card per
 *      player it is set aside (`avstick`) and whoever played last leads.
 *      Shed everything and you are safe. The last player still holding cards
 *      is the Skitgubbe.
 *
 * The engine is pure: state in, moves applied, no I/O and no timers. The
 * door's registry (lib/games/registry.ts) drives it, the bots ask the SDK's
 * CardGameAI what to do, and the panels read `state`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkitgubbeEngine = exports.beats = exports.buildSkitgubbeDeck = exports.cardFromId = exports.cardId = exports.rankValue = exports.SUIT_NAMES = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
// ============================================================================
// CARDS
// ============================================================================
/** Low to high; the ace is high in this game. */
const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUIT_ASCII = {
    '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C',
    S: 'S', H: 'H', D: 'D', C: 'C',
};
exports.SUIT_NAMES = {
    S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs',
};
const rankValue = (card) => RANK_ORDER.indexOf(card.rank);
exports.rankValue = rankValue;
const cardId = (card) => `${card.rank}${card.suit}`;
exports.cardId = cardId;
const cardFromId = (id) => ({
    rank: id.slice(0, -1),
    suit: id.slice(-1),
});
exports.cardFromId = cardFromId;
/** The SDK's pack, with its suit symbols folded down to the letters we store. */
const buildSkitgubbeDeck = (seed) => {
    const deck = (0, bbs_door_sdk_1.buildStandardDeck)().map((c) => ({
        rank: c.rank,
        suit: SUIT_ASCII[c.suit],
    }));
    return (0, bbs_door_sdk_1.shuffleCards)(deck, seed);
};
exports.buildSkitgubbeDeck = buildSkitgubbeDeck;
/**
 * Phase two's only question: does `candidate` beat `target`?
 *
 * "A card may be beaten by a higher card of the same suit, and a non-trump
 * may be beaten by any trump."
 */
const beats = (candidate, target, trump) => {
    if (candidate.suit === target.suit)
        return (0, exports.rankValue)(candidate) > (0, exports.rankValue)(target);
    return trump !== undefined && candidate.suit === trump && target.suit !== trump;
};
exports.beats = beats;
// ============================================================================
// ENGINE
// ============================================================================
class SkitgubbeEngine {
    constructor(playerIds, playerNames, isBot, options = {}) {
        if (playerIds.length < 2)
            throw new Error('Skitgubbe needs at least two players');
        const deck = (0, exports.buildSkitgubbeDeck)(options.seed);
        const players = playerIds.map((id, index) => ({
            id,
            name: playerNames[index] ?? id,
            seat: index,
            isBot: isBot[index] ?? false,
            hand: [],
            won: [],
            out: false,
        }));
        // Three each, one at a time, the way it is dealt at a table.
        for (let round = 0; round < 3; round += 1) {
            for (const player of players) {
                const dealt = deck.pop();
                if (dealt)
                    player.hand.push(dealt);
            }
        }
        this.state = {
            phase: 'tricks',
            players,
            stock: deck,
            leaderIndex: 0,
            currentIndex: 0,
            table: [],
            tableOwners: [],
            trickPlayers: players.length,
            finishedOrder: [],
            lastAction: 'Cards are dealt.',
        };
    }
    // --------------------------------------------------------------------
    // Reading the position
    // --------------------------------------------------------------------
    currentPlayerId() {
        if (this.state.phase === 'over')
            return null;
        return this.state.players[this.state.currentIndex]?.id ?? null;
    }
    playerById(playerId) {
        return this.state.players.find((p) => p.id === playerId);
    }
    /** The card the next play has to beat, if there is one. */
    targetCard() {
        return this.state.table[this.state.table.length - 1];
    }
    /**
     * Indices into the player's hand that may be played right now.
     *
     * Phase one has no restriction at all - "the second player may play any
     * card; suits are irrelevant". Phase two allows the leader anything and
     * everyone else only what beats the card in front of them.
     */
    legalPlays(playerId) {
        const player = this.playerById(playerId);
        if (!player || this.state.phase === 'over')
            return [];
        if (this.currentPlayerId() !== playerId)
            return [];
        const all = player.hand.map((_, index) => index);
        if (this.state.phase === 'tricks')
            return all;
        const target = this.targetCard();
        if (!target)
            return all;
        return all.filter((index) => (0, exports.beats)(player.hand[index], target, this.state.trump));
    }
    /** Phase two: may this player take the card in front of them instead of beating it? */
    canTake(playerId) {
        return this.state.phase === 'shedding'
            && this.currentPlayerId() === playerId
            && this.state.table.length > 0;
    }
    // --------------------------------------------------------------------
    // Moves
    // --------------------------------------------------------------------
    playCard(playerId, cardIndex) {
        if (this.state.phase === 'over')
            return { success: false, message: 'The game is over.' };
        if (this.currentPlayerId() !== playerId)
            return { success: false, message: 'Not your turn.' };
        const player = this.playerById(playerId);
        if (!player)
            return { success: false, message: 'You are not in this game.' };
        const card = player.hand[cardIndex];
        if (!card)
            return { success: false, message: 'No such card.' };
        if (!this.legalPlays(playerId).includes(cardIndex)) {
            const target = this.targetCard();
            return {
                success: false,
                message: target
                    ? `${(0, exports.cardId)(card)} does not beat ${(0, exports.cardId)(target)}.`
                    : `${(0, exports.cardId)(card)} cannot be played.`,
            };
        }
        // Whether this card LEADS a trick or ANSWERS one cannot be read off the
        // table: a stunsa leaves bounced cards lying there, so the pile is two
        // cards deep before the replay is even led. The leader's seat is the
        // only honest answer, and it is still current here.
        const isLead = this.state.currentIndex === this.state.leaderIndex;
        player.hand.splice(cardIndex, 1);
        this.state.table.push(card);
        this.state.tableOwners.push(playerId);
        return this.state.phase === 'tricks'
            ? this.afterTrickPlay(player, card, isLead)
            : this.afterSheddingPlay(player, card);
    }
    /**
     * Phase two: "If you cannot or do not wish to beat the card in front of
     * you, you must take it up into your hand."
     */
    takeCard(playerId) {
        if (!this.canTake(playerId))
            return { success: false, message: 'There is nothing to take.' };
        const player = this.playerById(playerId);
        if (!player)
            return { success: false, message: 'You are not in this game.' };
        const taken = this.state.table.pop();
        this.state.tableOwners.pop();
        player.hand.push(taken);
        this.state.lastAction = `${player.name} picks up ${(0, exports.cardId)(taken)}.`;
        if (this.state.table.length === 0) {
            // "If all the cards are picked up, the player to the left of the one
            //  who picked up the last card leads to the next trick."
            this.beginSheddingTrick(this.nextActiveIndex(this.indexOf(playerId)));
        }
        else {
            this.state.currentIndex = this.nextActiveIndex(this.indexOf(playerId));
        }
        this.checkForLoser();
        return { success: true, message: this.state.lastAction };
    }
    // --------------------------------------------------------------------
    // Phase one
    // --------------------------------------------------------------------
    afterTrickPlay(player, card, isLead) {
        this.drawForPlayer(player);
        this.state.lastAction = `${player.name} plays ${(0, exports.cardId)(card)}.`;
        if (isLead) {
            // The leader has played; the next player in rotation answers.
            this.state.currentIndex = this.nextIndex(this.state.leaderIndex);
            return this.endPhaseOneIfStuck() ?? { success: true, message: this.state.lastAction };
        }
        const answer = this.state.table[this.state.table.length - 1];
        const led = this.state.table[this.state.table.length - 2];
        const answerer = this.state.players[this.state.currentIndex];
        if ((0, exports.rankValue)(answer) === (0, exports.rankValue)(led)) {
            // A stunsa: the cards stay, and the same player leads again.
            this.state.lastAction = `Stunsa - ${(0, exports.cardId)(led)} and ${(0, exports.cardId)(answer)} bounce.`;
            this.state.currentIndex = this.state.leaderIndex;
            return this.endPhaseOneIfStuck() ?? { success: true, message: this.state.lastAction };
        }
        const leader = this.state.players[this.state.leaderIndex];
        const winner = (0, exports.rankValue)(answer) > (0, exports.rankValue)(led) ? answerer : leader;
        winner.won.push(...this.state.table);
        const taken = this.state.table.length;
        this.state.table = [];
        this.state.tableOwners = [];
        this.state.leaderIndex = this.indexOf(winner.id);
        this.state.currentIndex = this.state.leaderIndex;
        this.state.lastAction = `${winner.name} takes ${taken} card${taken === 1 ? '' : 's'}.`;
        return this.endPhaseOneIfStuck() ?? { success: true, message: this.state.lastAction };
    }
    /**
     * "Each player draws a card from the stock immediately after playing."
     *
     * The last card of the pack is the trump: its drawer keeps it face down
     * rather than adding it to their hand.
     */
    drawForPlayer(player) {
        const drawn = this.state.stock.pop();
        if (!drawn)
            return;
        if (this.state.stock.length === 0 && this.state.trump === undefined) {
            this.state.trump = drawn.suit;
            this.state.trumpCard = drawn;
            this.state.trumpHolderId = player.id;
            return;
        }
        player.hand.push(drawn);
    }
    /** Phase one is over "when a player is unable to play". */
    endPhaseOneIfStuck() {
        if (this.state.phase !== 'tricks')
            return null;
        if (this.state.players[this.state.currentIndex].hand.length > 0)
            return null;
        // An unfinished trick goes back to whoever played into it.
        this.state.table.forEach((card, index) => {
            const owner = this.playerById(this.state.tableOwners[index]);
            if (owner)
                owner.hand.push(card);
        });
        this.state.table = [];
        this.state.tableOwners = [];
        this.beginSheddingPhase();
        return { success: true, message: this.state.lastAction };
    }
    // --------------------------------------------------------------------
    // Phase two
    // --------------------------------------------------------------------
    beginSheddingPhase() {
        for (const player of this.state.players) {
            player.hand.push(...player.won);
            player.won = [];
            if (player.id === this.state.trumpHolderId && this.state.trumpCard) {
                player.hand.push(this.state.trumpCard);
            }
            player.out = player.hand.length === 0;
            if (player.out && !this.state.finishedOrder.includes(player.id)) {
                this.state.finishedOrder.push(player.id);
            }
        }
        this.state.trumpCard = undefined;
        this.state.phase = 'shedding';
        // "The player who drew the trump card leads."
        const holder = this.state.trumpHolderId ? this.indexOf(this.state.trumpHolderId) : this.state.leaderIndex;
        this.beginSheddingTrick(this.state.players[holder]?.out ? this.nextActiveIndex(holder) : holder);
        this.state.lastAction = this.state.trump
            ? `Trumps are ${exports.SUIT_NAMES[this.state.trump]}. Shed your cards.`
            : 'Shed your cards.';
        this.checkForLoser();
    }
    afterSheddingPlay(player, card) {
        this.state.lastAction = `${player.name} plays ${(0, exports.cardId)(card)}.`;
        if (player.hand.length === 0 && !player.out) {
            player.out = true;
            this.state.finishedOrder.push(player.id);
            this.state.lastAction += ` ${player.name} is out.`;
        }
        if (this.state.table.length >= this.state.trickPlayers) {
            // Avstick: the trick is complete and out of the game. "The player who
            // played last (and therefore highest) leads to the next trick" - and
            // if that was their last card, the next player in order leads.
            this.state.table = [];
            this.state.tableOwners = [];
            const playerIndex = this.indexOf(player.id);
            this.beginSheddingTrick(player.out ? this.nextActiveIndex(playerIndex) : playerIndex);
        }
        else {
            this.state.currentIndex = this.nextActiveIndex(this.indexOf(player.id));
        }
        this.checkForLoser();
        return { success: true, message: this.state.lastAction };
    }
    beginSheddingTrick(leaderIndex) {
        this.state.leaderIndex = leaderIndex;
        this.state.currentIndex = leaderIndex;
        this.state.trickPlayers = this.activeCount();
    }
    /** One player left holding cards, and they are the skitgubbe. */
    checkForLoser() {
        if (this.state.phase !== 'shedding')
            return;
        const holding = this.state.players.filter((p) => !p.out && p.hand.length > 0);
        if (holding.length > 1)
            return;
        this.state.phase = 'over';
        this.state.loserId = holding[0]?.id;
        this.state.lastAction = holding[0]
            ? `${holding[0].name} is the Skitgubbe!`
            : 'Everybody is out.';
    }
    // --------------------------------------------------------------------
    // Rotation
    // --------------------------------------------------------------------
    indexOf(playerId) {
        return this.state.players.findIndex((p) => p.id === playerId);
    }
    nextIndex(from) {
        return (from + 1) % this.state.players.length;
    }
    activeCount() {
        return this.state.players.filter((p) => !p.out).length;
    }
    /** The next player still in the game, skipping anyone who has shed everything. */
    nextActiveIndex(from) {
        const count = this.state.players.length;
        for (let step = 1; step <= count; step += 1) {
            const index = (from + step) % count;
            if (!this.state.players[index].out)
                return index;
        }
        return from;
    }
    // --------------------------------------------------------------------
    // Persistence - the lobby keeps this in table.hand.snapshot
    // --------------------------------------------------------------------
    serialize() {
        const s = this.state;
        return {
            phase: s.phase,
            players: s.players.map((p) => ({
                id: p.id,
                name: p.name,
                seat: p.seat,
                isBot: p.isBot,
                hand: p.hand.map(exports.cardId),
                won: p.won.map(exports.cardId),
                out: p.out,
            })),
            stock: s.stock.map(exports.cardId),
            trump: s.trump,
            trumpCard: s.trumpCard ? (0, exports.cardId)(s.trumpCard) : undefined,
            trumpHolderId: s.trumpHolderId,
            leaderIndex: s.leaderIndex,
            currentIndex: s.currentIndex,
            table: s.table.map(exports.cardId),
            tableOwners: [...s.tableOwners],
            trickPlayers: s.trickPlayers,
            finishedOrder: [...s.finishedOrder],
            loserId: s.loserId,
            lastAction: s.lastAction,
        };
    }
    static deserialize(snapshot) {
        const engine = new SkitgubbeEngine(snapshot.players.map((p) => p.id), snapshot.players.map((p) => p.name), snapshot.players.map((p) => p.isBot), { seed: 'restored' });
        engine.state = {
            phase: snapshot.phase,
            players: snapshot.players.map((p) => ({
                id: p.id,
                name: p.name,
                seat: p.seat,
                isBot: p.isBot,
                hand: p.hand.map(exports.cardFromId),
                won: p.won.map(exports.cardFromId),
                out: p.out,
            })),
            stock: snapshot.stock.map(exports.cardFromId),
            trump: snapshot.trump,
            trumpCard: snapshot.trumpCard ? (0, exports.cardFromId)(snapshot.trumpCard) : undefined,
            trumpHolderId: snapshot.trumpHolderId,
            leaderIndex: snapshot.leaderIndex,
            currentIndex: snapshot.currentIndex,
            table: snapshot.table.map(exports.cardFromId),
            tableOwners: [...(snapshot.tableOwners ?? [])],
            trickPlayers: snapshot.trickPlayers,
            finishedOrder: [...snapshot.finishedOrder],
            loserId: snapshot.loserId,
            lastAction: snapshot.lastAction,
        };
        return engine;
    }
}
exports.SkitgubbeEngine = SkitgubbeEngine;
