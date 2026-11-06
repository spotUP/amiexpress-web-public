"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.editCmd = exports.threadCmd = exports.replyCmd = void 0;
/** /reply - Reply to last message */
exports.replyCmd = {
    name: 'reply',
    description: 'Reply to last message',
    usage: '/reply message',
    aliases: ['r'],
    handler: (ctx, args) => {
        const message = args.join(' ');
        if (!message)
            return { handled: true, error: 'Usage: /reply message' };
        return { handled: true, data: { message, type: 'reply' } };
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
        return { handled: true, action: 'thread', data: { messageId, message } };
    }
};
/** /edit - Edit last message */
exports.editCmd = {
    name: 'edit',
    description: 'Edit your last message',
    usage: '/edit new text',
    handler: (ctx, args) => {
        const text = args.join(' ');
        if (!text)
            return { handled: true, error: 'Usage: /edit new text' };
        return { handled: true, data: { text, type: 'edit' } };
    }
};
