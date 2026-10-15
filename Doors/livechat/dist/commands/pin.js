"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pinnedCmd = exports.unpinCmd = exports.pinCmd = void 0;
/** /pin - Pin a message by ID */
exports.pinCmd = {
    name: 'pin',
    description: 'Pin a message',
    usage: '/pin <msg-id>',
    handler: (ctx, args) => {
        if (args.length !== 1)
            return { handled: true, error: 'Usage: /pin <msg-id>' };
        const messageId = parseInt(args[0], 10);
        if (isNaN(messageId))
            return { handled: true, error: 'Invalid message ID' };
        return { handled: true, data: { messageId, action: 'pin' } };
    }
};
/** /unpin - Unpin a message by ID */
exports.unpinCmd = {
    name: 'unpin',
    description: 'Unpin a message',
    usage: '/unpin <msg-id>',
    handler: (ctx, args) => {
        if (args.length !== 1)
            return { handled: true, error: 'Usage: /unpin <msg-id>' };
        const messageId = parseInt(args[0], 10);
        if (isNaN(messageId))
            return { handled: true, error: 'Invalid message ID' };
        return { handled: true, data: { messageId, action: 'unpin' } };
    }
};
/** /pinned - Show all pinned messages */
exports.pinnedCmd = {
    name: 'pinned',
    description: 'Show pinned messages',
    usage: '/pinned',
    aliases: ['pins'],
    handler: (ctx, args) => {
        return { handled: true, action: 'showpinned' };
    }
};
