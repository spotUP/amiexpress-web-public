"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMessageCmd = exports.editCmd = exports.threadCmd = exports.replyCmd = void 0;
/**
 * /reply [msg-id] text - a room line that quotes another. Without an id it
 * answers the newest stored message; the id is a stored id, so all digits.
 */
exports.replyCmd = {
    name: 'reply',
    description: 'Reply to a message (the newest by default)',
    usage: '/reply [msg-id] message',
    aliases: ['r'],
    handler: (ctx, args) => {
        const hasId = args.length >= 2 && /^\d+$/.test(args[0]);
        const message = (hasId ? args.slice(1) : args).join(' ');
        if (!message)
            return { handled: true, error: 'Usage: /reply [msg-id] message' };
        return { handled: true, action: 'reply', data: { messageId: hasId ? args[0] : undefined, message } };
    }
};
/** /thread - Start a thread on a message */
exports.threadCmd = {
    name: 'thread',
    description: 'Reply in thread',
    usage: '/thread <msg-id> message',
    aliases: ['t'],
    handler: (ctx, args) => {
        if (args.length < 2)
            return { handled: true, error: 'Usage: /thread <msg-id> message' };
        const messageId = args[0];
        const message = args.slice(1).join(' ');
        return { handled: true, action: 'reply', data: { messageId, message } };
    }
};
/**
 * /edit [id] new text - edit one of your own messages. Without an id it is
 * your last message; the id is a stored message id, so it is all digits.
 */
exports.editCmd = {
    name: 'edit',
    description: 'Edit one of your messages (your last by default)',
    usage: '/edit [msg-id] new text',
    handler: (ctx, args) => {
        const hasId = args.length >= 2 && /^\d+$/.test(args[0]);
        const text = (hasId ? args.slice(1) : args).join(' ');
        if (!text)
            return { handled: true, error: 'Usage: /edit [msg-id] new text' };
        return { handled: true, action: 'edit', data: { messageId: hasId ? args[0] : undefined, text } };
    }
};
/** /deletemsg [id] - delete a message (yours; any message for a room operator or the sysop). /delete is the channel command. */
exports.deleteMessageCmd = {
    name: 'deletemsg',
    description: 'Delete a message (your last by default)',
    usage: '/deletemsg [msg-id]',
    aliases: ['delmsg'],
    handler: (ctx, args) => {
        const id = args[0];
        if (id && !/^\d+$/.test(id))
            return { handled: true, error: 'Usage: /deletemsg [msg-id]' };
        return { handled: true, action: 'deletemsg', data: { messageId: id } };
    }
};
