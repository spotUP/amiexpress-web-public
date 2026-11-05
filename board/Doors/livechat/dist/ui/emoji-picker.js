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
const door_theme_1 = require("../door-theme");
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
class EmojiPicker {
    constructor(screen) {
        this.screen = screen;
        /*
         * Fifty-two columns is an eighty-column screen's dialog; a C64 has
         * forty. The picker is an overlay, so it has no neighbour to yield to -
         * it simply hangs off the right edge. Sized from the screen it is the
         * same box at eighty and fits at forty, where the CATEGORY column gives
         * up its width first: the emoji themselves are what the caller reads.
         */
        const screenColumns = Number(screen.width) || 80;
        const pickerWidth = Math.min(PICKER_WIDTH, Math.max(20, screenColumns - 2));
        const categoryWidth = Math.min(CATEGORY_WIDTH, Math.max(8, pickerWidth - 24));
        const itemWidth = pickerWidth - categoryWidth - 2 - 1 - 2;
        this.picker = new blessed_1.CategoryPicker({
            parent: screen,
            title: 'Emoji Picker [Tab | Enter]',
            // 52, not 44: the list shows the emoji ART now, not just its
            // shortcode, and both have to fit on one line - a label that wraps
            // pushes every row below it out of line. See PICKER_WIDTH.
            width: pickerWidth,
            height: 14,
            categories: CATEGORIES,
            // categoryWidth was 12 -> 10 chars of content after the box border.
            // List items are ` Category` (8+1 space) plus the `>>` selection
            // marker the List itself prepends to the focused row = 11 chars,
            // which made "Emotions"/"Actions"/"Symbols"/"Special" all wrap to
            // a second line. 14 leaves 12 chars of content, comfortably fitting
            // ` Emotions` + `>>`.
            categoryWidth,
            debounceMs: 80,
            borderColor: theme_1.PANEL_BORDER,
            zIndex: 9990,
            categoryStyle: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                selected: { fg: door_theme_1.T.ground, bg: door_theme_1.T.ok },
            },
            itemStyle: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                selected: { fg: door_theme_1.T.ground, bg: door_theme_1.T.accent },
            },
            getItems: (category) => {
                const emojiCategory = CATEGORY_MAP[category] || 'emotions';
                const emojis = (0, emojis_1.getEmojisByCategory)(emojiCategory);
                return emojis.map(e => ({
                    id: e.code,
                    // The ART first - it is the emoji. The shortcode follows so it can
                    // still be typed from the keyboard.
                    label: (0, emoji_label_1.emojiLabel)(e, itemWidth),
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
            x: Math.max(0, screenWidth - Number(this.picker.width ?? screenWidth)),
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
