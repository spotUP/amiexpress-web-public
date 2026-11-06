"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.heartCmd = exports.thumbsUpCmd = exports.reactionsCmd = exports.unreactCmd = exports.reactCmd = void 0;
const types_1 = require("../types");
/** /react - Add reaction to message */
exports.reactCmd = {
    name: 'react',
    description: 'Add reaction to message',
    usage: '/react [emoji] [msg-id]',
    aliases: ['+1', '-1', 'heart', 'fire'],
    handler: (ctx, args) => {
        // /heart, /fire, /+1 and /-1 are the emoji; /react takes it as an argument.
        const viaAlias = ctx.invokedAs !== undefined && ctx.invokedAs !== 'react';
        const emoji = viaAlias ? ctx.invokedAs : (args[0] || '+1');
        const msgId = viaAlias ? args[0] : args[1];
        if (!types_1.REACTION_EMOJIS.includes(emoji)) {
            const valid = types_1.REACTION_EMOJIS.join(', ');
            return { handled: true, error: `Valid emojis: ${valid}` };
        }
        if (!msgId)
            return { handled: true, error: 'Usage: /react [emoji] <msg-id>' };
        return { handled: true, action: 'react', data: { type: 'react', emoji, messageId: msgId } };
    }
};
/** /unreact - Remove reaction */
exports.unreactCmd = {
    name: 'unreact',
    description: 'Remove reaction',
    usage: '/unreact [emoji] [msg-id]',
    handler: (ctx, args) => {
        const emoji = args[0] || '+1';
        const msgId = args[1];
        if (!msgId)
            return { handled: true, error: 'Usage: /unreact [emoji] <msg-id>' };
        return { handled: true, action: 'unreact', data: { type: 'unreact', emoji, messageId: msgId } };
    }
};
/** /reactions - Show reactions on a message */
exports.reactionsCmd = {
    name: 'reactions',
    description: 'Show reactions',
    usage: '/reactions [msg-id]',
    handler: (ctx, args) => {
        const msgId = args[0];
        if (!msgId)
            return { handled: true, error: 'Usage: /reactions <msg-id>' };
        return { handled: true, action: 'reactions', data: { type: 'list_reactions', messageId: msgId } };
    }
};
/** Quick reaction shortcuts */
exports.thumbsUpCmd = {
    name: 'thumbsup',
    description: 'React with thumbs up',
    usage: '/thumbsup [msg-id]',
    aliases: ['like'],
    handler: (ctx, args) => {
        if (!args[0])
            return { handled: true, error: 'Usage: /thumbsup <msg-id>' };
        return { handled: true, action: 'react', data: { type: 'react', emoji: '+1', messageId: args[0] } };
    }
};
exports.heartCmd = {
    name: 'love',
    description: 'React with heart',
    usage: '/love [msg-id]',
    handler: (ctx, args) => {
        if (!args[0])
            return { handled: true, error: 'Usage: /love <msg-id>' };
        return { handled: true, action: 'react', data: { type: 'react', emoji: 'heart', messageId: args[0] } };
    }
};
