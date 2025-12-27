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
    return { handled: true, message: `Kicked ${target}: ${reason}`, data: { target, reason } };
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
    return { handled: true, message: `Muted ${target} for ${minutes} min`, data: { target, minutes } };
  }
};
