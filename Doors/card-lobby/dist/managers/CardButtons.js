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
        this.lastKey = '';
    }
    /** The widgets Tab should walk, left to right. */
    focusables() {
        return this.buttons.filter((button) => !button.hidden);
    }
    clear() {
        for (const button of this.buttons)
            button.hide();
        this.lastKey = '';
        this.host.handContent.show();
    }
    /**
     * Draw the hand as buttons.
     *
     * @returns false when the panel cannot hold them, so the caller falls back
     *          to the text list rather than drawing something unreadable.
     */
    render(cards, options) {
        const panel = this.host.handPanel;
        const rows = Math.max(0, (Number(panel.height) || 0) - 2);
        const width = Math.max(0, (Number(panel.width) || 0) - 2);
        if (cards.length === 0) {
            this.clear();
            return false;
        }
        const chrome = (0, card_style_1.resolveCardStyle)(this.host.cardPreferences, rows - 1, this.host.unicodeCapable);
        if (chrome.size !== 'full') {
            this.clear();
            return false; // the list says more in less
        }
        const art = cards.map((card) => cardEngine.renderCardLines({ ...card, face: options.faceDown ? 'back' : 'front' }, (0, card_style_1.toRenderOptions)(chrome)).map((line) => (0, utils_1.ansiToBlessedTags)(line)));
        const cardWidth = (0, utils_1.stripBlessedTags)(art[0]?.[0] ?? '').length;
        const cardHeight = art[0]?.length ?? 0;
        if (cardWidth === 0 || cardHeight === 0) {
            this.clear();
            return false;
        }
        /*
         * A full-size card is TEN rows and the hand panel's inside is ten, so a
         * number printed under each card does not fit - it was the difference
         * between drawing the buttons and declining them entirely. The label row
         * is drawn when there is room for it and dropped when there is not: a
         * card with no number under it is still clickable and still focusable,
         * and the activity panel names the keys either way.
         */
        const perRow = Math.max(1, Math.floor(width / (cardWidth + 1)));
        const cardRows = Math.ceil(cards.length / perRow);
        const withLabels = cardRows * (cardHeight + 1) <= rows;
        const buttonHeight = withLabels ? cardHeight + 1 : cardHeight;
        if (cardRows * buttonHeight > rows) {
            this.clear();
            return false;
        }
        this.host.handContent.hide();
        this.ensure(cards.length);
        cards.forEach((_, index) => {
            const button = this.buttons[index];
            const row = Math.floor(index / perRow);
            const column = index % perRow;
            const picked = index === options.selected;
            const playable = options.playable.includes(index);
            const label = index === 9 ? '0' : String(index + 1);
            button.show();
            button.width = cardWidth;
            button.height = buttonHeight;
            button.top = row * buttonHeight;
            button.left = column * (cardWidth + 1);
            button.setContent(withLabels
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
            button.on('click', () => options.onPick(index));
            button.on('press', () => options.onPick(index));
        });
        for (let index = cards.length; index < this.buttons.length; index += 1) {
            this.buttons[index].hide();
        }
        // Only repaint when something actually changed - a table refresh runs
        // every few seconds and the cards are usually the same ones.
        const key = `${cards.map((c) => `${c.rank}${c.suit}`).join(',')}|${options.selected}`
            + `|${options.playable.join(',')}|${options.faceDown ? 'b' : 'f'}|${withLabels ? 'L' : '-'}`;
        if (key !== this.lastKey) {
            this.lastKey = key;
            this.host.screen.render();
        }
        return true;
    }
    ensure(count) {
        while (this.buttons.length < count) {
            this.buttons.push((0, blessed_helpers_1.createBox)({
                parent: this.host.handPanel,
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
