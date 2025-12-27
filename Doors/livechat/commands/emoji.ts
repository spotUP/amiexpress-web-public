/**
 * Emoji Commands
 * /emoji, /emojis, /customemoji
 */

import type { SlashCommand } from './types';
import { searchEmojis, getEmojisByCategory } from '../utils/emojis';
import type { EmojiPicker } from '../ui/emoji-picker';

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
          addSystemMessage(`{cyan-fg}Emojis matching "${searchQuery}":{/cyan-fg}`);
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
            (emoji) => {
              const current = inputBox.getValue();
              inputBox.setValue(current + emoji.code + ' ');
              inputBox.focus();
              screen.render();
            },
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
        addSystemMessage('{cyan-fg}Emoji Categories:{/cyan-fg}');
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
          addSystemMessage(`{cyan-fg}${category.charAt(0).toUpperCase() + category.slice(1)} Emojis:{/cyan-fg}`);
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
 * /customemoji - Manage custom emojis (placeholder)
 */
export function createCustomEmojiCommand(addSystemMessage: (msg: string) => void): SlashCommand {
  return {
    name: 'customemoji',
    description: 'Manage custom emojis (coming soon)',
    usage: '/customemoji add|remove|list',
    handler: (ctx, args) => {
      addSystemMessage('Custom emojis feature coming soon!');
      addSystemMessage('');
      addSystemMessage('Planned features:');
      addSystemMessage('  /customemoji add :myface: (^_^) - Add custom emoji');
      addSystemMessage('  /customemoji remove :myface: - Remove custom emoji');
      addSystemMessage('  /customemoji list - List your custom emojis');

      return { handled: true };
    },
  };
}
