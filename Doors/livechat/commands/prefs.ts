import type { SlashCommand } from './types';

/** /sounds - Toggle sound notifications */
export const soundsCmd: SlashCommand = {
  name: 'sounds',
  description: 'Toggle sound notifications',
  usage: '/sounds [on|off]',
  handler: (ctx, args) => {
    const option = args[0]?.toLowerCase();
    if (option === 'on') {
      return { handled: true, message: 'Sounds enabled', data: { notificationSound: true } };
    }
    if (option === 'off') {
      return { handled: true, message: 'Sounds disabled', data: { notificationSound: false } };
    }
    return { handled: true, message: 'Usage: /sounds on|off' };
  }
};

/** /compact - Toggle compact mode */
export const compactCmd: SlashCommand = {
  name: 'compact',
  description: 'Toggle compact mode',
  usage: '/compact',
  handler: () => {
    return { handled: true, message: 'Compact mode toggled', data: { toggle: 'compactMode' } };
  }
};

/** /timestamps - Toggle timestamps */
export const timestampsCmd: SlashCommand = {
  name: 'timestamps',
  description: 'Toggle timestamps',
  usage: '/timestamps',
  aliases: ['time'],
  handler: () => {
    return { handled: true, message: 'Timestamps toggled', data: { toggle: 'showTimestamps' } };
  }
};
