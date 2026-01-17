"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meCmd = exports.msgCmd = void 0;
/** /msg - Send a direct message */
exports.msgCmd = {
    name: 'msg',
    description: 'Send a direct message',
    usage: '/msg @user message',
    aliases: ['dm', 'pm'],
    handler: (ctx, args) => {
        const target = args[0]?.replace('@', '');
        const message = args.slice(1).join(' ');
        if (!target || !message)
            return { handled: true, error: 'Usage: /msg @user message' };
        return { handled: true, data: { target, message, type: 'dm' } };
    }
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
