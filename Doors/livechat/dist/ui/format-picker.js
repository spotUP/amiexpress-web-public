"use strict";
/**
 * Format Picker Dialog - uses SDK CategoryPicker widget
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FormatPicker = void 0;
exports.getAllFormats = getAllFormats;
exports.getFormatsByCategory = getFormatsByCategory;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const theme_1 = require("./theme");
const door_theme_1 = require("../door-theme");
// Available formats grouped by category
const FORMATS = {
    colors: [
        { category: 'colors', name: 'Red', wrap: (t) => `{${door_theme_1.T.alert}-fg}${t}{/}` },
        { category: 'colors', name: 'Green', wrap: (t) => `{${door_theme_1.T.ok}-fg}${t}{/}` },
        { category: 'colors', name: 'Blue', wrap: (t) => `{${door_theme_1.T.bar}-fg}${t}{/}` },
        { category: 'colors', name: 'Yellow', wrap: (t) => `{${door_theme_1.T.accentAlt}-fg}${t}{/}` },
        { category: 'colors', name: 'Cyan', wrap: (t) => `{${door_theme_1.T.accent}-fg}${t}{/}` },
        { category: 'colors', name: 'Magenta', wrap: (t) => `{${door_theme_1.T.accentAlt}-fg}${t}{/}` },
        { category: 'colors', name: 'White', wrap: (t) => `{${door_theme_1.T.ink}-fg}${t}{/}` },
        { category: 'colors', name: 'Gray', wrap: (t) => `{${door_theme_1.T.dim}-fg}${t}{/}` },
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
            borderColor: theme_1.PANEL_BORDER,
            categoryStyle: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                selected: { fg: door_theme_1.T.ground, bg: door_theme_1.T.ok },
            },
            itemStyle: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                selected: { fg: door_theme_1.T.ground, bg: door_theme_1.T.accentAlt },
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
            renderItem: (item) => {
                const format = item.format;
                if (!format)
                    return ` ${item.label}`;
                // Render item with its own effect/color applied for visual preview
                switch (format.category) {
                    case 'colors':
                        // Show color name in that color (use blessed tags)
                        const colorName = format.name.toLowerCase();
                        return ` {${colorName}-fg}${item.label}{/}`;
                    case 'effects':
                        // Show effect name with visual representation
                        const effectName = format.name.toLowerCase();
                        if (effectName === 'rainbow')
                            return ` {${door_theme_1.T.accentAlt}-fg}{bold}${item.label}{/bold}{/}`;
                        if (effectName === 'pulse')
                            return ` {${door_theme_1.T.accent}-fg}{bold}${item.label}{/bold}{/}`;
                        if (effectName === 'sparkle')
                            return ` {${door_theme_1.T.accentAlt}-fg}{bold}${item.label}{/bold}{/}`;
                        if (effectName === 'shake')
                            return ` {${door_theme_1.T.alert}-fg}{bold}${item.label}{/bold}{/}`;
                        if (effectName === 'wave')
                            return ` {${door_theme_1.T.bar}-fg}{bold}${item.label}{/bold}{/}`;
                        if (effectName === 'gradient')
                            return ` {${door_theme_1.T.accent}-fg}${item.label}{/}`;
                        return ` ${item.label}`;
                    case 'markdown':
                        // Show markdown symbols applied
                        if (format.name === 'Bold')
                            return ` {bold}${item.label}{/bold}`;
                        if (format.name === 'Italic')
                            return ` {underline}${item.label}{/underline}`; // Italic not supported, use underline
                        if (format.name === 'Underline')
                            return ` {underline}${item.label}{/underline}`;
                        if (format.name === 'Strike')
                            return ` {${door_theme_1.T.dim}-fg}${item.label}{/}`;
                        if (format.name === 'Code')
                            return ` {black-bg}{${door_theme_1.T.ink}-fg}${item.label}{/}{/}`;
                        return ` ${item.label}`;
                    default:
                        return ` ${item.label}`;
                }
            },
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
