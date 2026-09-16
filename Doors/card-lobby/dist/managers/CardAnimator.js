"use strict";
/**
 * THE FRAMES A GAME PASSES THROUGH, rather than only the state it ends in.
 *
 * Two asks, one seam (sysop, 2026-09-16):
 *
 *   "at the start of all card games animate the cards when they are given to
 *   the player one by one"
 *
 *   "when i add a card that empties the pile my card is not shown on the pile
 *   before emptying and we need an empty pile animation as well"
 *
 * Both want the door to DRAW A MOMENT THE ENGINE PASSED THROUGH. A deal is
 * one state - here is your hand - and a burn is one call, so neither leaves
 * anything on screen to watch unless the door asks for the in-between frames
 * and holds each one long enough to see.
 *
 * So this is the one place that knows how to do that, and every game calls
 * it: the alternative is each game growing its own timer, its own pace and
 * its own idea of when to skip, which is exactly the duplication that put
 * fourteen `isUnoTable()` branches in this door once already.
 *
 * WHAT IT WILL NOT DO:
 *
 *   - It draws through `CardButtons`, the same renderer the finished state
 *     uses, so an animated frame cannot drift from the real one.
 *   - It never invents a frame. The burn is handed the pile the ENGINE
 *     reported (`VandtiaResult.burned`); rebuilding it here by pushing the
 *     card onto a copy would be a second implementation of the burn rule.
 *   - It stands down where animation is wrong: a 40-column C64 screen
 *     (`effectsAllowed`), and any board that asks for no pace at all, which
 *     is how the tests run it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CardAnimator = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
/** A card row with nothing picked and nothing playable: a frame, not a turn. */
const STILL = {
    selected: null,
    playable: [],
    labels: false,
};
class CardAnimator {
    constructor(host) {
        this.host = host;
        this.running = false;
    }
    /** Is an animation on screen right now? */
    get busy() {
        return this.running;
    }
    /**
     * Should anything be animated at all?
     *
     * A 40-column PETSCII screen has no cells to spare for decoration and the
     * SDK says so (`effectsAllowed`); a pace of zero is a test, or a board that
     * wants its cards to simply appear.
     */
    allowed(pace) {
        if (pace <= 0)
            return false;
        if (!this.host.screen)
            return false;
        const width = Number(this.host.screen.width) || 80;
        return (0, bbs_door_sdk_1.effectsAllowed)(width);
    }
    sleep(ms) {
        return new Promise((resolve) => { setTimeout(resolve, ms); });
    }
    /**
     * Walk a widget from `from` towards where it already is, a frame at a time.
     *
     * IT DOES NOT PUT THE WIDGET BACK. Reading a blessed element's `left` does
     * not always return the number that was written to it - the first cut
     * captured the settled position by reading it, walked the card, wrote that
     * number back, and left the last card of every hand one cell down and one
     * to the right of where the renderer had put it. The caller re-renders
     * instead, so the RENDERER always has the last word on where a card sits.
     */
    async travel(widget, from, to) {
        if (!widget)
            return;
        const frames = Math.max(1, CardAnimator.TRAVEL_FRAMES);
        for (let frame = 0; frame < frames; frame += 1) {
            const t = frame / frames; // 0 at the start, never 1
            widget.left = Math.round(from.left + (to.left - from.left) * t);
            widget.top = Math.round(from.top + (to.top - from.top) * t);
            this.host.screen?.render();
            await this.sleep(CardAnimator.FRAME_MS);
        }
    }
    /**
     * Deal a row of cards into the caller's hand, one at a time.
     *
     * Each card SLIDES IN from off the right edge of the panel to its place,
     * and the frame behind it is the hand so far drawn by the ordinary
     * renderer - so what the caller watches being built is exactly the hand
     * they end up with.
     */
    async deal(cards) {
        const pace = CardAnimator.DEAL_MS;
        if (this.running || cards.length === 0 || !this.allowed(pace))
            return;
        this.running = true;
        try {
            for (let count = 1; count <= cards.length; count += 1) {
                this.host.cardButtons.render(cards.slice(0, count), { ...STILL, onPick: () => { } });
                // The card that has just arrived is the last one drawn; it comes in
                // from beyond the right edge, where the dealer is.
                const arriving = this.host.cardButtons.focusables()[count - 1];
                const settled = { left: Number(arriving?.left) || 0, top: Number(arriving?.top) || 0 };
                const offPanel = Number(this.host.cardButtons.panelWidth()) || 60;
                await this.travel(arriving, { left: offPanel, top: settled.top }, settled);
                // The renderer has the last word on where the cards sit.
                this.host.cardButtons.render(cards.slice(0, count), { ...STILL, onPick: () => { } });
                this.host.screen?.render();
                await this.sleep(Math.max(0, pace - CardAnimator.TRAVEL_FRAMES * CardAnimator.FRAME_MS));
            }
        }
        finally {
            this.running = false;
        }
    }
    /**
     * Show the pile with the card that turned it away still on it, then let it
     * go.
     *
     * `pile` is the engine's own report of what went away - never rebuilt here.
     * The caller repaints afterwards from the real state, so the empty pile
     * that follows is the truth rather than another frame this file invented.
     */
    async burn(pile) {
        const pace = CardAnimator.BURN_MS;
        if (this.running || pile.length === 0 || !this.allowed(pace))
            return;
        this.running = true;
        try {
            // The pile as it stood, the card that did it on top.
            this.host.tableCardButtons.render(pile.slice(-3), { ...STILL, pile: true, onPick: () => { } });
            this.host.screen?.render();
            await this.sleep(pace);
            /*
             * And away. The cards LEAVE rather than blinking out: the whole pile
             * slides off the right edge together, which is what turning a pile
             * away looks like from across a table - one movement, not three cards
             * vanishing in turn.
             */
            const leaving = this.host.tableCardButtons.focusables();
            const offPanel = Number(this.host.tableCardButtons.panelWidth()) || 60;
            const settled = leaving.map((card) => ({
                left: Number(card.left) || 0,
                top: Number(card.top) || 0,
            }));
            const frames = Math.max(1, CardAnimator.TRAVEL_FRAMES);
            for (let frame = 1; frame <= frames; frame += 1) {
                const t = frame / frames;
                leaving.forEach((card, index) => {
                    card.left = Math.round(settled[index].left + (offPanel - settled[index].left) * t);
                });
                this.host.screen?.render();
                await this.sleep(CardAnimator.FRAME_MS);
            }
            this.host.tableCardButtons.clear();
            this.host.screen?.render();
        }
        finally {
            this.running = false;
            // Back to whatever is actually true now.
            this.host.updateAllPanels();
        }
    }
}
exports.CardAnimator = CardAnimator;
/**
 * How long a frame is held.
 *
 * 110ms per card dealt is brisk enough that a hand of thirteen does not
 * outstay its welcome (poker's own animation uses 180 for two), and 600ms
 * on a burning pile is long enough to read the card that did it.
 *
 * Static so a test can set them to zero: an animation that a test has to
 * wait out is an animation nobody will keep testing.
 */
CardAnimator.DEAL_MS = 110;
CardAnimator.BURN_MS = 600;
/**
 * How many frames a card takes to travel.
 *
 * "the animations needs more frames so we can see the cards animate in not
 * just pop up" (sysop, 2026-09-16) - a card that appears in its final place
 * is a state change, not an animation. It slides in from off the panel's
 * right edge, which is where a dealer's hand is.
 *
 * Five is enough to read as motion and few enough to stay cheap: blessed
 * diffs the screen buffer, so a frame costs the cells the card actually
 * moved over, not the screen.
 */
CardAnimator.TRAVEL_FRAMES = 5;
/** Milliseconds between those frames. */
CardAnimator.FRAME_MS = 28;
