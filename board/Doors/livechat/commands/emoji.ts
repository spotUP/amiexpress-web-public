/**
 * Emoji Commands
 * /emoji, /emojis, /customemoji
 */

import type { SlashCommand } from './types';
import { searchEmojis, getEmojisByCategory, getCustomEmojis, EMOJIS } from '../utils/emojis';
const SYSOP_LEVEL = 255; // the backend's socket-guard SYSOP_LEVEL; it enforces the same check
import { insertEmojiIntoInput, type EmojiPicker } from '../ui/emoji-picker';
import { T } from '../door-theme';

/**
 * /emoji [search] - Open emoji picker or search emojis
 */
export function createEmojiCommand(
  screen: any,
  emojiPicker: EmojiPicker,
  inputBox: any,
  addSystemMessage: (msg: string) => void
): SlashCommand {
  return {
    name: 'emoji',
    description: 'Open emoji picker or search emojis',
    usage: '/emoji [search]',
    handler: (ctx, args) => {
      const searchQuery = args.join(' ');

      if (searchQuery) {
        // Search mode
        const results = searchEmojis(searchQuery);
        if (results.length === 0) {
          addSystemMessage(`No emojis found for "${searchQuery}"`);
        } else {
          addSystemMessage(`{${T.accent}-fg}Emojis matching "${searchQuery}":{/${T.accent}-fg}`);
          results.slice(0, 10).forEach(e => {
            addSystemMessage(`  ${e.display}  ${e.code} (${e.keywords.join(', ')})`);
          });
          if (results.length > 10) {
            addSystemMessage(`  ... and ${results.length - 10} more`);
          }
        }
      } else {
        // Open picker
        if (!emojiPicker.isVisible()) {
          emojiPicker.show(
            screen,
            (emoji) => insertEmojiIntoInput(inputBox, screen, emoji),
            () => {
              inputBox.focus();
              screen.render();
            }
          );
        }
      }

      return { handled: true };
    },
  };
}

/**
 * /emojis [category] - List all emojis or emojis in a category
 */
export function createEmojiListCommand(addSystemMessage: (msg: string) => void): SlashCommand {
  return {
    name: 'emojis',
    description: 'List all emojis or emojis in a category',
    usage: '/emojis [category]',
    handler: (ctx, args) => {
      const categoryName = args[0]?.toLowerCase();

      if (!categoryName) {
        // List all categories
        addSystemMessage(`{${T.accent}-fg}Emoji Categories:{/${T.accent}-fg}`);
        addSystemMessage('  emotions - Smileys and emotions');
        addSystemMessage('  actions - Kaomoji actions');
        addSystemMessage('  symbols - Common symbols');
        addSystemMessage('  special - BBS-themed emojis');
        addSystemMessage('');
        addSystemMessage('Use /emojis <category> to list emojis in a category');
        addSystemMessage('Use /emoji to open emoji picker');
      } else {
        // List category
        const categoryMap: Record<string, any> = {
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
        } else {
          const emojis = getEmojisByCategory(category);
          addSystemMessage(`{${T.accent}-fg}${category.charAt(0).toUpperCase() + category.slice(1)} Emojis:{/${T.accent}-fg}`);
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
export function createCustomEmojiCommand(addSystemMessage: (msg: string) => void): SlashCommand {
  const usage = '/customemoji add <name> <display> <ascii> | remove <name> | list';
  return {
    name: 'customemoji',
    description: 'Add, remove or list the board\'s custom emoji (sysop adds)',
    usage,
    handler: (ctx, args) => {
      const sub = (args[0] || 'list').toLowerCase();
      if (sub === 'list') {
        const custom = getCustomEmojis();
        if (custom.length === 0) addSystemMessage('No custom emoji yet.');
        for (const c of custom) addSystemMessage(`  ${c.name}  web ${c.display}  telnet ${c.ascii}`);
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
        if (!name) addSystemMessage('Usage: /customemoji remove <name>');
        else return { handled: true, action: 'customemoji', data: { event: 'chat:emoji:remove', payload: { name } } };
        return { handled: true };
      }
      const [display, ascii] = [args[2], args[3]];
      if (!name || !display || !ascii) {
        addSystemMessage('Usage: /customemoji add <name> <display> <ascii>');
      } else if (EMOJIS.some(e => e.code === `:${name}:`)) {
        addSystemMessage(`:${name}: is a built-in emoji.`);
      } else {
        return { handled: true, action: 'customemoji', data: { event: 'chat:emoji:add', payload: { name, display, ascii } } };
      }
      return { handled: true };
    },
  };
}
