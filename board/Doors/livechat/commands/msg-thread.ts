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
  usage: '/thread <msg-id> message',
  aliases: ['t'],
  handler: (ctx, args) => {
    if (args.length < 2) return { handled: true, error: 'Usage: /thread <msg-id> message' };
    const messageId = args[0];
    const message = args.slice(1).join(' ');
    return { handled: true, action: 'thread', data: { messageId, message } };
  }
};

/**
 * /edit [id] new text - edit one of your own messages. Without an id it is
 * your last message; the id is a stored message id, so it is all digits.
 */
export const editCmd: SlashCommand = {
  name: 'edit',
  description: 'Edit one of your messages (your last by default)',
  usage: '/edit [msg-id] new text',
  handler: (ctx, args) => {
    const hasId = args.length >= 2 && /^\d+$/.test(args[0]);
    const text = (hasId ? args.slice(1) : args).join(' ');
    if (!text) return { handled: true, error: 'Usage: /edit [msg-id] new text' };
    return { handled: true, action: 'edit', data: { messageId: hasId ? args[0] : undefined, text } };
  }
};

/** /deletemsg [id] - delete a message (yours; any message for a room operator or the sysop). /delete is the channel command. */
export const deleteMessageCmd: SlashCommand = {
  name: 'deletemsg',
  description: 'Delete a message (your last by default)',
  usage: '/deletemsg [msg-id]',
  aliases: ['delmsg'],
  handler: (ctx, args) => {
    const id = args[0];
    if (id && !/^\d+$/.test(id)) return { handled: true, error: 'Usage: /deletemsg [msg-id]' };
    return { handled: true, action: 'deletemsg', data: { messageId: id } };
  }
};
