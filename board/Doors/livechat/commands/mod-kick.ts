import type { SlashCommand } from './types';

/** /kick - Kick user from channel */
export const kickCmd: SlashCommand = {
  name: 'kick',
  description: 'Kick user from channel',
  usage: '/kick @user [reason]',
  minSecLevel: 80,
  handler: (ctx, args) => {
    const target = args[0]?.replace('@', '');
    const reason = args.slice(1).join(' ') || 'No reason given';
    if (!target) return { handled: true, error: 'Usage: /kick @user [reason]' };
    return { handled: true, action: 'kick', data: { target, reason } };
  }
};

/** /mute - Mute user in channel */
export const muteCmd: SlashCommand = {
  name: 'mute',
  description: 'Mute user in channel',
  usage: '/mute @user [minutes]',
  minSecLevel: 80,
  handler: (ctx, args) => {
    const target = args[0]?.replace('@', '');
    const minutes = parseInt(args[1] || '5', 10);
    if (!target) return { handled: true, error: 'Usage: /mute @user [minutes]' };
    return { handled: true, action: 'mute', data: { target, duration: minutes * 60 } };
  }
};

/** /unmute - Unmute user */
export const unmuteCmd: SlashCommand = {
  name: 'unmute',
  description: 'Unmute user in channel',
  usage: '/unmute @user',
  minSecLevel: 80,
  handler: (ctx, args) => {
    const target = args[0]?.replace('@', '');
    if (!target) return { handled: true, error: 'Usage: /unmute @user' };
    return { handled: true, action: 'unmute', data: { target } };
  }
};
