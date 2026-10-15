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
        /** The card currently under the pointer mid-drag, if any. */
        this.dragging = null;
    }
    /** The widgets Tab should walk, left to right. */
    focusables() {
        return this.buttons.filter((button) => !button.hidden);
    }
    /**
     * WHICH CARD IS AT THIS POINT ON THE SCREEN, if any.
     *
     * Cards overlap - a fan and a pile both draw them a few columns apart - so
     * the LAST one to cover a cell is the one a caller means, the same way the
     * eye reads it. `skip` leaves out the card being dragged, which is
     * travelling under the pointer and would otherwise answer every question.
     */
    indexAt(x, y, skip) {
        let found = null;
        this.buttons.forEach((button, index) => {
            if (button.hidden || index === skip)
                return;
            const left = Number(button.aleft);
            const top = Number(button.atop);
            const width = Number(button.width) || 0;
            const height = Number(button.height) || 0;
            if (x >= left && x < left + width && y >= top && y < top + height)
                found = index;
        });
        return found;
    }
    /**
     * Where this row's panel sits, in screen cells.
     *
     * A drop is decided by WHERE the pointer let go: a card dragged onto the
     * panel holding the pile is a card played onto the pile. Only the renderer
     * knows where its panel is, so it is the one asked.
     */
    panelBounds() {
        const panel = this.host.panel;
        return {
            left: Number(panel?.aleft) || 0,
            top: Number(panel?.atop) || 0,
            width: Number(panel?.width) || 0,
            height: Number(panel?.height) || 0,
        };
    }
    /** Is this point inside the panel these cards are drawn in? */
    covers(x, y) {
        const box = this.panelBounds();
        return x >= box.left && x < box.left + box.width
            && y >= box.top && y < box.top + box.height;
    }
    /** The cards lying under the ones above - drawn only, in the same order. */
    underlays() {
        return this.unders.filter((under) => !under.hidden);
    }
    /**
     * The inside width of the panel these cards are drawn in.
     *
     * The animator asks so it knows where OFF the panel is - a card slides in
     * from beyond the right edge, and only the renderer knows where that edge
     * is for this row.
     */
    panelWidth() {
        return Math.max(0, (Number(this.host.panel.width) || 0) - 2);
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
        /*
         * ...and the lift is the FIRST thing given up. A hand of twenty at five
         * rows a card needs two rows of ten, which is exactly the panel's ten
         * rows with nothing left over: keeping a row back for the lift would
         * drop the whole hand to the text list to preserve an effect nobody can
         * see on a hand they cannot see. So every shape is tried with the lift
         * and then, if none fitted, without it.
         */
        let lift = LIFT_ROWS;
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
        const square = (candidate, to) => {
            const widths = candidate.map((art) => (0, utils_1.stripBlessedTags)(art[0] ?? '').length);
            const height = to?.height ?? Math.max(0, ...candidate.map((art) => art.length));
            const cardWidth = to?.width ?? Math.max(0, ...widths);
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
        /*
         * A PILE STEPS FURTHER, so every card in it can be READ.
         *
         * "the last 3 has to be seen so i know when it's a good time to put down
         * the last to create a 4 pair" (sysop, 2026-09-16) - four of a rank in a
         * row turns the pile away, so the ranks under the top card are what the
         * decision is made on. Two columns shows a card's left border and one
         * cell of nothing; four reaches the rank itself, `10` included, which is
         * the widest there is.
         *
         * The piles in FRONT of a player keep the tighter step: what shows there
         * is a blind card, and there is nothing on it to read.
         *
         * And it steps SIDEWAYS ONLY - "can we overlap them side by side so the
         * value is visible?" (sysop, 2026-09-16). A staircase spends a row per
         * card and pushes the ranks apart diagonally, which reads as three
         * separate cards rather than one pile; overlapping along a single row is
         * how a hand is held, and every rank lines up to be read at once.
         */
        const PILE_STACK_X = 4;
        const PILE_STACK_Y = 0;
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
            if (cardRows * cardHeight + lift > rows)
                return null;
            return { perRow, size, stride: cardWidth + 1, stackY: 0, cardRows, height: cardHeight, cardWidth };
        };
        /**
         * Cards overlapping like a hand held in the fingers, in as few rows as
         * the panel allows.
         *
         * One row for a hand of six; more when a hand gets long. "how do we do
         * when a user has picked up 20 cards?" (sysop, 2026-09-15) - twenty at
         * eleven columns each will not overlap into 57 columns without hiding
         * the ranks, so they go into two rows of ten rather than falling back to
         * the text list. Fewest rows first: a hand read left to right beats a
         * hand read in a block.
         */
        const fan = (candidate, size) => {
            const { cardWidth, cardHeight } = measure(candidate);
            if (cardWidth === 0 || cardHeight === 0)
                return null;
            if (cards.length < 2)
                return null;
            const maxRows = Math.floor((rows - lift) / cardHeight);
            for (let cardRows = 1; cardRows <= maxRows; cardRows += 1) {
                const perRow = Math.ceil(cards.length / cardRows);
                if (perRow < 2)
                    continue;
                const stride = Math.floor((width - cardWidth) / (perRow - 1));
                if (stride < MIN_STRIDE)
                    continue;
                return {
                    perRow,
                    size,
                    stackY: 0,
                    stride: Math.min(stride, cardWidth + 1),
                    cardRows,
                    height: cardHeight,
                    cardWidth,
                };
            }
            return null;
        };
        /** One pile: each card a step down and right of the one below it. */
        const asPile = (candidate, size) => {
            const { cardWidth, cardHeight } = measure(candidate);
            if (cardWidth === 0 || cardHeight === 0)
                return null;
            const steps = cards.length - 1;
            if (cardHeight + steps * PILE_STACK_Y + lift > rows)
                return null;
            if (cardWidth + steps * PILE_STACK_X > width)
                return null;
            return {
                perRow: cards.length,
                size,
                stride: PILE_STACK_X,
                stackY: PILE_STACK_Y,
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
        /*
         * THE BIGGEST CARD THAT FITS, and the lift is what pays for it.
         *
         * "the face down cards was not as tall as they could be" (sysop,
         * 2026-09-16). The search used to hold the lift row back first and drop
         * the CARD SIZE to keep it, so a panel one row short of a full card with
         * a lift drew half-height cards - with a row of the panel left empty
         * underneath them. A row of cards you can read is the point; a card
         * standing proud of its neighbours is a nicety, and the nicety goes
         * first.
         *
         * So size is the outer loop now: full with the lift, full without it,
         * and only then a smaller card.
         */
        /*
         * WHAT A ROW OF CARDS GIVES UP FIRST, in order:
         *
         *   1. nothing - the biggest card, its number under it, and the lift;
         *   2. the lift, the row a picked card rises into;
         *   3. the card SIZE;
         *   4. the numbers, and only when no size will fit with them.
         *
         * The numbers come near-last on purpose: they are how a caller PLAYS the
         * card ("4, 5 or 6 for the table card"), so a smaller card you can name
         * beats a bigger one you cannot. Below that, size beats the lift - a
         * half-height card with an empty row under it was what "the face down
         * cards was not as tall as they could be" (sysop, 2026-09-16) looked
         * like.
         */
        const wantsLabels = options.labels !== false;
        const labelsFit = (found) => found.stackY === 0 && found.cardRows * ((found.height - slotY) + 1) + lift <= rows;
        for (const needLabels of wantsLabels ? [true, false] : [false]) {
            for (const size of sizes) {
                for (const tryLift of [LIFT_ROWS, 0]) {
                    lift = tryLift;
                    for (const shape of options.pile ? [asPile, grid, fan] : [grid, fan]) {
                        const candidate = artFor(size);
                        const found = shape(candidate, size);
                        if (process.env.CARD_LAYOUT_DEBUG) {
                            // eslint-disable-next-line no-console
                            console.error('[layout]', JSON.stringify({
                                needLabels, size, lift, shape: shape.name, rows, width,
                                art: candidate[0]?.length, slotX, slotY,
                                found: found && { h: found.height, w: found.cardWidth, rows: found.cardRows },
                                labels: found ? labelsFit(found) : null,
                            }));
                        }
                        if (found && (!needLabels || labelsFit(found))) {
                            art = candidate;
                            layout = found;
                            break;
                        }
                    }
                    if (layout)
                        break;
                }
                if (layout)
                    break;
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
        /*
         * THE CARD UNDERNEATH IS SQUARED TO THE CARD ON TOP OF IT.
         *
         * The engine draws a back SHORTER than a face - four rows against five at
         * `mini` - and each pile's blind card used to be squared only against
         * itself, so it ended two rows above the open card lying on it and the
         * bottom of the pile was simply missing ("the bottom cards in the
         * skitgubbe piles are missing the two bottom rows", sysop 2026-09-16).
         * A pile is one card tall plus the step, so both layers take the SAME
         * measurements - the ones the layout settled on.
         */
        const underArt = stacked
            ? square(cards.map((entry) => (entry.under ? drawOne(entry.under, layout.size) : [])), 
            // The pile's FULL height, not the top card's: the blind card is
            // offset up by `slotY`, so matching only the card on top of it leaves
            // its last row hanging in the air above the pile's bottom edge - "the
            // blind cards are missing their bottom row" (sysop, 2026-09-16). Made
            // this tall, its left edge runs the whole way down and the two cards
            // finish level, which is what a card lying on another one looks like.
            { height: cardHeight + slotY, width: cardWidth }).map((padded, index) => (cards[index].under ? padded : null))
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
        const roomForLabels = layout.stackY === 0
            && layout.cardRows * (cardHeight + 1) + lift <= rows;
        /*
         * Whether a label is ACTUALLY drawn, which is not the same as whether
         * there is room for one: a row the caller cannot pick from asks for none
         * (`labels: false` - the pile, the cards in front of you). Reserving the
         * row anyway made every widget one taller than its own content, which
         * wasted a row per row of cards and left a pile's widget a row taller
         * than the blind card underneath it.
         */
        const withLabels = roomForLabels && options.labels !== false;
        const buttonHeight = withLabels ? cardHeight + 1 : cardHeight;
        this.host.fallback.hide();
        this.ensure(cards.length);
        if (stacked)
            this.ensureUnders(cards.length);
        cards.forEach((_, index) => {
            const button = this.buttons[index];
            const row = Math.floor(index / perRow);
            const column = index % perRow;
            const picked = Array.isArray(options.selected)
                ? options.selected.includes(index)
                : index === options.selected;
            const playable = options.playable.includes(index);
            const number = (options.labelFrom ?? 1) + index;
            const label = number === 10 ? '0' : String(number);
            const slotTop = row * buttonHeight + (picked ? 0 : lift) + index * layout.stackY;
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
                underButton.height = cardHeight + slotY;
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
            /*
             * A CARD IN FLIGHT IS NOT IN THIS ROW'S COORDINATES.
             *
             * "when i click and hold the button on a card without moving the mouse
             * the card is drawn at the top of the screen not at the current
             * position" (sysop, 2026-09-16).
             *
             * Picking a card up reparents it to the SCREEN so nothing clips it
             * (`beginDrag`), and picking it up also repaints the panels - the door
             * lights the card the caller grabbed. This loop then wrote `top = 1`
             * at a widget whose parent is now the whole screen, and row one of the
             * screen is where it went. Moving the mouse hid the bug, because the
             * next mousemove overwrote the position before anything was drawn.
             *
             * So the renderer owns every card except the one being carried: that
             * one belongs to the pointer until the button comes up.
             */
            if (this.dragging === index)
                return;
            button.width = cardWidth;
            button.height = buttonHeight;
            // Everything sits one row down, and the picked card rises into the gap.
            button.top = slotTop + (beneath ? slotY : 0);
            button.left = slotLeft + (beneath ? slotX : 0);
            const showLabel = withLabels;
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
            button.removeAllListeners('mousedown');
            button.removeAllListeners('mouseup');
            button.on('click', () => options.onPick(index));
            button.on('press', () => options.onPick(index));
            if (options.onFocus)
                button.on('focus', () => options.onFocus?.(index));
            // The two halves of a drag. A plain click still reaches `onPick`: the
            // widget emits `click` on mousedown as well, so a caller who never
            // moves the mouse gets the behaviour they always had.
            if (options.onGrab) {
                button.on('mousedown', (data) => {
                    options.onGrab?.(index);
                    this.beginDrag(index, data, options);
                });
            }
            if (options.onDrop) {
                button.on('mouseup', () => {
                    /*
                     * A CARD DOES NOT DROP ON ITSELF.
                     *
                     * The card being carried follows the pointer and is drawn in
                     * front, so at the moment the button comes up IT is the widget
                     * under the cursor - and this handler fired first, resolving the
                     * drop to the card's own place before the pointer's coordinates
                     * were ever looked at. The gesture ended where it started, which
                     * is what "the card drops before i let go of them when i drag them
                     * out to the pile" (sysop, 2026-09-16) looks like from the other
                     * side. The screen-level drop (`onDropAt`) hit-tests the cards the
                     * caller can actually see and skips the one in flight.
                     */
                    if (this.dragging === index)
                        return;
                    options.onDrop?.(index);
                });
            }
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
        if (layout.stride <= cardWidth && options.selected !== null) {
            const lifted = Array.isArray(options.selected) ? options.selected : [options.selected];
            for (const index of lifted) {
                if (index >= 0 && index < cards.length)
                    this.buttons[index].setFront?.();
            }
        }
        // Only repaint when something actually changed - a table refresh runs
        // every few seconds and the cards are usually the same ones.
        const key = `${cards.map((entry) => entry.kind === 'uno'
            ? `${entry.card.color}${entry.card.value}`
            : `${entry.card.rank}${entry.card.suit}`).join(',')}|${options.selected}`
            + `|${Array.isArray(options.selected) ? options.selected.join('+') : options.selected}`
            + `|${options.playable.join(',')}|${options.faceDown ? 'b' : 'f'}|${withLabels ? 'L' : '-'}`
            // The shape as well: the same cards in a resized panel are a different
            // picture, and skipping that repaint leaves a fan at the old stride.
            + `|${cardWidth}x${cardHeight}@${layout.stride}/${layout.perRow}+${lift}`
            + `|${cards.map((entry) => (entry.under
                ? `${entry.under.card.rank ?? entry.under.card.color}${entry.under.face ?? ''}`
                : '-')).join(',')}`;
        if (key !== this.lastKey) {
            this.lastKey = key;
            this.host.screen.render();
        }
        return true;
    }
    /**
     * CARRY A CARD UNDER THE POINTER until the button comes up.
     *
     * "i dont see the card being dragged when in drag it i just see it moved
     * when i drop it" (sysop, 2026-09-16) - the move happened, but nothing was
     * ever drawn between the two ends of it.
     *
     * The card is moved by hand rather than through blessed's own
     * `enableDrag`, for one reason: that claims the screen's exclusive routing,
     * and then the card the gesture is aimed AT never receives its `mouseup`.
     * Here the widget simply follows, the screen keeps routing normally, and
     * where the drag ended is answered by coordinates (`onDropAt`).
     */
    beginDrag(index, data, options) {
        const button = this.buttons[index];
        const screen = this.host.screen;
        if (!button || !screen?.on)
            return;
        /*
         * WHERE THE CARD IS, IN BOTH FRAMES.
         *
         * `aleft`/`atop` are screen cells - what the card travels in. `position`
         * is the raw number the renderer WROTE, which is what it must be given
         * back when it goes home: reading `button.left` does not return that
         * number, because the getter measures from the panel's outer corner and
         * the setter counts from inside its border. Read one, write the other,
         * and every drag moved the card a cell up and to the left - the same
         * trap the deal animation hit.
         */
        const grab = {
            dx: Number(data?.x ?? 0) - Number(button.aleft ?? 0),
            dy: Number(data?.y ?? 0) - Number(button.atop ?? 0),
            screenLeft: Number(button.aleft) || 0,
            screenTop: Number(button.atop) || 0,
            home: {
                left: button.position?.left ?? (Number(button.left) || 0),
                top: button.position?.top ?? (Number(button.top) || 0),
            },
        };
        /*
         * THE WHOLE CARD TRAVELS, not the part that still fits.
         *
         * "the whole card should be visible when dragging with mouse as well"
         * (sysop, 2026-09-16). A widget is clipped to its parent, and the panel a
         * card lives in is only a few rows taller than the card - so a card
         * dragged towards the panel's edge lost its bottom, and one dragged
         * towards the OTHER row disappeared at the border between them.
         *
         * So while it travels it belongs to the SCREEN: nothing clips it, it is
         * drawn over everything, and it goes back to its own panel when the
         * button comes up. The positions become screen coordinates for the
         * duration, which is why the follow below works off `aleft`/`atop`
         * rather than the panel's frame.
         */
        const home = button.parent;
        const screenParent = this.host.screen;
        if (home && typeof home.remove === 'function' && typeof screenParent.append === 'function') {
            home.remove(button);
            screenParent.append(button);
            // The screen has no border to count from, so a screen cell IS the
            // number to write - the card does not move when it is picked up.
            button.left = grab.screenLeft;
            button.top = grab.screenTop;
        }
        // In front of its neighbours while it travels, or it slides UNDER the
        // cards it is being dragged past - and drawn there at once, so a caller
        // who holds the button still sees the card where they took hold of it.
        button.setFront?.();
        this.dragging = index;
        screen.render?.();
        const follow = (event) => {
            if (event?.action === 'mousemove') {
                // Screen coordinates: while it travels the card is the screen's.
                button.left = Number(event.x) - grab.dx;
                button.top = Number(event.y) - grab.dy;
                screen.render();
                return;
            }
            if (event?.action !== 'mouseup')
                return;
            screen.removeListener?.('mouse', follow);
            this.dragging = null;
            // Home again, where the renderer had it. The caller's drop decides what
            // the cards do next and re-renders from the real state.
            if (home && typeof screenParent.remove === 'function') {
                screenParent.remove(button);
                home.append(button);
            }
            button.left = grab.home.left;
            button.top = grab.home.top;
            screen.render();
            options.onDropAt?.(Number(event.x), Number(event.y));
        };
        screen.on('mouse', follow);
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
