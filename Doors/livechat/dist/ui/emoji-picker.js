"use strict";
/**
 * Emoji Picker Dialog - uses SDK CategoryPicker widget
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmojiPicker = void 0;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const emojis_1 = require("../utils/emojis");
const CATEGORY_MAP = {
    'Emotions': 'emotions',
    'Actions': 'actions',
    'Symbols': 'symbols',
    'Special': 'special',
};
const CATEGORIES = ['Emotions', 'Actions', 'Symbols', 'Special'];
class EmojiPicker {
    constructor(screen) {
        this.screen = screen;
        this.picker = new blessed_1.CategoryPicker({
            parent: screen,
            title: 'Emoji Picker [Tab | Enter]',
            width: 42,
            height: 14,
            categories: CATEGORIES,
            categoryWidth: 12,
            debounceMs: 80,
            borderColor: 'cyan',
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
                    label: `${e.code}  ${e.keywords[0] || ''}`,
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
            x: screenWidth - 44,
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
