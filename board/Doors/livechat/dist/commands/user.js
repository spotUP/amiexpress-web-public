"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nickCmd = exports.statusCmd = exports.backCmd = exports.awayCmd = exports.whoisCmd = exports.whoCmd = void 0;
/** /who - List users in channel */
exports.whoCmd = {
    name: 'who',
    description: 'List users in channel',
    usage: '/who',
    aliases: ['users', 'list'],
    handler: (ctx) => {
        return { handled: true, data: { type: 'list_users', channel: ctx.currentChannel } };
    }
};
/** /whois - Show user info */
exports.whoisCmd = {
    name: 'whois',
    description: 'Show user info',
    usage: '/whois @user',
    aliases: ['info'],
    handler: (ctx, args) => {
        const username = args[0]?.replace('@', '');
        if (!username)
            return { handled: true, error: 'Usage: /whois @user' };
        return { handled: true, data: { type: 'whois', username } };
    }
};
/** /away - Set away status */
exports.awayCmd = {
    name: 'away',
    description: 'Set away status',
    usage: '/away [message]',
    aliases: ['afk'],
    handler: (ctx, args) => {
        const message = args.join(' ') || 'Away';
        return { handled: true, message: `You are now away: ${message}`, data: { status: 'away', message } };
    }
};
/** /back - Return from away */
exports.backCmd = {
    name: 'back',
    description: 'Return from away',
    usage: '/back',
    handler: () => {
        return { handled: true, message: 'You are now online', data: { status: 'online' } };
    }
};
/** /status - Set custom status */
exports.statusCmd = {
    name: 'status',
    description: 'Set custom status',
    usage: '/status [online|away|dnd] [message]',
    handler: (ctx, args) => {
        const status = args[0] || 'online';
        const message = args.slice(1).join(' ');
        return { handled: true, message: `Status: ${status}`, data: { status, message } };
    }
};
/** /nick - Show current username */
exports.nickCmd = {
    name: 'nick',
    description: 'Show your username',
    usage: '/nick',
    handler: (ctx) => {
        return { handled: true, message: `Your username: ${ctx.username}` };
    }
};
