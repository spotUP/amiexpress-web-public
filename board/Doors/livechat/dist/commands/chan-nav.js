"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.topicCmd = exports.leaveCmd = exports.joinCmd = void 0;
/** /join - Join a channel */
exports.joinCmd = {
    name: 'join',
    description: 'Join a channel',
    usage: '/join #channel',
    handler: (ctx, args) => {
        const name = args[0]?.replace('#', '');
        if (!name)
            return { handled: true, error: 'Usage: /join #channel' };
        return { handled: true, action: 'join', data: { channel: name } };
    }
};
/** /leave - Leave current channel */
exports.leaveCmd = {
    name: 'leave',
    description: 'Leave current channel',
    usage: '/leave',
    aliases: ['part'],
    handler: (ctx) => {
        return { handled: true, action: 'leave', data: { channel: ctx.currentChannel } };
    }
};
/** /topic - Set channel topic */
exports.topicCmd = {
    name: 'topic',
    description: 'Set channel topic',
    usage: '/topic <new topic>',
    handler: (ctx, args) => {
        const topic = args.join(' ');
        if (!topic)
            return { handled: true, error: 'Usage: /topic <new topic>' };
        return { handled: true, message: `Topic: ${topic}`, data: { topic } };
    }
};
