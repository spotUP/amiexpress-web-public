import type { SlashCommand } from './types';

/** /reply - Reply to last message */
export const replyCmd: SlashCommand = {
  name: 'reply',
  description: 'Reply to last message',
  usage: '/reply message',
  aliases: ['r'],
  handler: (ctx, args) => {
    const message = args.join(' ');
    if (!message) return { handled: true, error: 'Usage: /reply message' };
    return { handled: true, data: { message, type: 'reply' } };
  }
};

/** /thread - Start a thread on a message */
export const threadCmd: SlashCommand = {
  name: 'thread',
  description: 'Reply in thread',
  usage: '/thread [msg-id] message',
  aliases: ['t'],
  handler: (ctx, args) => {
    const message = args.join(' ');
    if (!message) return { handled: true, error: 'Usage: /thread message' };
    return { handled: true, data: { message, type: 'thread' } };
  }
};

/** /edit - Edit last message */
export const editCmd: SlashCommand = {
  name: 'edit',
  description: 'Edit your last message',
  usage: '/edit new text',
  handler: (ctx, args) => {
    const text = args.join(' ');
    if (!text) return { handled: true, error: 'Usage: /edit new text' };
    return { handled: true, data: { text, type: 'edit' } };
  }
};
