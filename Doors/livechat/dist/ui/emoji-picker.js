"use strict";
/**
 * Emoji Picker Dialog - uses SDK CategoryPicker widget
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmojiPicker = void 0;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const theme_1 = require("./theme");
const emojis_1 = require("../utils/emojis");
const emoji_label_1 = require("../utils/emoji-label");
const CATEGORY_MAP = {
    'Emotions': 'emotions',
    'Actions': 'actions',
    'Symbols': 'symbols',
    'Special': 'special',
};
const CATEGORIES = ['Emotions', 'Actions', 'Symbols', 'Special'];
const PICKER_WIDTH = 52;
const CATEGORY_WIDTH = 14;
/**
 * Room a label actually gets: the box minus the category column, minus the
 * two border columns, the leading space renderItem adds and the `>>` marker
 * the List prepends to the focused row.
 */
const ITEM_WIDTH = PICKER_WIDTH - CATEGORY_WIDTH - 2 - 1 - 2;
class EmojiPicker {
    constructor(screen) {
        this.screen = screen;
        this.picker = new blessed_1.CategoryPicker({
            parent: screen,
            title: 'Emoji Picker [Tab | Enter]',
            // 52, not 44: the list shows the emoji ART now, not just its
            // shortcode, and both have to fit on one line - a label that wraps
            // pushes every row below it out of line. See PICKER_WIDTH.
            width: PICKER_WIDTH,
            height: 14,
            categories: CATEGORIES,
            // categoryWidth was 12 -> 10 chars of content after the box border.
            // List items are ` Category` (8+1 space) plus the `>>` selection
            // marker the List itself prepends to the focused row = 11 chars,
            // which made "Emotions"/"Actions"/"Symbols"/"Special" all wrap to
            // a second line. 14 leaves 12 chars of content, comfortably fitting
            // ` Emotions` + `>>`.
            categoryWidth: CATEGORY_WIDTH,
            debounceMs: 80,
            borderColor: theme_1.PANEL_BORDER,
            zIndex: 9990,
            categoryStyle: {
                fg: 'white',
                bg: 'black',
                selected: { fg: 'black', bg: 'green' },
            },
            itemStyle: {
                fg: 'white',
                bg: 'black',
                selected: { fg: 'black', bg: 'cyan' },
            },
            getItems: (category) => {
                const emojiCategory = CATEGORY_MAP[category] || 'emotions';
                const emojis = (0, emojis_1.getEmojisByCategory)(emojiCategory);
                return emojis.map(e => ({
                    id: e.code,
                    // The ART first - it is the emoji. The shortcode follows so it can
                    // still be typed from the keyboard.
                    label: (0, emoji_label_1.emojiLabel)(e, ITEM_WIDTH),
                    emoji: e, // Store the full emoji object
                }));
            },
            renderItem: (item) => ` ${item.label}`,
        });
    }
    show(screen, onSelect, onCancel) {
        this.picker.onSelect((item, category) => {
            if (item.emoji) {
                onSelect(item.emoji);
            }
        });
        this.picker.onCancel(onCancel);
        // Position near bottom-right
        const screenWidth = screen.width || 80;
        const screenHeight = screen.height || 24;
        this.picker.display({
            x: screenWidth - PICKER_WIDTH,
            y: screenHeight - 7,
        });
    }
    hide() {
        this.picker.hide();
    }
    isVisible() {
        return this.picker.isVisible();
    }
    destroy() {
        this.picker.destroy();
    }
}
exports.EmojiPicker = EmojiPicker;
