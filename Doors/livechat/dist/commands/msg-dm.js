"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meCmd = exports.msgCmd = void 0;
/** /msg - Send a direct message (1:1 or group) */
exports.msgCmd = {
    name: 'msg',
    description: 'Send a direct message (1:1 or group). /msg @a [@b ...] text',
    usage: '/msg @user [@user2 ...] message',
    aliases: ['dm', 'pm'],
    handler: (_ctx, args) => {
        const targets = [];
        let idx = 0;
        while (idx < args.length && args[idx].startsWith('@')) {
            targets.push(args[idx].replace('@', ''));
            idx++;
        }
        const message = args.slice(idx).join(' ');
        if (targets.length === 0 || !message)
            return { handled: true, error: 'Usage: /msg @user [@user2 ...] message' };
        return { handled: true, data: { targets, message, type: targets.length > 1 ? 'group-dm' : 'dm' } };
    },
};
/** /me - Action message */
exports.meCmd = {
    name: 'me',
    description: 'Send an action message',
    usage: '/me does something',
    handler: (ctx, args) => {
        const action = args.join(' ');
        if (!action)
            return { handled: true, error: 'Usage: /me does something' };
        return { handled: true, message: `ACTION: * ${ctx.username} ${action}` };
    }
};
