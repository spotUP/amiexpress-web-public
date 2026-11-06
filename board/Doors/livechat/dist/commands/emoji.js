"use strict";
/**
 * Emoji Commands
 * /emoji, /emojis, /customemoji
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmojiCommand = createEmojiCommand;
exports.createEmojiListCommand = createEmojiListCommand;
exports.createCustomEmojiCommand = createCustomEmojiCommand;
const emojis_1 = require("../utils/emojis");
const SYSOP_LEVEL = 255; // the backend's socket-guard SYSOP_LEVEL; it enforces the same check
const emoji_picker_1 = require("../ui/emoji-picker");
const door_theme_1 = require("../door-theme");
/**
 * /emoji [search] - Open emoji picker or search emojis
 */
function createEmojiCommand(screen, emojiPicker, inputBox, addSystemMessage) {
    return {
        name: 'emoji',
        description: 'Open emoji picker or search emojis',
        usage: '/emoji [search]',
        handler: (ctx, args) => {
            const searchQuery = args.join(' ');
            if (searchQuery) {
                // Search mode
                const results = (0, emojis_1.searchEmojis)(searchQuery);
                if (results.length === 0) {
                    addSystemMessage(`No emojis found for "${searchQuery}"`);
                }
                else {
                    addSystemMessage(`{${door_theme_1.T.accent}-fg}Emojis matching "${searchQuery}":{/${door_theme_1.T.accent}-fg}`);
                    results.slice(0, 10).forEach(e => {
                        addSystemMessage(`  ${e.display}  ${e.code} (${e.keywords.join(', ')})`);
                    });
                    if (results.length > 10) {
                        addSystemMessage(`  ... and ${results.length - 10} more`);
                    }
                }
            }
            else {
                // Open picker
                if (!emojiPicker.isVisible()) {
                    emojiPicker.show(screen, (emoji) => (0, emoji_picker_1.insertEmojiIntoInput)(inputBox, screen, emoji), () => {
                        inputBox.focus();
                        screen.render();
                    });
                }
            }
            return { handled: true };
        },
    };
}
/**
 * /emojis [category] - List all emojis or emojis in a category
 */
function createEmojiListCommand(addSystemMessage) {
    return {
        name: 'emojis',
        description: 'List all emojis or emojis in a category',
        usage: '/emojis [category]',
        handler: (ctx, args) => {
            const categoryName = args[0]?.toLowerCase();
            if (!categoryName) {
                // List all categories
                addSystemMessage(`{${door_theme_1.T.accent}-fg}Emoji Categories:{/${door_theme_1.T.accent}-fg}`);
                addSystemMessage('  emotions - Smileys and emotions');
                addSystemMessage('  actions - Kaomoji actions');
                addSystemMessage('  symbols - Common symbols');
                addSystemMessage('  special - BBS-themed emojis');
                addSystemMessage('');
                addSystemMessage('Use /emojis <category> to list emojis in a category');
                addSystemMessage('Use /emoji to open emoji picker');
            }
            else {
                // List category
                const categoryMap = {
                    'emotions': 'emotions',
                    'emotion': 'emotions',
                    'actions': 'actions',
                    'action': 'actions',
                    'symbols': 'symbols',
                    'symbol': 'symbols',
                    'special': 'special',
                };
                const category = categoryMap[categoryName];
                if (!category) {
                    addSystemMessage(`Unknown category "${categoryName}". Use /emojis to see all categories.`);
                }
                else {
                    const emojis = (0, emojis_1.getEmojisByCategory)(category);
                    addSystemMessage(`{${door_theme_1.T.accent}-fg}${category.charAt(0).toUpperCase() + category.slice(1)} Emojis:{/${door_theme_1.T.accent}-fg}`);
                    emojis.forEach(e => {
                        addSystemMessage(`  ${e.display}  ${e.code} (${e.keywords.join(', ')})`);
                    });
                }
            }
            return { handled: true };
        },
    };
}
/**
 * /customemoji add <name> <display> <ascii> | remove <name> | list
 * Board-wide emoji the sysop adds. Inserted as :name: like any other; a web
 * caller sees <display>, a telnet or SSH caller sees <ascii>. The backend
 * stores them and refuses a non-sysop add/remove; the list returns as
 * chat:emoji-list and feeds the one lookup in utils/emojis.
 */
function createCustomEmojiCommand(addSystemMessage) {
    const usage = '/customemoji add <name> <display> <ascii> | remove <name> | list';
    return {
        name: 'customemoji',
        description: 'Add, remove or list the board\'s custom emoji (sysop adds)',
        usage,
        handler: (ctx, args) => {
            const sub = (args[0] || 'list').toLowerCase();
            if (sub === 'list') {
                const custom = (0, emojis_1.getCustomEmojis)();
                if (custom.length === 0)
                    addSystemMessage('No custom emoji yet.');
                for (const c of custom)
                    addSystemMessage(`  ${c.name}  web ${c.display}  telnet ${c.ascii}`);
                return { handled: true };
            }
            if (sub !== 'add' && sub !== 'remove') {
                addSystemMessage(`Usage: ${usage}`);
                return { handled: true };
            }
            if (ctx.secLevel < SYSOP_LEVEL) {
                addSystemMessage('Only the sysop can add or remove custom emoji.');
                return { handled: true };
            }
            const name = (args[1] || '').replace(/^:|:$/g, '').toLowerCase();
            if (sub === 'remove') {
                if (!name)
                    addSystemMessage('Usage: /customemoji remove <name>');
                else
                    return { handled: true, action: 'customemoji', data: { event: 'chat:emoji:remove', payload: { name } } };
                return { handled: true };
            }
            const [display, ascii] = [args[2], args[3]];
            if (!name || !display || !ascii) {
                addSystemMessage('Usage: /customemoji add <name> <display> <ascii>');
            }
            else if (emojis_1.EMOJIS.some(e => e.code === `:${name}:`)) {
                addSystemMessage(`:${name}: is a built-in emoji.`);
            }
            else {
                return { handled: true, action: 'customemoji', data: { event: 'chat:emoji:add', payload: { name, display, ascii } } };
            }
            return { handled: true };
        },
    };
}
