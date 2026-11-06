import type { SlashCommand } from './types';

/**
 * Commands whose effect lives in the door's own UI or state, not on the
 * server. Each handler only names what to do (`data.type`); the single
 * consumer is handlers/input-submit-handler.ts, which owns the screen, the
 * channel list and the mute list. Registered here so they appear in /help,
 * the command palette and autocomplete like every other command.
 */

const cleanName = (raw: string | undefined): string => (raw ?? '').replace(/^@/, '').trim();

/** /rooms - list the channels the sidebar shows */
export const roomsCmd: SlashCommand = {
  name: 'rooms',
  description: 'List all rooms',
  usage: '/rooms',
  aliases: ['channels'],
  handler: () => ({ handled: true, data: { type: 'rooms' } }),
};

/** /ignore - hide a user's room messages and DMs; bare /ignore lists them */
export const ignoreCmd: SlashCommand = {
  name: 'ignore',
  description: 'Ignore a user (no name: list who you ignore)',
  usage: '/ignore [user]',
  handler: (_ctx, args) => ({ handled: true, data: { type: 'ignore', user: cleanName(args[0]) } }),
};

/** /unignore - lift an ignore */
export const unignoreCmd: SlashCommand = {
  name: 'unignore',
  description: 'Stop ignoring a user',
  usage: '/unignore <user>',
  handler: (_ctx, args) => {
    const user = cleanName(args[0]);
    if (!user) return { handled: true, error: 'Usage: /unignore <user>' };
    return { handled: true, data: { type: 'unignore', user } };
  },
};

/** /draw - open the drawing menu, or join a drawing channel */
export const drawCmd: SlashCommand = {
  name: 'draw',
  description: 'Open the drawing whiteboard (or join art:<name>)',
  usage: '/draw [channel]',
  aliases: ['whiteboard', 'art'],
  handler: (_ctx, args) => ({ handled: true, data: { type: 'draw', channel: args[0] ?? '' } }),
};

/** /files - open the file sharing browser */
export const filesCmd: SlashCommand = {
  name: 'files',
  description: 'Open the file sharing browser',
  usage: '/files',
  aliases: ['file', 'share'],
  handler: () => ({ handled: true, data: { type: 'files' } }),
};

/** /settings - open the settings overlay */
export const settingsCmd: SlashCommand = {
  name: 'settings',
  description: 'Open the settings',
  usage: '/settings',
  handler: () => ({ handled: true, data: { type: 'settings' } }),
};
