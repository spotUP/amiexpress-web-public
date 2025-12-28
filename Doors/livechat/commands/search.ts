import type { SlashCommand } from './types';

/** /search - Open search overlay */
export const searchCmd: SlashCommand = {
  name: 'search',
  description: 'Search messages',
  usage: '/search [query]',
  aliases: ['find'],
  handler: (ctx, args) => {
    const query = args.join(' ');
    return {
      handled: true,
      action: 'search',
      data: { query }
    };
  }
};
