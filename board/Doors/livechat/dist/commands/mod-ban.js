"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.opCmd = exports.unbanCmd = exports.banCmd = void 0;
/** /ban - Ban user from channel */
exports.banCmd = {
    name: 'ban',
    description: 'Ban user from channel',
    usage: '/ban @user [reason]',
    minSecLevel: 100,
    handler: (ctx, args) => {
        const target = args[0]?.replace('@', '');
        const reason = args.slice(1).join(' ') || 'No reason given';
        if (!target)
            return { handled: true, error: 'Usage: /ban @user [reason]' };
        return { handled: true, action: 'ban', data: { target, reason } };
    }
};
/** /unban - Unban user */
exports.unbanCmd = {
    name: 'unban',
    description: 'Unban user from channel',
    usage: '/unban @user',
    minSecLevel: 100,
    handler: (ctx, args) => {
        const target = args[0]?.replace('@', '');
        if (!target)
            return { handled: true, error: 'Usage: /unban @user' };
        return { handled: true, action: 'unban', data: { target } };
    }
};
/** /op - Give operator status */
exports.opCmd = {
    name: 'op',
    description: 'Give operator status',
    usage: '/op @user',
    minSecLevel: 100,
    handler: (ctx, args) => {
        const target = args[0]?.replace('@', '');
        if (!target)
            return { handled: true, error: 'Usage: /op @user' };
        return { handled: true, message: `${target} is now an operator`, data: { target, role: 'moderator' } };
    }
};
