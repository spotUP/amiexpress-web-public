import type { SlashCommand } from './types';

/** /create - Create a new channel */
/**
 * The kinds of room the chat hub stores (contract/chat-types.ts CHAT_ROOM_KINDS
 * in amiexpress-doorserver). /create asks for one when --type is not given.
 */
export const ROOM_KINDS = ['text', 'voice', 'art'] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];
export const ROOM_KIND_LABELS: Record<RoomKind, string> = { text: 'Text', voice: 'Voice', art: 'Art' };
export const isRoomKind = (v: unknown): v is RoomKind => (ROOM_KINDS as readonly unknown[]).includes(v);

const CREATE_USAGE = '/create #name [topic] [--type text|voice|art] [--private] [--invite-only] [--motd "text"]';

export const createCmd: SlashCommand = {
  name: 'create',
  description: 'Create a new channel. Asks for its type (text, voice or art) unless --type names it. --private and --invite-only make it members-only.',
  usage: CREATE_USAGE,
  handler: (_ctx, args) => {
    if (!args[0]) return { handled: true, error: 'Usage: ' + CREATE_USAGE };
    const flags: { isPrivate?: boolean; isInviteOnly?: boolean; motd?: string; kind?: RoomKind } = {};
    const name = args[0].replace(/^#/, '');
    const rest: string[] = [];
    for (let i = 1; i < args.length; i++) {
      const a = args[i];
      if (a === '--private') flags.isPrivate = true;
      else if (a === '--invite-only') flags.isInviteOnly = true;
      else if (a === '--type') {
        const k = (args[++i] ?? '').toLowerCase();
        if (!isRoomKind(k)) return { handled: true, error: 'Channel type must be text, voice or art.' };
        flags.kind = k;
      }
      else if (a === '--motd') {
        const parts: string[] = [];
        while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          parts.push(args[++i]);
        }
        flags.motd = parts.join(' ').replace(/^["']|["']$/g, '');
      }
      else rest.push(a);
    }
    const topic = rest.join(' ');
    return { handled: true, message: flags.kind ? `Creating #${name}...` : undefined, data: { name, topic, ...flags } };
  },
};

/** /delete - Delete a channel */
export const deleteCmd: SlashCommand = {
  name: 'delete',
  description: 'Delete a channel',
  usage: '/delete #channel',
  handler: (ctx, args) => {
    const name = args[0]?.replace('#', '');
    if (!name) return { handled: true, error: 'Usage: /delete #channel' };
    // Same event the Delete Channel context-menu item emits; the backend checks operator / sysop.
    return { handled: true, action: 'roomadmin', data: { event: 'admin:delete-channel', payload: { channel: name } } };
  }
};
