"use strict";
/**
 * Format Picker Dialog - uses SDK CategoryPicker widget
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FormatPicker = void 0;
exports.getAllFormats = getAllFormats;
exports.getFormatsByCategory = getFormatsByCategory;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
// Available formats grouped by category
const FORMATS = {
    colors: [
        { category: 'colors', name: 'Red', wrap: (t) => `{red-fg}${t}{/}` },
        { category: 'colors', name: 'Green', wrap: (t) => `{green-fg}${t}{/}` },
        { category: 'colors', name: 'Blue', wrap: (t) => `{blue-fg}${t}{/}` },
        { category: 'colors', name: 'Yellow', wrap: (t) => `{yellow-fg}${t}{/}` },
        { category: 'colors', name: 'Cyan', wrap: (t) => `{cyan-fg}${t}{/}` },
        { category: 'colors', name: 'Magenta', wrap: (t) => `{magenta-fg}${t}{/}` },
        { category: 'colors', name: 'White', wrap: (t) => `{white-fg}${t}{/}` },
        { category: 'colors', name: 'Gray', wrap: (t) => `{gray-fg}${t}{/}` },
    ],
    effects: [
        { category: 'effects', name: 'Rainbow', wrap: (t) => `~rainbow~${t}~/rainbow~` },
        { category: 'effects', name: 'Pulse', wrap: (t) => `~pulse~${t}~/pulse~` },
        { category: 'effects', name: 'Sparkle', wrap: (t) => `~sparkle~${t}~/sparkle~` },
        { category: 'effects', name: 'Shake', wrap: (t) => `~shake~${t}~/shake~` },
        { category: 'effects', name: 'Wave', wrap: (t) => `~wave~${t}~/wave~` },
        { category: 'effects', name: 'Gradient', wrap: (t) => `~gradient from=red to=blue~${t}~/gradient~` },
    ],
    markdown: [
        { category: 'markdown', name: 'Bold', wrap: (t) => `**${t}**` },
        { category: 'markdown', name: 'Italic', wrap: (t) => `*${t}*` },
        { category: 'markdown', name: 'Underline', wrap: (t) => `__${t}__` },
        { category: 'markdown', name: 'Strike', wrap: (t) => `~~${t}~~` },
        { category: 'markdown', name: 'Code', wrap: (t) => "`" + t + "`" },
    ],
};
const CATEGORY_MAP = {
    'Colors': 'colors',
    'Effects': 'effects',
    'Markdown': 'markdown',
};
const CATEGORIES = ['Colors', 'Effects', 'Markdown'];
class FormatPicker {
    constructor(screen) {
        this.screen = screen;
        this.picker = new blessed_1.CategoryPicker({
            parent: screen,
            title: 'Format',
            width: 45,
            height: 10,
            categories: CATEGORIES,
            categoryWidth: 14,
            debounceMs: 80,
            borderColor: 'yellow',
            categoryStyle: {
                fg: 'white',
                bg: 'black',
                selected: { fg: 'black', bg: 'green' },
            },
            itemStyle: {
                fg: 'white',
                bg: 'black',
                selected: { fg: 'black', bg: 'yellow' },
            },
            getItems: (category) => {
                const formatCategory = CATEGORY_MAP[category] || 'colors';
                const formats = FORMATS[formatCategory];
                return formats.map(f => ({
                    id: f.name.toLowerCase(),
                    label: f.name,
                    format: f, // Store the full format object
                }));
            },
            renderItem: (item) => ` ${item.label}`,
        });
    }
    show(screen, onSelect, onCancel, position) {
        this.picker.onSelect((item, category) => {
            if (item.format) {
                onSelect(item.format);
            }
        });
        this.picker.onCancel(onCancel);
        this.picker.display(position);
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
exports.FormatPicker = FormatPicker;
function getAllFormats() {
    return [...FORMATS.colors, ...FORMATS.effects, ...FORMATS.markdown];
}
function getFormatsByCategory(category) {
    return FORMATS[category] || [];
}
