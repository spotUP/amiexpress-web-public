import type { SlashCommand } from './types';

/** /quit - Exit chat */
export const quitCmd: SlashCommand = {
  name: 'quit',
  description: 'Exit chat',
  usage: '/quit',
  aliases: ['exit', 'bye', 'q'],
  handler: () => {
    return { handled: true, action: 'quit', message: 'Goodbye!' };
  }
};

/** /clear - Clear chat display */
export const clearCmd: SlashCommand = {
  name: 'clear',
  description: 'Clear chat display',
  usage: '/clear',
  aliases: ['cls'],
  handler: () => {
    return { handled: true, data: { type: 'clear' } };
  }
};

/** /search - Search messages */
export const searchCmd: SlashCommand = {
  name: 'search',
  description: 'Search messages',
  usage: '/search query',
  aliases: ['find'],
  handler: (ctx, args) => {
    const query = args.join(' ');
    if (!query) return { handled: true, error: 'Usage: /search query' };
    return { handled: true, data: { type: 'search', query } };
  }
};
