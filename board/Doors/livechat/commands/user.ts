import type { SlashCommand } from './types';

/** /who - List users in channel */
export const whoCmd: SlashCommand = {
  name: 'who',
  description: 'List users in channel',
  usage: '/who',
  aliases: ['users', 'list'],
  handler: (ctx) => {
    return { handled: true, data: { type: 'list_users', channel: ctx.currentChannel } };
  }
};

/** /whois - Show user info */
export const whoisCmd: SlashCommand = {
  name: 'whois',
  description: 'Show user info',
  usage: '/whois @user',
  aliases: ['info'],
  handler: (ctx, args) => {
    const username = args[0]?.replace('@', '');
    if (!username) return { handled: true, error: 'Usage: /whois @user' };
    return { handled: true, data: { type: 'whois', username } };
  }
};

/** /away - Set away status */
export const awayCmd: SlashCommand = {
  name: 'away',
  description: 'Set away status',
  usage: '/away [message]',
  aliases: ['afk'],
  handler: (ctx, args) => {
    const message = args.join(' ') || 'Away';
    return { handled: true, message: `You are now away: ${message}`, data: { status: 'away', message } };
  }
};

/** /back - Return from away */
export const backCmd: SlashCommand = {
  name: 'back',
  description: 'Return from away',
  usage: '/back',
  handler: () => {
    return { handled: true, message: 'You are now online', data: { status: 'online' } };
  }
};

/** /status - Set custom status */
export const statusCmd: SlashCommand = {
  name: 'status',
  description: 'Set custom status',
  usage: '/status [online|away|busy|dnd] [message]',
  handler: (ctx, args) => {
    const word = (args[0] || 'online').toLowerCase();
    if (!['online', 'away', 'busy', 'dnd'].includes(word)) {
      return { handled: true, error: 'Usage: /status [online|away|busy|dnd] [message]' };
    }
    const status = word;
    const message = args.slice(1).join(' ');
    return { handled: true, action: 'pref', data: { kind: 'status', status, message } };
  }
};

/** /nick - Show current username */
export const nickCmd: SlashCommand = {
  name: 'nick',
  description: 'Show your username',
  usage: '/nick',
  handler: (ctx) => {
    return { handled: true, message: `Your username: ${ctx.username}` };
  }
};
