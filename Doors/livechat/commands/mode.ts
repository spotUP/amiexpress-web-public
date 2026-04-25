import type { SlashCommand } from './types';

/** /motd [text] - Set or view channel MOTD */
export const motdCmd: SlashCommand = {
  name: 'motd',
  description: 'Set channel MOTD (moderator only; --clear to clear; no args = show current)',
  usage: '/motd [text]  (use /motd --clear to clear)',
  handler: (_ctx, args) => {
    if (args.length === 0) return { handled: true, data: { op: 'show' } };
    if (args[0] === '--clear') return { handled: true, data: { op: 'set', motd: null } };
    return { handled: true, data: { op: 'set', motd: args.join(' ') } };
  },
};

/** /invite @user [#room] - Invite a user to an invite-only channel (moderator only) */
export const inviteCmd: SlashCommand = {
  name: 'invite',
  description: 'Invite a user to this invite-only channel (moderator only)',
  usage: '/invite @user [#room]',
  handler: (ctx, args) => {
    const rawUser = args[0];
    if (!rawUser) return { handled: true, error: 'Usage: /invite @user [#room]' };
    const target = rawUser.replace('@', '');
    const roomArg = args[1]?.replace('#', '');
    return { handled: true, data: { op: 'invite', target, room: roomArg || ctx.currentChannel } };
  },
};

/** /uninvite @user [#room] - Revoke a pending invite */
export const uninviteCmd: SlashCommand = {
  name: 'uninvite',
  description: 'Revoke a pending invite',
  usage: '/uninvite @user [#room]',
  handler: (ctx, args) => {
    const rawUser = args[0];
    if (!rawUser) return { handled: true, error: 'Usage: /uninvite @user [#room]' };
    const target = rawUser.replace('@', '');
    const roomArg = args[1]?.replace('#', '');
    return { handled: true, data: { op: 'uninvite', target, room: roomArg || ctx.currentChannel } };
  },
};
