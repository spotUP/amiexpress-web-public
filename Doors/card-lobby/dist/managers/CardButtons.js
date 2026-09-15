"use strict";
/**
 * CARDS YOU CAN CLICK.
 *
 * The hand used to be one block of text inside a box: `renderCardLines`
 * joined every card's art into a string and the box drew it. That is fine to
 * look at and impossible to use - there is nothing for the mouse to hit and
 * nothing for Tab to land on, which is exactly what the sysop ran into:
 * "navigating with tab to the different panels and cards dont work either
 * isnt that an sdk level thing? why doesnt it work?" (2026-09-15).
 *
 * It was not an SDK thing. The SDK's blessed has focus and mouse, and the
 * door already enables them; a card simply was not a widget. So here each
 * card IS one - clickable, focusable, and highlighted when it is picked -
 * laid out across the hand panel and reused between frames so a repaint does
 * not churn the screen.
 *
 * The text rendering stays as the fallback: a narrow panel, a 40-column
 * caller or a terminal that cannot draw full-size cards gets the old list,
 * because half a card is worse than a line of text.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CardButtons = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const utils_1 = require("../lib/utils");
const card_style_1 = require("../lib/card-style");
const constants_1 = require("../lib/constants");
const cardEngine = new bbs_door_sdk_1.CardEngine();
class CardButtons {
    constructor(host) {
        this.host = host;
        this.buttons = [];
        /** The cards lying UNDER the ones above: drawn, never picked, never focused. */
        this.unders = [];
        this.lastKey = '';
    }
    /** The widgets Tab should walk, left to right. */
    focusables() {
        return this.buttons.filter((button) => !button.hidden);
    }
    /** The cards lying under the ones above - drawn only, in the same order. */
    underlays() {
        return this.unders.filter((under) => !under.hidden);
    }
    clear() {
        for (const button of this.buttons)
            button.hide();
        for (const under of this.unders)
            under.hide();
        this.lastKey = '';
        this.host.fallback.show();
    }
    /**
     * Draw the hand as buttons.
     *
     * @returns false when the panel cannot hold them, so the caller falls back
     *          to the text list rather than drawing something unreadable.
     */
    /** Convenience for the ordinary pack, which most callers have. */
    renderStandard(cards, options) {
        return this.render(cards.map((card) => ({ kind: 'standard', card })), options);
    }
    render(cards, options) {
        const panel = this.host.panel;
        const rows = Math.max(0, (Number(panel.height) || 0) - 2);
        const width = Math.max(0, (Number(panel.width) || 0) - 2);
        /*
         * THE PICKED CARD STANDS PROUD of the rest, the way a card pulled half
         * out of a hand does - "can the active card be shifted up one row?"
         * (sysop, 2026-09-15), and asked for EVERY game rather than one, which
         * is why it lives here in the shared renderer and not in a module.
         *
         * The lift needs a row to rise into, so one is kept back from the card
         * size below. That is the whole cost: on a panel that can no longer hold
         * a full-size card with it, the cards come out one size down rather than
         * the lift being dropped - a hand you can read and a card that clearly
         * stands out beats a slightly taller hand that all looks the same.
         */
        const LIFT_ROWS = 1;
        if (cards.length === 0) {
            this.clear();
            return false;
        }
        /*
         * MEASURE, do not trust the table. `card-style.ts` says a full card is
         * seven rows (FULL_CARD_ROWS) and the engine actually draws ten, so a
         * panel the chooser calls roomy can still be one the art overflows. So
         * the art is rendered, measured, and dropped a size if it does not fit -
         * rather than the whole hand falling back to text, which is what the
         * first build did on the sysop's own screen.
         */
        const chrome = (0, card_style_1.resolveCardStyle)(this.host.cardPreferences, rows - LIFT_ROWS, this.host.unicodeCapable);
        const drawOne = (entry, size) => {
            const renderOptions = (0, card_style_1.toRenderOptions)({ ...chrome, size });
            {
                /*
                 * THE FACE IS THE CARD'S, not the row's. `faceDown` turns a whole
                 * row over (the blind endgame), but a row can be MIXED: the six in
                 * front of a Skitgubbe player are three faces and three backs, and
                 * before this the three backs were drawn as whatever card object the
                 * caller had faked to stand in for them - three Aces of Spades on
                 * the sysop's screen (2026-09-15).
                 */
                const face = entry.face ?? (options.faceDown ? 'back' : 'front');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const lines = entry.kind === 'uno'
                    ? cardEngine.renderUnoCardLines({ ...entry.card, face }, renderOptions)
                    : cardEngine.renderCardLines({ ...entry.card, face }, renderOptions);
                return lines.map((line) => (0, utils_1.ansiToBlessedTags)(line));
            }
        };
        const draw = (size) => cards.map((entry) => drawOne(entry, size));
        /*
         * A ROW OF CARDS IS ONE HEIGHT. The engine draws a BACK shorter than a
         * face - three rows shorter at full size - so a mixed row (the three
         * face up and three face down in front of a Skitgubbe player) came out
         * ragged, the backs ending a row above their neighbours. Pad to the
         * tallest and widest in the row; measuring one card and trusting it for
         * the rest is the same mistake FULL_CARD_ROWS makes.
         */
        const square = (candidate) => {
            const widths = candidate.map((art) => (0, utils_1.stripBlessedTags)(art[0] ?? '').length);
            const height = Math.max(0, ...candidate.map((art) => art.length));
            const cardWidth = Math.max(0, ...widths);
            return candidate.map((art, index) => {
                const pad = ' '.repeat(Math.max(0, cardWidth - (widths[index] ?? 0)));
                const padded = art.map((line) => line + pad);
                /*
                 * A short card grows by REPEATING its last row, not by blank ones: a
                 * back is short because its hatching ran out, and one more row of
                 * hatching is what a taller back looks like. Blank padding just moves
                 * the ragged edge into the card.
                 */
                const filler = padded[padded.length - 1] ?? ' '.repeat(cardWidth);
                while (padded.length < height)
                    padded.push(filler);
                return padded;
            });
        };
        /*
         * A CARD IS NEVER NARROWER THAN ELEVEN COLUMNS. `mini` is a SHORTER
         * card, not a thinner one, so six cards laid out with a column of air
         * between them want 72 columns and the hand panel's inside is 57 - and
         * six is exactly what a Skitgubbe player has in front of them. The old
         * chooser had one shape, a grid with air between the cards, and when
         * that did not fit it gave up and left the panel to the text fallback:
         * a condensed hand drawn to no particular height, clipped by the panel,
         * with the face-down cards face up. That is what "V ... just flickers
         * broken cards" was (sysop, 2026-09-15) - not a flicker, the fallback.
         *
         * So there are two shapes now. A hand held in the fingers OVERLAPS, and
         * the second shape says so: one row, each card sitting `stride` columns
         * along from the last, which is what the SDK's own condensed hand layout
         * has always drawn in text. Three columns is the floor - a card showing
         * less than its edge and its rank is not a card you can read - and the
         * grid is still tried first at every size, so nothing that fits today
         * changes shape.
         */
        const MIN_STRIDE = 3;
        /*
         * How far the card on top sits down and to the right of the one under
         * it. Two columns and one row is enough to show a corner of the card
         * below, which is what says "there is something under this" - and it is
         * all the room a 57-column panel can spare for three piles.
         */
        const STACK_X = 2;
        const STACK_Y = 1;
        const stacked = cards.some((entry) => entry.under);
        const slotX = stacked ? STACK_X : 0;
        const slotY = stacked ? STACK_Y : 0;
        const measure = (candidate) => ({
            // The SLOT, which is the card plus the corner of whatever is under it.
            cardWidth: (0, utils_1.stripBlessedTags)(candidate[0]?.[0] ?? '').length + slotX,
            cardHeight: (candidate[0]?.length ?? 0) + slotY,
        });
        /** Cards side by side with a column between them, wrapping into rows. */
        const grid = (candidate, size) => {
            const { cardWidth, cardHeight } = measure(candidate);
            if (cardWidth === 0 || cardHeight === 0)
                return null;
            const perRow = Math.max(1, Math.floor(width / (cardWidth + 1)));
            const cardRows = Math.ceil(cards.length / perRow);
            if (cardRows * cardHeight + LIFT_ROWS > rows)
                return null;
            return { perRow, size, stride: cardWidth + 1, stackY: 0, cardRows, height: cardHeight, cardWidth };
        };
        /** One row, each card overlapping the one before it. */
        const fan = (candidate, size) => {
            const { cardWidth, cardHeight } = measure(candidate);
            if (cardWidth === 0 || cardHeight === 0)
                return null;
            if (cards.length < 2)
                return null;
            if (cardHeight + LIFT_ROWS > rows)
                return null;
            const stride = Math.floor((width - cardWidth) / (cards.length - 1));
            if (stride < MIN_STRIDE)
                return null;
            return {
                perRow: cards.length,
                size,
                stackY: 0,
                stride: Math.min(stride, cardWidth + 1),
                cardRows: 1,
                height: cardHeight,
                cardWidth,
            };
        };
        /** One pile: each card a step down and right of the one below it. */
        const asPile = (candidate, size) => {
            const { cardWidth, cardHeight } = measure(candidate);
            if (cardWidth === 0 || cardHeight === 0)
                return null;
            const steps = cards.length - 1;
            if (cardHeight + steps * STACK_Y + LIFT_ROWS > rows)
                return null;
            if (cardWidth + steps * STACK_X > width)
                return null;
            return {
                perRow: cards.length,
                size,
                stride: STACK_X,
                stackY: STACK_Y,
                cardRows: 1,
                height: cardHeight,
                cardWidth,
            };
        };
        // Biggest card first, and air before overlap.
        const sizes = chrome.size === 'full' ? ['full', 'mini'] : ['mini'];
        const drawn = new Map();
        const artFor = (size) => {
            if (!drawn.has(size))
                drawn.set(size, square(draw(size)));
            return drawn.get(size);
        };
        let art = null;
        let layout = null;
        for (const shape of options.pile ? [asPile, grid, fan] : [grid, fan]) {
            for (const size of sizes) {
                const candidate = artFor(size);
                const found = shape(candidate, size);
                if (found) {
                    art = candidate;
                    layout = found;
                    break;
                }
            }
            if (layout)
                break;
        }
        if (!layout || !art) {
            this.clear();
            return false;
        }
        // The slot holds the card plus the corner of what is under it; the
        // widgets themselves are the size of the card art.
        const slotWidth = layout.cardWidth;
        const cardWidth = slotWidth - slotX;
        const cardHeight = layout.height - slotY;
        const underArt = stacked
            ? cards.map((entry) => (entry.under
                ? square([drawOne(entry.under, layout.size)])[0]
                : null))
            : cards.map(() => null);
        /*
         * A full-size card is TEN rows and the hand panel's inside is ten, so a
         * number printed under each card does not fit - it was the difference
         * between drawing the buttons and declining them entirely. The label row
         * is drawn when there is room for it and dropped when there is not: a
         * card with no number under it is still clickable and still focusable,
         * and the activity panel names the keys either way.
         */
        const perRow = layout.perRow;
        const withLabels = layout.stackY === 0
            && layout.cardRows * (cardHeight + 1) + LIFT_ROWS <= rows;
        const buttonHeight = withLabels ? cardHeight + 1 : cardHeight;
        this.host.fallback.hide();
        this.ensure(cards.length);
        if (stacked)
            this.ensureUnders(cards.length);
        cards.forEach((_, index) => {
            const button = this.buttons[index];
            const row = Math.floor(index / perRow);
            const column = index % perRow;
            const picked = index === options.selected;
            const playable = options.playable.includes(index);
            const number = (options.labelFrom ?? 1) + index;
            const label = number === 10 ? '0' : String(number);
            const slotTop = row * buttonHeight + (picked ? 0 : LIFT_ROWS) + index * layout.stackY;
            const slotLeft = column * layout.stride;
            /*
             * The card UNDER this one, at the slot's own corner: the card on top
             * is then offset down and right, so the one below shows through at the
             * top left the way a pile does.
             */
            const beneath = underArt[index];
            const underButton = this.unders[index];
            if (beneath && underButton) {
                underButton.show();
                underButton.width = cardWidth;
                underButton.height = cardHeight;
                underButton.top = slotTop;
                underButton.left = slotLeft;
                underButton.setContent(beneath.join('\n'));
                // Behind everything, whatever order the widgets were made in.
                underButton.setBack?.();
            }
            else if (underButton) {
                underButton.hide();
            }
            button.show();
            button.width = cardWidth;
            button.height = buttonHeight;
            // Everything sits one row down, and the picked card rises into the gap.
            button.top = slotTop + (beneath ? slotY : 0);
            button.left = slotLeft + (beneath ? slotX : 0);
            const showLabel = withLabels && options.labels !== false;
            button.setContent(showLabel
                ? [
                    ...art[index],
                    picked
                        ? `{yellow-bg}{black-fg}[${label}]{/}{/}`
                        : playable
                            ? `{green-fg}[${label}]{/}`
                            : `{${constants_1.UI_THEME.dim}-fg}[${label}]{/}`,
                ].join('\n')
                : art[index].join('\n'));
            // Rebound every frame: the index a widget stands for changes as cards
            // leave the hand, and a stale closure would play the wrong card.
            button.removeAllListeners('click');
            button.removeAllListeners('press');
            button.removeAllListeners('focus');
            button.on('click', () => options.onPick(index));
            button.on('press', () => options.onPick(index));
            if (options.onFocus)
                button.on('focus', () => options.onFocus?.(index));
            // A row that cannot be picked from does not take the focus either.
            button.options.focusable = options.labels !== false;
            button.clickable = options.labels !== false;
        });
        for (let index = cards.length; index < this.buttons.length; index += 1) {
            this.buttons[index].hide();
        }
        for (let index = cards.length; index < this.unders.length; index += 1) {
            this.unders[index].hide();
        }
        /*
         * A pile is read from the top card down, so the cards have to be laid in
         * that order: the last one in the row is the one lying on all the rest.
         */
        if (layout.stackY > 0) {
            for (const button of this.buttons.slice(0, cards.length))
                button.setFront?.();
        }
        /*
         * In a fan each card is drawn over the one before it, so the card the
         * caller has picked - the whole point of the lift - would be the one
         * half covered. It comes to the front instead, and the lift then shows
         * a whole card standing proud of the row.
         */
        if (layout.stride <= cardWidth && options.selected !== null
            && options.selected >= 0 && options.selected < cards.length) {
            this.buttons[options.selected].setFront?.();
        }
        // Only repaint when something actually changed - a table refresh runs
        // every few seconds and the cards are usually the same ones.
        const key = `${cards.map((entry) => entry.kind === 'uno'
            ? `${entry.card.color}${entry.card.value}`
            : `${entry.card.rank}${entry.card.suit}`).join(',')}|${options.selected}`
            + `|${options.playable.join(',')}|${options.faceDown ? 'b' : 'f'}|${withLabels ? 'L' : '-'}`
            // The shape as well: the same cards in a resized panel are a different
            // picture, and skipping that repaint leaves a fan at the old stride.
            + `|${cardWidth}x${cardHeight}@${layout.stride}/${layout.perRow}`
            + `|${cards.map((entry) => (entry.under
                ? `${entry.under.card.rank ?? entry.under.card.color}${entry.under.face ?? ''}`
                : '-')).join(',')}`;
        if (key !== this.lastKey) {
            this.lastKey = key;
            this.host.screen.render();
        }
        return true;
    }
    /** The widgets for the cards underneath, made once and reused. */
    ensureUnders(count) {
        while (this.unders.length < count) {
            this.unders.push((0, blessed_helpers_1.createBox)({
                parent: this.host.panel,
                border: undefined,
                top: 1,
                left: 1,
                width: 9,
                height: 7,
                tags: true,
                mouse: false,
                keys: false,
                clickable: false,
                focusable: false,
                hidden: true,
                style: { bg: constants_1.UI_THEME.windowBg },
            }));
        }
    }
    ensure(count) {
        while (this.buttons.length < count) {
            this.buttons.push((0, blessed_helpers_1.createBox)({
                parent: this.host.panel,
                border: undefined,
                top: 1,
                left: 1,
                width: 9,
                height: 7,
                tags: true,
                mouse: true,
                keys: true,
                clickable: true,
                focusable: true,
                hidden: true,
                style: {
                    bg: constants_1.UI_THEME.windowBg,
                    focus: { border: { fg: constants_1.UI_THEME.accent } },
                },
            }));
        }
    }
}
exports.CardButtons = CardButtons;
