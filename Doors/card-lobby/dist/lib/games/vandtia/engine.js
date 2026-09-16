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
exports.VandtiaEngine = exports.canPlayOn = exports.buildVandtiaDeck = exports.cardFromId = exports.cardId = exports.cardValue = exports.playsAgain = exports.burnsThePile = exports.isWild = void 0;
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
/**
 * A card that hands the turn straight back to whoever played it.
 *
 * The ten does it because it turns the pile away and somebody has to lead the
 * empty pile. The TWO does it as well - "2 can be thrown on anything as well
 * and gives the turn back to me but it does not remove the pile" (sysop,
 * 2026-09-16): it is the board's house reading of "sänker värdet på högen",
 * and it is what makes a two worth holding rather than a card you are stuck
 * with. Neither is the same question as whether the pile burns.
 */
const playsAgain = (card) => card.rank === '10' || card.rank === '2';
exports.playsAgain = playsAgain;
/** How many of the same rank on top of the pile turn it away. */
const BURN_RUN = {
    // "two aces should also remove the pile and give the turn back to me"
    // (sysop, 2026-09-16). Every other rank needs the usual four in a row.
    A: 2,
};
const DEFAULT_BURN_RUN = 4;
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
    /**
     * THE HOUSE RULE, WHILE ARRANGING: reinforce a table card with more of its
     * own value, and draw back up to a hand of three.
     *
     * "the user should be able to drop several cards of the same value on the
     * cards on the table when swapping cards and get a new one from the deck so
     * he always have 3 on hand" (sysop, 2026-09-16), confirmed as a house rule
     * that "applies in game as well" - the in-game half is `playCards`.
     *
     * WHAT IT IS FOR. A table card you have doubled or trebled is a card you can
     * later put down as a group, and four of a rank turns the pile away - so
     * this is how a caller builds a burn into the row before play starts.
     *
     * THE VALUE MUST MATCH THE CARD THEY LAND ON. They are dropped ON a card,
     * not merely into the row, and matching keeps the move meaningful: cards of
     * one value sit together where the caller put them. It costs a caller
     * nothing, either - a rank that is not on the table yet can be swapped onto
     * it first, in the move this phase already had, and reinforced after.
     *
     * The row GROWS. `faceUp` was three cards because three were dealt, never
     * because three is a rule: play reads the row, and a row of five is five
     * cards to get rid of before the blind ones - the price of the burn.
     */
    dropOnTable(playerId, handIndices, faceUpIndex) {
        if (this.state.phase !== 'swap')
            return { success: false, message: 'Play has started.' };
        const player = this.playerById(playerId);
        if (!player)
            return { success: false, message: 'You are not in this game.' };
        if (player.ready)
            return { success: false, message: 'You are already done swapping.' };
        const target = player.faceUp[faceUpIndex];
        if (!target)
            return { success: false, message: 'No such card.' };
        const wanted = [...new Set(handIndices)];
        if (wanted.length === 0)
            return { success: false, message: 'Pick a card first.' };
        const dropping = wanted.map((index) => player.hand[index]);
        if (dropping.some((card) => !card))
            return { success: false, message: 'No such card.' };
        if (dropping.some((card) => card.rank !== target.rank)) {
            return {
                success: false,
                message: `They go on a ${target.rank} - drop cards on a table card of their own value.`,
            };
        }
        // Out of the hand highest index first, so the ones still to come do not
        // shift under the splice.
        for (const index of [...wanted].sort((a, b) => b - a))
            player.hand.splice(index, 1);
        player.faceUp.splice(faceUpIndex + 1, 0, ...dropping);
        // And back up to three, which is the half of the rule that keeps the
        // caller playing rather than paying for the reinforcement.
        this.refill(player);
        const many = dropping.length > 1 ? `${dropping.length} cards` : (0, exports.cardId)(dropping[0]);
        this.state.lastAction = `${player.name} lays ${many} on the ${target.rank} on the table.`;
        return { success: true, message: this.state.lastAction };
    }
    /**
     * Move a card along its own row while arranging.
     *
     * The two rows are a player's own business until the play starts, and
     * shuffling one is not a move in the game - but it is how a caller ARRANGES
     * their cards, which is what the swap phase is for: "swap left right for
     * the cards next to the card" (sysop, 2026-09-16).
     *
     * It lives in the engine rather than in the door because the row it edits
     * is the engine's, and a door reaching into `player.hand` to reorder it
     * would be a second place that decides what a hand is.
     */
    reorder(playerId, row, from, to) {
        if (this.state.phase !== 'swap')
            return { success: false, message: 'Play has started.' };
        const player = this.playerById(playerId);
        if (!player)
            return { success: false, message: 'You are not in this game.' };
        if (player.ready)
            return { success: false, message: 'You are already done swapping.' };
        const cards = player[row];
        if (from < 0 || from >= cards.length)
            return { success: false, message: 'No such card.' };
        if (to < 0 || to >= cards.length)
            return { success: false, message: 'There is nothing there.' };
        if (from === to)
            return { success: true, message: this.state.lastAction };
        const moved = cards[from];
        cards[from] = cards[to];
        cards[to] = moved;
        this.state.lastAction = `${player.name} moves ${(0, exports.cardId)(moved)}.`;
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
            // Everybody's hand in order the moment arranging is over - after this
            // point a hand is read, not arranged.
            for (const seated of this.state.players)
                this.sortHand(seated);
        }
        return { success: true, message: this.state.lastAction };
    }
    // --------------------------------------------------------------------
    // Playing
    // --------------------------------------------------------------------
    /**
     * PLAY SEVERAL CARDS OF THE SAME VALUE AT ONCE.
     *
     * "the user should be able to drop several cards of the same value... and
     * get a new one from the deck so he always have 3 on hand", and it "applies
     * in game as well" (sysop, 2026-09-16). A house rule, and a good one: three
     * sevens are one decision, not three, and holding them back one at a time
     * only slows the hand down.
     *
     * It is the same move as `playCard`, made with more cards, so it is the
     * same code - `playCard` calls this with one index. What that buys is that
     * every rule downstream keeps working without being taught about groups:
     * the vandtia still burns, four of a rank across the pile still burns
     * (and reaches it SOONER, since three at once can complete the run), a
     * two still hands the turn back, and the refill still tops the hand up to
     * three.
     *
     * Every card must be the same rank and every one must be legal on its own.
     * A blind card is played singly - you cannot know what you are holding, so
     * there is no group to choose.
     */
    playCards(playerId, cardIndices) {
        if (this.state.phase !== 'playing')
            return { success: false, message: 'Not playing yet.' };
        if (this.currentPlayerId() !== playerId)
            return { success: false, message: 'Not your turn.' };
        const player = this.playerById(playerId);
        if (!player)
            return { success: false, message: 'You are not in this game.' };
        const source = this.sourceFor(playerId);
        const from = player[source];
        // Highest index first, so removing one does not move the others.
        const indices = [...new Set(cardIndices)].sort((a, b) => a - b);
        if (indices.length === 0)
            return { success: false, message: 'No card chosen.' };
        const chosen = indices.map((index) => from[index]);
        if (chosen.some((card) => !card))
            return { success: false, message: 'No such card.' };
        if (indices.length > 1) {
            if (source === 'faceDown') {
                return { success: false, message: 'A blind card is turned one at a time.' };
            }
            const rank = chosen[0].rank;
            if (chosen.some((card) => card.rank !== rank)) {
                return { success: false, message: 'Cards played together must be the same value.' };
            }
        }
        if (source !== 'faceDown') {
            const refused = chosen.find((card) => !(0, exports.canPlayOn)(card, this.state.pile));
            if (refused) {
                const top = this.topOfPile();
                return {
                    success: false,
                    message: top
                        ? `${(0, exports.cardId)(refused)} does not answer ${(0, exports.cardId)(top)}.`
                        : `${(0, exports.cardId)(refused)} cannot be played.`,
                };
            }
        }
        return this.playChosen(player, source, indices, chosen);
    }
    /**
     * JUMPING IN OUT OF TURN with a card of the pile's own value.
     *
     * "the opponent instantly throws cards he should think before he does it so
     * i have a chanse to throw in cards of the same value that is on the pile"
     * (sysop, 2026-09-16) - the house rule that makes the game a race as well
     * as a turn order: whoever holds the fourth nine can drop it the moment the
     * third one lands, whoever's turn it was.
     *
     * WHAT IT COSTS TO GET WRONG is why it is narrow: the value must MATCH the
     * top of the pile exactly (not merely beat it - that is the ordinary move
     * and it waits its turn), and a blind card can never be thrown in, because
     * you cannot claim a value you have not seen.
     *
     * Play then carries on FROM the player who jumped in - the turn order is
     * not restored, it is re-anchored, which is what makes jumping in worth
     * something. And a group is allowed, so four of a rank can be completed in
     * one throw: `playChosen` reads the pile afterwards, so the burn, the turn
     * and the refill all follow on their own.
     */
    playOutOfTurn(playerId, cardIndices) {
        if (this.state.phase !== 'playing')
            return { success: false, message: 'Not playing yet.' };
        if (this.currentPlayerId() === playerId) {
            return { success: false, message: 'It is your turn - play the card.' };
        }
        const player = this.playerById(playerId);
        if (!player)
            return { success: false, message: 'You are not in this game.' };
        if (player.out)
            return { success: false, message: 'You are out.' };
        const top = this.topOfPile();
        if (!top)
            return { success: false, message: 'There is nothing on the pile to match.' };
        const source = this.sourceFor(playerId);
        if (source === 'faceDown') {
            return { success: false, message: 'A blind card cannot be thrown in - you cannot see it.' };
        }
        const from = player[source];
        const indices = [...new Set(cardIndices)].sort((a, b) => a - b);
        if (indices.length === 0)
            return { success: false, message: 'No card chosen.' };
        const chosen = indices.map((index) => from[index]);
        if (chosen.some((card) => !card))
            return { success: false, message: 'No such card.' };
        if (chosen.some((card) => card.rank !== top.rank)) {
            return {
                success: false,
                message: `Only another ${top.rank} can be thrown in on ${(0, exports.cardId)(top)}.`,
            };
        }
        /*
         * The turn becomes the thrower's BEFORE the card is played, and that is
         * the whole of "play carries on from here": everything downstream - the
         * vändtia keeping the turn, four of a rank keeping it, an ordinary card
         * passing it on - is then the same rule it always was, reading from the
         * same place. Re-anchoring afterwards instead would mean deciding the
         * turn twice, and the second decision would be this method's own idea of
         * what a burn does.
         */
        this.state.currentIndex = this.state.players.findIndex((seated) => seated.id === playerId);
        const result = this.playChosen(player, source, indices, chosen);
        if (result.success) {
            this.state.lastAction = `${player.name} throws in ${chosen.length > 1
                ? `${chosen.length} x ${top.rank}`
                : (0, exports.cardId)(chosen[0])} out of turn.`;
            return { ...result, message: this.state.lastAction };
        }
        return result;
    }
    /** Does this player hold a card they could throw in right now? */
    canThrowIn(playerId) {
        if (this.state.phase !== 'playing')
            return [];
        if (this.currentPlayerId() === playerId)
            return [];
        const top = this.topOfPile();
        if (!top)
            return [];
        const player = this.playerById(playerId);
        if (!player || player.out)
            return [];
        if (this.sourceFor(playerId) === 'faceDown')
            return [];
        return this.cardsInPlay(playerId)
            .map((card, index) => (card.rank === top.rank ? index : -1))
            .filter((index) => index >= 0);
    }
    /**
     * TAKE A CARD OFF THE STOCK AND PLAY IT BLIND, rather than take the pile.
     *
     * "when i cant make a move i should be able to pick a card from the deck on
     * chanse, a blind card" (sysop, 2026-09-16).
     *
     * The gamble is the point: the card is turned face up onto the pile without
     * being looked at first. It fits and the turn passes on; it does not fit
     * and the pile is yours - which is what taking the pile would have cost
     * anyway, plus the card. So it is never worse than the move it replaces
     * unless the draw is bad, and that is the caller's to risk.
     *
     * Only when NOTHING in front of you will go: with a card that answers the
     * pile, this would be a way to duck a bad hand rather than a chance taken.
     */
    drawAndPlay(playerId) {
        if (this.state.phase !== 'playing')
            return { success: false, message: 'Not playing yet.' };
        if (this.currentPlayerId() !== playerId)
            return { success: false, message: 'Not your turn.' };
        if (this.state.stock.length === 0) {
            return { success: false, message: 'The stock is empty - there is nothing to draw.' };
        }
        if (this.legalPlays(playerId).length > 0) {
            return { success: false, message: 'You have a card that will go - play it.' };
        }
        const player = this.playerById(playerId);
        if (!player)
            return { success: false, message: 'You are not in this game.' };
        const drawn = this.state.stock.pop();
        if (!(0, exports.canPlayOn)(drawn, this.state.pile)) {
            const taken = this.state.pile.length;
            player.hand.push(drawn, ...this.state.pile);
            this.state.pile = [];
            this.state.lastAction =
                `${player.name} draws ${(0, exports.cardId)(drawn)} - it does not fit, and picks up ${taken}.`;
            this.advanceTurn(player);
            return { success: true, message: this.state.lastAction };
        }
        // It fits: it lands, and the rest of the rules - the burn, the vändtia,
        // the turn - are the ones every played card goes through.
        player.hand.push(drawn);
        const result = this.playChosen(player, 'hand', [player.hand.length - 1], [drawn]);
        if (result.success) {
            this.state.lastAction = `${player.name} draws ${(0, exports.cardId)(drawn)} and it goes.`;
            return { ...result, message: this.state.lastAction };
        }
        return result;
    }
    /** One card is a group of one - the same move, the same code. */
    playCard(playerId, cardIndex) {
        return this.playCards(playerId, [cardIndex]);
    }
    /**
     * The move itself, once the cards are known to be playable.
     *
     * Every rule downstream reads the pile rather than the cards that were
     * just added, which is what lets one implementation serve a single card
     * and a group: the vandtia burns because a ten is on the pile, four of a
     * rank burns because the pile ends in four, and the refill tops the hand
     * back up to three however many left it.
     */
    playChosen(player, source, indices, chosen) {
        const from = player[source];
        const card = chosen[chosen.length - 1]; // the one that landed last
        const many = chosen.length > 1;
        const said = many
            ? `${chosen.length} x ${card.rank}`
            : (0, exports.cardId)(card);
        // Highest first, so removing one does not move the others.
        [...indices].sort((a, b) => b - a).forEach((index) => from.splice(index, 1));
        // A blind card that does not fit: the player takes the pile and the card
        // with it. This is the only way to LOSE a turn by playing one.
        if (source === 'faceDown' && !(0, exports.canPlayOn)(card, this.state.pile)) {
            player.hand.push(card, ...this.state.pile);
            this.state.pile = [];
            this.state.lastAction = `${player.name} turns ${(0, exports.cardId)(card)} - it does not fit, and picks the pile up.`;
            this.advanceTurn(player);
            return { success: true, message: this.state.lastAction };
        }
        this.state.pile.push(...chosen);
        this.state.lastAction = `${player.name} plays ${said}.`;
        this.refill(player);
        // "Tio: Vänder bort hela högen" - and four of the same value in a row
        // does it too, which a group can complete in one turn. Either way the
        // same player plays again.
        const runBurns = this.topRunBurns();
        if ((0, exports.burnsThePile)(card) || runBurns) {
            const burned = this.state.pile.length;
            const run = BURN_RUN[card.rank] ?? DEFAULT_BURN_RUN;
            // Kept before the pile goes, for the door to show the cards landing.
            const turnedAway = [...this.state.pile];
            this.state.burned.push(...this.state.pile);
            this.state.pile = [];
            this.state.lastAction = (0, exports.burnsThePile)(card)
                ? `${player.name} plays the vändtia ${said} and turns ${burned} cards away.`
                : `${player.name} makes ${run} of a kind and turns ${burned} cards away.`;
            if (this.retireIfEmpty(player)) {
                this.advanceTurn(player);
            }
            else {
                this.checkForLoser();
            }
            return {
                success: true,
                message: this.state.lastAction,
                burned: { pile: turnedAway, reason: (0, exports.burnsThePile)(card) ? 'ten' : 'run' },
            };
        }
        /*
         * A card that plays again keeps the turn. The pile stays where it is -
         * a two lowers the pile rather than turning it away - so this is NOT the
         * burn branch above, only the same player leading again.
         */
        if ((0, exports.playsAgain)(card)) {
            if (this.retireIfEmpty(player)) {
                this.advanceTurn(player);
            }
            else {
                this.checkForLoser();
                this.state.lastAction = `${player.name} plays ${said} and goes again.`;
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
        this.sortHand(player);
    }
    /**
     * KEEP A HAND IN THE ORDER THIS GAME IS READ IN.
     *
     * "the cardlobby should autosort hands in the way that makes most sense for
     * the game played" (sysop, 2026-09-16). For vändtia that is by VALUE, low
     * to high: every turn is the question "what have I got that beats the
     * pile", and a sorted hand answers it at a glance.
     *
     * The two wilds go last, together. A 2 and a 10 play on anything, so they
     * are never part of that question - and they are the cards worth keeping
     * track of, which is easier at a fixed end of the hand than wherever their
     * number would put them.
     *
     * It runs on every refill, so a card drawn mid-game lands in its place
     * rather than on the end. NOT during the swap: a caller arranging their own
     * two rows must be able to leave a card where they put it.
     */
    sortHand(player) {
        if (this.state.phase === 'swap')
            return;
        player.hand.sort((a, b) => {
            const wildA = (0, exports.isWild)(a) ? 1 : 0;
            const wildB = (0, exports.isWild)(b) ? 1 : 0;
            if (wildA !== wildB)
                return wildA - wildB;
            return (0, exports.cardValue)(a) - (0, exports.cardValue)(b);
        });
    }
    /**
     * Does the top of the pile end in a run long enough to turn it away?
     *
     * Four of the same rank does it, as it always has - and TWO ACES do,
     * because the board plays it that way: "two aces should also remove the
     * pile and give the turn back to me" (sysop, 2026-09-16). The length is per
     * RANK (`BURN_RUN`) rather than a special case in the middle of `playCard`,
     * so another rank with its own house rule is one entry in that table.
     */
    topRunBurns() {
        const pile = this.state.pile;
        const top = pile[pile.length - 1];
        if (!top)
            return false;
        const needed = BURN_RUN[top.rank] ?? DEFAULT_BURN_RUN;
        if (pile.length < needed)
            return false;
        const last = pile.slice(-needed);
        return last.every((card) => card.rank === top.rank);
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
