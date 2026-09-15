"use strict";
/**
 * SKITGUBBE (VÄNDTIA) - the engine.
 *
 * The game the board calls Skitgubbe: also vändtia or finne, and Shithead in
 * English. Not to be confused with the trick-taking Skitgubbe in the folder
 * next door - two different Swedish games share the name, and this is the one
 * the sysop plays (their rules, 2026-09-15).
 *
 *   SETUP. Three cards face down in front of each player, three face up on
 *   top of them, three in hand. Before play you may swap hand cards with
 *   your face-up ones: what is on the table is what you will be left with,
 *   so put your strength there.
 *
 *   PLAY. One pile. Play a card of EQUAL OR HIGHER value than the top one,
 *   or take the whole pile into your hand. Refill to three from the stock
 *   while it lasts.
 *
 *     - a 2 goes on anything, and leaves the pile at its own low value
 *     - a 10 turns the pile away out of the game (the vändtia), and the
 *       player goes again
 *     - a fourth card of the same value in a row does the same
 *
 *   ENDGAME. Hand empty and stock empty: play your three face-up cards. Those
 *   gone: play the face-down ones blind - turn one over, and if it will not
 *   go on the pile you take the pile and it. The last player still holding
 *   cards is the Skitgubbe.
 *
 * Pure rules: no I/O, no timers. `module.ts` seats people and drives bots.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VandtiaEngine = exports.canPlayOn = exports.buildVandtiaDeck = exports.cardFromId = exports.cardId = exports.cardValue = exports.burnsThePile = exports.isWild = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
// ============================================================================
// CARDS
// ============================================================================
/**
 * What a card is worth on the pile.
 *
 * "Tre: Det lägsta kortet... Knekt: Värd 11. Dam: 12. Kung: 13. Ess: Högsta
 * värdet." The two and the ten have powers rather than values, and both are
 * playable on anything; the two's value is the lowest there is, which is the
 * whole point of it ("sänker värdet på högen").
 */
const CARD_VALUE = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, J: 11, Q: 12, K: 13, A: 14,
};
/** A card that may be played on anything at all. */
const isWild = (card) => card.rank === '2' || card.rank === '10';
exports.isWild = isWild;
/** The vändtia itself: turns the pile away. */
const burnsThePile = (card) => card.rank === '10';
exports.burnsThePile = burnsThePile;
const cardValue = (card) => CARD_VALUE[card.rank] ?? 0;
exports.cardValue = cardValue;
const cardId = (card) => `${card.rank}${card.suit}`;
exports.cardId = cardId;
const cardFromId = (id) => ({
    rank: id.slice(0, -1),
    suit: id.slice(-1),
});
exports.cardFromId = cardFromId;
const SUIT_ASCII = {
    '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C',
    S: 'S', H: 'H', D: 'D', C: 'C',
};
const buildVandtiaDeck = (seed) => (0, bbs_door_sdk_1.shuffleCards)((0, bbs_door_sdk_1.buildStandardDeck)().map((c) => ({ rank: c.rank, suit: SUIT_ASCII[c.suit] })), seed);
exports.buildVandtiaDeck = buildVandtiaDeck;
/** May this card go on that pile? An empty pile takes anything. */
const canPlayOn = (card, pile) => {
    const top = pile[pile.length - 1];
    if (!top)
        return true;
    if ((0, exports.isWild)(card))
        return true;
    return (0, exports.cardValue)(card) >= (0, exports.cardValue)(top);
};
exports.canPlayOn = canPlayOn;
// ============================================================================
// ENGINE
// ============================================================================
class VandtiaEngine {
    constructor(playerIds, playerNames, isBot, options = {}) {
        if (playerIds.length < 2)
            throw new Error('Skitgubbe needs at least two players');
        const deck = (0, exports.buildVandtiaDeck)(options.seed);
        const players = playerIds.map((id, index) => ({
            id,
            name: playerNames[index] ?? id,
            seat: index,
            isBot: isBot[index] ?? false,
            hand: [],
            faceUp: [],
            faceDown: [],
            ready: false,
            out: false,
        }));
        // Face down first, then the row that covers them, then the hands - the
        // order it is dealt at a table.
        for (const pile of ['faceDown', 'faceUp', 'hand']) {
            for (let round = 0; round < 3; round += 1) {
                for (const player of players) {
                    const dealt = deck.pop();
                    if (dealt)
                        player[pile].push(dealt);
                }
            }
        }
        this.state = {
            phase: 'swap',
            players,
            stock: deck,
            pile: [],
            burned: [],
            currentIndex: 0,
            finishedOrder: [],
            lastAction: 'Swap your hand for the cards on the table, then play.',
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
    topOfPile() {
        return this.state.pile[this.state.pile.length - 1];
    }
    /**
     * Which of a player's three piles they are playing from.
     *
     * "När spelarna har blivit av med sina kort på handen, börjar de spela med
     * korten på bordet. Först spelas de uppåtvända korten, sedan de nedåtvända."
     */
    sourceFor(playerId) {
        const player = this.playerById(playerId);
        if (!player)
            return 'hand';
        if (player.hand.length > 0)
            return 'hand';
        if (player.faceUp.length > 0)
            return 'faceUp';
        return 'faceDown';
    }
    /** The cards a player would be choosing from right now. */
    cardsInPlay(playerId) {
        const player = this.playerById(playerId);
        if (!player)
            return [];
        return player[this.sourceFor(playerId)];
    }
    /**
     * Indices that may be played.
     *
     * A face-down card is turned blind, so every one of them is a legal move -
     * whether it FITS is the gamble, and the answer arrives when it lands.
     */
    legalPlays(playerId) {
        if (this.state.phase !== 'playing')
            return [];
        if (this.currentPlayerId() !== playerId)
            return [];
        const source = this.sourceFor(playerId);
        const cards = this.cardsInPlay(playerId);
        if (source === 'faceDown')
            return cards.map((_, index) => index);
        return cards.map((_, index) => index).filter((index) => (0, exports.canPlayOn)(cards[index], this.state.pile));
    }
    /** Nothing to play means you take the pile - and there has to BE a pile. */
    mustTakePile(playerId) {
        return this.state.phase === 'playing'
            && this.currentPlayerId() === playerId
            && this.state.pile.length > 0
            && this.legalPlays(playerId).length === 0;
    }
    // --------------------------------------------------------------------
    // The swap
    // --------------------------------------------------------------------
    /** Exchange one hand card for one of your own face-up cards. */
    swap(playerId, handIndex, faceUpIndex) {
        if (this.state.phase !== 'swap')
            return { success: false, message: 'Play has started.' };
        const player = this.playerById(playerId);
        if (!player)
            return { success: false, message: 'You are not in this game.' };
        if (player.ready)
            return { success: false, message: 'You are already done swapping.' };
        const handCard = player.hand[handIndex];
        const tableCard = player.faceUp[faceUpIndex];
        if (!handCard || !tableCard)
            return { success: false, message: 'No such card.' };
        player.hand[handIndex] = tableCard;
        player.faceUp[faceUpIndex] = handCard;
        this.state.lastAction = `${player.name} swaps ${(0, exports.cardId)(handCard)} onto the table.`;
        return { success: true, message: this.state.lastAction };
    }
    /** Done swapping. Play starts when everybody is. */
    finishSwap(playerId) {
        if (this.state.phase !== 'swap')
            return { success: false, message: 'Play has started.' };
        const player = this.playerById(playerId);
        if (!player)
            return { success: false, message: 'You are not in this game.' };
        player.ready = true;
        if (this.state.players.every((p) => p.ready)) {
            this.state.phase = 'playing';
            this.state.currentIndex = 0;
            this.state.lastAction = 'Play begins.';
        }
        return { success: true, message: this.state.lastAction };
    }
    // --------------------------------------------------------------------
    // Playing
    // --------------------------------------------------------------------
    playCard(playerId, cardIndex) {
        if (this.state.phase !== 'playing')
            return { success: false, message: 'Not playing yet.' };
        if (this.currentPlayerId() !== playerId)
            return { success: false, message: 'Not your turn.' };
        const player = this.playerById(playerId);
        if (!player)
            return { success: false, message: 'You are not in this game.' };
        const source = this.sourceFor(playerId);
        const pileOfCards = player[source];
        const card = pileOfCards[cardIndex];
        if (!card)
            return { success: false, message: 'No such card.' };
        if (source !== 'faceDown' && !(0, exports.canPlayOn)(card, this.state.pile)) {
            const top = this.topOfPile();
            return {
                success: false,
                message: top ? `${(0, exports.cardId)(card)} does not answer ${(0, exports.cardId)(top)}.` : `${(0, exports.cardId)(card)} cannot be played.`,
            };
        }
        pileOfCards.splice(cardIndex, 1);
        // A blind card that does not fit: the player takes the pile and the card
        // with it. This is the only way to LOSE a turn by playing one.
        if (source === 'faceDown' && !(0, exports.canPlayOn)(card, this.state.pile)) {
            player.hand.push(card, ...this.state.pile);
            this.state.pile = [];
            this.state.lastAction = `${player.name} turns ${(0, exports.cardId)(card)} - it does not fit, and picks the pile up.`;
            this.advanceTurn(player);
            return { success: true, message: this.state.lastAction };
        }
        this.state.pile.push(card);
        this.state.lastAction = `${player.name} plays ${(0, exports.cardId)(card)}.`;
        this.refill(player);
        // "Tio: Vänder bort hela högen" - and four of the same value in a row
        // does it too. Either way the same player plays again.
        if ((0, exports.burnsThePile)(card) || this.topFourAreEqual()) {
            const burned = this.state.pile.length;
            this.state.burned.push(...this.state.pile);
            this.state.pile = [];
            this.state.lastAction = (0, exports.burnsThePile)(card)
                ? `${player.name} plays the vändtia ${(0, exports.cardId)(card)} and turns ${burned} cards away.`
                : `${player.name} makes four of a kind and turns ${burned} cards away.`;
            if (this.retireIfEmpty(player)) {
                this.advanceTurn(player);
            }
            else {
                this.checkForLoser();
            }
            return { success: true, message: this.state.lastAction };
        }
        this.retireIfEmpty(player);
        this.advanceTurn(player);
        return { success: true, message: this.state.lastAction };
    }
    /** "Om en spelare inte kan lägga ett kort, måste denne ta upp hela högen." */
    takePile(playerId) {
        if (this.state.phase !== 'playing')
            return { success: false, message: 'Not playing yet.' };
        if (this.currentPlayerId() !== playerId)
            return { success: false, message: 'Not your turn.' };
        if (this.state.pile.length === 0)
            return { success: false, message: 'There is no pile to take.' };
        const player = this.playerById(playerId);
        if (!player)
            return { success: false, message: 'You are not in this game.' };
        const taken = this.state.pile.length;
        player.hand.push(...this.state.pile);
        this.state.pile = [];
        this.state.lastAction = `${player.name} picks up ${taken} card${taken === 1 ? '' : 's'}.`;
        this.advanceTurn(player);
        return { success: true, message: this.state.lastAction };
    }
    // --------------------------------------------------------------------
    // The rules' housekeeping
    // --------------------------------------------------------------------
    /** "drar spelarna upp till tre kort från högen tills den tar slut." */
    refill(player) {
        while (player.hand.length < 3 && this.state.stock.length > 0) {
            player.hand.push(this.state.stock.pop());
        }
    }
    topFourAreEqual() {
        const pile = this.state.pile;
        if (pile.length < 4)
            return false;
        const last = pile.slice(-4);
        return last.every((card) => card.rank === last[0].rank);
    }
    /** A player with nothing left anywhere is out, and safe. */
    retireIfEmpty(player) {
        if (player.out)
            return true;
        if (player.hand.length > 0 || player.faceUp.length > 0 || player.faceDown.length > 0)
            return false;
        player.out = true;
        this.state.finishedOrder.push(player.id);
        this.state.lastAction += ` ${player.name} is out.`;
        return true;
    }
    advanceTurn(from) {
        if (this.checkForLoser())
            return;
        const count = this.state.players.length;
        const start = this.state.players.findIndex((p) => p.id === from.id);
        for (let step = 1; step <= count; step += 1) {
            const index = (start + step) % count;
            if (!this.state.players[index].out) {
                this.state.currentIndex = index;
                return;
            }
        }
    }
    /** One player left with cards, and they are the Skitgubbe. */
    checkForLoser() {
        if (this.state.phase !== 'playing')
            return false;
        const holding = this.state.players.filter((p) => !p.out);
        if (holding.length > 1)
            return false;
        this.state.phase = 'over';
        this.state.loserId = holding[0]?.id;
        this.state.lastAction = holding[0]
            ? `${holding[0].name} is the Skitgubbe!`
            : 'Everybody is out.';
        return true;
    }
    // --------------------------------------------------------------------
    // Persistence
    // --------------------------------------------------------------------
    serialize() {
        const s = this.state;
        return {
            phase: s.phase,
            players: s.players.map((p) => ({
                id: p.id, name: p.name, seat: p.seat, isBot: p.isBot,
                hand: p.hand.map(exports.cardId),
                faceUp: p.faceUp.map(exports.cardId),
                faceDown: p.faceDown.map(exports.cardId),
                ready: p.ready,
                out: p.out,
            })),
            stock: s.stock.map(exports.cardId),
            pile: s.pile.map(exports.cardId),
            burned: s.burned.map(exports.cardId),
            currentIndex: s.currentIndex,
            finishedOrder: [...s.finishedOrder],
            loserId: s.loserId,
            lastAction: s.lastAction,
        };
    }
    static deserialize(snapshot) {
        const engine = new VandtiaEngine(snapshot.players.map((p) => p.id), snapshot.players.map((p) => p.name), snapshot.players.map((p) => p.isBot), { seed: 'restored' });
        engine.state = {
            phase: snapshot.phase,
            players: snapshot.players.map((p) => ({
                id: p.id, name: p.name, seat: p.seat, isBot: p.isBot,
                hand: p.hand.map(exports.cardFromId),
                faceUp: p.faceUp.map(exports.cardFromId),
                faceDown: p.faceDown.map(exports.cardFromId),
                ready: p.ready,
                out: p.out,
            })),
            stock: snapshot.stock.map(exports.cardFromId),
            pile: snapshot.pile.map(exports.cardFromId),
            burned: snapshot.burned.map(exports.cardFromId),
            currentIndex: snapshot.currentIndex,
            finishedOrder: [...snapshot.finishedOrder],
            loserId: snapshot.loserId,
            lastAction: snapshot.lastAction,
        };
        return engine;
    }
}
exports.VandtiaEngine = VandtiaEngine;
