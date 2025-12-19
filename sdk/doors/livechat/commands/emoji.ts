import type { Command } from './types';
import type { AppState } from '../core/state';
import type { EmojiPicker } from '../ui/emoji-picker';
import { EMOJI_REGISTRY, EMOJI_CATEGORIES, getEmojisByCategory, searchEmojis, formatEmojiDisplay } from '../utils/emojis';
import type { Widgets } from 'neo-blessed';

/** /emoji - Show emoji picker */
export function createEmojiCommand(
  screen: Widgets.Screen,
  emojiPicker: EmojiPicker,
  inputBox: Widgets.TextboxElement
): Command {
  return {
    name: 'emoji',
    aliases: ['emojis', 'e'],
    description: 'Show emoji picker or list emojis',
    usage: '/emoji [search] - Open picker or search emojis',
    minSecLevel: 0,
    handler: async (ctx, args) => {
      if (args.length === 0) {
        // Show picker
        emojiPicker.show(
          screen,
          (emoji) => {
            // Insert emoji code into input
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
      } else {
        // Search and display results
        const query = args.join(' ');
        const results = searchEmojis(query);

        if (results.length === 0) {
          return ctx.ui.systemMessage(`No emojis found for "${query}"`, 'error');
        }

        ctx.ui.systemMessage(`{cyan-fg}=== Emojis matching "${query}" ==={/}`);
        for (const emoji of results.slice(0, 10)) {
          ctx.ui.systemMessage(`  ${formatEmojiDisplay(emoji)} {gray-fg}[${emoji.category}]{/}`);
        }

        if (results.length > 10) {
          ctx.ui.systemMessage(`{gray-fg}... and ${results.length - 10} more{/}`);
        }
      }
    }
  };
}

/** /emojis list [category] - List all emojis by category */
export const emojiListCmd: Command = {
  name: 'emojis',
  aliases: ['emojilist'],
  description: 'List all available emojis',
  usage: '/emojis [category] - List emojis by category (emotions, actions, symbols, special)',
  minSecLevel: 0,
  handler: async (ctx, args) => {
    if (args.length > 0 && args[0] !== 'list') {
      const category = args[0].toLowerCase();
      if (!EMOJI_CATEGORIES.includes(category)) {
        return ctx.ui.systemMessage(
          `Unknown category "${category}". Valid: ${EMOJI_CATEGORIES.join(', ')}`,
          'error'
        );
      }

      const emojis = getEmojisByCategory(category);
      ctx.ui.systemMessage(`{cyan-fg}=== ${category.charAt(0).toUpperCase() + category.slice(1)} Emojis ==={/}`);
      for (const emoji of emojis) {
        ctx.ui.systemMessage(`  ${formatEmojiDisplay(emoji)}`);
      }
    } else {
      // List all categories with counts
      ctx.ui.systemMessage('{cyan-fg}=== Emoji Categories ==={/}');
      for (const category of EMOJI_CATEGORIES) {
        const count = getEmojisByCategory(category).length;
        ctx.ui.systemMessage(
          `  {bold}${category.charAt(0).toUpperCase() + category.slice(1)}{/bold} - ${count} emojis`
        );
      }
      ctx.ui.systemMessage('{gray-fg}Use /emojis <category> to list emojis{/}');
      ctx.ui.systemMessage('{gray-fg}Use /emoji to open the emoji picker{/}');
    }
  }
};

/** /customemoji add - Add custom emoji */
export const customEmojiCmd: Command = {
  name: 'customemoji',
  aliases: ['addemoji'],
  description: 'Add a custom emoji (coming soon)',
  usage: '/customemoji <code> <ascii> - Add custom emoji',
  minSecLevel: 0,
  handler: async (ctx, args) => {
    // TODO: Implement custom emoji storage per-user or per-channel
    ctx.ui.systemMessage('{yellow-fg}Custom emojis coming soon!{/}');
    ctx.ui.systemMessage('For now, use the built-in emojis with /emoji');
  }
};
