import type { SlashCommand } from './types';

/** /ban - Ban user from channel */
export const banCmd: SlashCommand = {
  name: 'ban',
  description: 'Ban user from channel',
  usage: '/ban @user [reason]',
  minSecLevel: 100,
  handler: (ctx, args) => {
    const target = args[0]?.replace('@', '');
    const reason = args.slice(1).join(' ') || 'No reason given';
    if (!target) return { handled: true, error: 'Usage: /ban @user [reason]' };
    return { handled: true, action: 'ban', data: { target, reason } };
  }
};

/** /unban - Unban user */
export const unbanCmd: SlashCommand = {
  name: 'unban',
  description: 'Unban user from channel',
  usage: '/unban @user',
  minSecLevel: 100,
  handler: (ctx, args) => {
    const target = args[0]?.replace('@', '');
    if (!target) return { handled: true, error: 'Usage: /unban @user' };
    return { handled: true, action: 'unban', data: { target } };
  }
};

/** /op - Give operator status (sysop only; the backend checks too) */
export const opCmd: SlashCommand = {
  name: 'op',
  description: 'Give or take room operator status (sysop)',
  usage: '/op @user  |  /op -@user  |  /deop @user',
  minSecLevel: 255,
  aliases: ['deop'],
  handler: (ctx, args) => {
    const raw = args[0] ?? '';
    const revoke = ctx.invokedAs === 'deop' || raw.startsWith('-');
    const target = raw.replace(/^-/, '').replace('@', '');
    if (!target) return { handled: true, error: 'Usage: /op @user  |  /op -@user  |  /deop @user' };
    return { handled: true, action: 'roomadmin', data: { event: 'room:op', payload: { username: target, op: !revoke } } };
  }
};
