import type { SlashCommand } from './types';

/** /pin - Pin a message by ID */
export const pinCmd: SlashCommand = {
  name: 'pin',
  description: 'Pin a message',
  usage: '/pin <msg-id>',
  minSecLevel: 80,
  handler: (ctx, args) => {
    if (args.length !== 1) return { handled: true, error: 'Usage: /pin <msg-id>' };
    // Message ids are strings (`${userId}-${Date.now()}` or server ids): never parseInt them.
    const messageId = args[0];
    return { handled: true, action: 'pin', data: { messageId } };
  }
};

/** /unpin - Unpin a message by ID */
export const unpinCmd: SlashCommand = {
  name: 'unpin',
  description: 'Unpin a message',
  usage: '/unpin <msg-id>',
  minSecLevel: 80,
  handler: (ctx, args) => {
    if (args.length !== 1) return { handled: true, error: 'Usage: /unpin <msg-id>' };
    // Message ids are strings (`${userId}-${Date.now()}` or server ids): never parseInt them.
    const messageId = args[0];
    return { handled: true, action: 'unpin', data: { messageId } };
  }
};

/** /pinned - Show all pinned messages */
export const pinnedCmd: SlashCommand = {
  name: 'pinned',
  description: 'Show pinned messages',
  usage: '/pinned',
  aliases: ['pins'],
  handler: (ctx, args) => {
    return { handled: true, action: 'showpinned' };
  }
};
