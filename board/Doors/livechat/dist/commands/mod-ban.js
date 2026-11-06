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
/** /op - Give operator status (sysop only; the backend checks too) */
exports.opCmd = {
    name: 'op',
    description: 'Give or take room operator status (sysop)',
    usage: '/op @user  |  /op -@user  |  /deop @user',
    minSecLevel: 255,
    aliases: ['deop'],
    handler: (ctx, args) => {
        const raw = args[0] ?? '';
        const revoke = ctx.invokedAs === 'deop' || raw.startsWith('-');
        const target = raw.replace(/^-/, '').replace('@', '');
        if (!target)
            return { handled: true, error: 'Usage: /op @user  |  /op -@user  |  /deop @user' };
        return { handled: true, action: 'roomadmin', data: { event: 'room:op', payload: { username: target, op: !revoke } } };
    }
};
