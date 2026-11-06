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
            return { handled: true, action: 'pref', data: { kind: 'sounds', value: true } };
        }
        if (option === 'off') {
            return { handled: true, action: 'pref', data: { kind: 'sounds', value: false } };
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
        return { handled: true, action: 'pref', data: { kind: 'compact' } };
    }
};
/** /timestamps - Toggle timestamps */
exports.timestampsCmd = {
    name: 'timestamps',
    description: 'Toggle timestamps',
    usage: '/timestamps',
    aliases: ['time'],
    handler: () => {
        return { handled: true, action: 'pref', data: { kind: 'timestamps' } };
    }
};
