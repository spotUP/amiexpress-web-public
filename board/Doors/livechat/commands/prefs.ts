import type { SlashCommand } from './types';

/** /sounds - Toggle sound notifications */
export const soundsCmd: SlashCommand = {
  name: 'sounds',
  description: 'Toggle sound notifications',
  usage: '/sounds [on|off]',
  handler: (ctx, args) => {
    const option = args[0]?.toLowerCase();
    if (option === 'on') {
      return { handled: true, action: 'pref', data: { kind: 'sounds', value: true } };
    }
    if (option === 'off') {
      return { handled: true, action: 'pref', data: { kind: 'sounds', value: false } };
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
    return { handled: true, action: 'pref', data: { kind: 'compact' } };
  }
};

/** /timestamps - Toggle timestamps */
export const timestampsCmd: SlashCommand = {
  name: 'timestamps',
  description: 'Toggle timestamps',
  usage: '/timestamps',
  aliases: ['time'],
  handler: () => {
    return { handled: true, action: 'pref', data: { kind: 'timestamps' } };
  }
};
