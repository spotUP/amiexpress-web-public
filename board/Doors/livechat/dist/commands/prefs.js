"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timestampsCmd = exports.compactCmd = exports.soundsCmd = void 0;
/** /sounds - Toggle sound notifications */
exports.soundsCmd = {
    name: 'sounds',
    description: 'Toggle sound notifications',
    usage: '/sounds [on|off]',
    handler: (ctx, args) => {
        const option = args[0]?.toLowerCase();
        if (option === 'on') {
            return { handled: true, message: 'Sounds enabled', data: { notificationSound: true } };
        }
        if (option === 'off') {
            return { handled: true, message: 'Sounds disabled', data: { notificationSound: false } };
        }
        return { handled: true, message: 'Usage: /sounds on|off' };
    }
};
/** /compact - Toggle compact mode */
exports.compactCmd = {
    name: 'compact',
    description: 'Toggle compact mode',
    usage: '/compact',
    handler: () => {
        return { handled: true, message: 'Compact mode toggled', data: { toggle: 'compactMode' } };
    }
};
/** /timestamps - Toggle timestamps */
exports.timestampsCmd = {
    name: 'timestamps',
    description: 'Toggle timestamps',
    usage: '/timestamps',
    aliases: ['time'],
    handler: () => {
        return { handled: true, message: 'Timestamps toggled', data: { toggle: 'showTimestamps' } };
    }
};
