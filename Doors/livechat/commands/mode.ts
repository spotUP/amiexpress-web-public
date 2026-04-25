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
