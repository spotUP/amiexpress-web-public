"use strict";
/**
 * Voice Channel Commands
 *
 * /voice - Show voice status
 * /voice join <channel> - Join voice channel
 * /voice leave - Leave current voice channel
 * /voice mute - Mute microphone
 * /voice unmute - Unmute microphone
 * /deafen - Mute audio output
 * /undeafen - Unmute audio output
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.undeafenCmd = exports.deafenCmd = exports.voiceCmd = void 0;
exports.voiceCmd = {
    name: 'voice',
    description: 'Voice channel commands',
    usage: '/voice [join <channel> | leave]',
    aliases: ['vc'],
    handler: (ctx, args) => {
        const subcommand = args[0]?.toLowerCase();
        if (!subcommand) {
            // Show voice status - emit event to get status
            ctx.emit('voice:status', {});
            return {
                handled: true,
                message: 'Voice Status:\n' +
                    'Commands:\n' +
                    '/voice join <channel> - Join voice channel\n' +
                    '/voice leave - Leave voice channel\n' +
                    '/voice mute - Mute microphone\n' +
                    '/voice unmute - Unmute microphone'
            };
        }
        if (subcommand === 'join') {
            const channelName = args.slice(1).join(' ');
            if (!channelName) {
                return { handled: true, error: 'Usage: /voice join <channel>' };
            }
            // Emit join event (handled by voice channel feature)
            ctx.emit('voice:join-channel', { channelName });
            return {
                handled: true,
                action: 'join',
                data: { type: 'voice', channelName }
            };
        }
        if (subcommand === 'leave') {
            ctx.emit('voice:leave-channel', {});
            return {
                handled: true,
                action: 'leave',
                data: { type: 'voice' }
            };
        }
        if (subcommand === 'mute') {
            ctx.emit('voice:mute', { isMuted: true });
            return {
                handled: true,
                action: 'mute',
                message: 'Microphone muted'
            };
        }
        if (subcommand === 'unmute') {
            ctx.emit('voice:mute', { isMuted: false });
            return {
                handled: true,
                action: 'unmute',
                message: 'Microphone unmuted'
            };
        }
        return {
            handled: true,
            error: `Unknown subcommand: ${subcommand}\nUsage: ${exports.voiceCmd.usage}`
        };
    },
};
exports.deafenCmd = {
    name: 'deafen',
    description: 'Deafen (mute audio output)',
    usage: '/deafen',
    aliases: ['deaf'],
    handler: (ctx) => {
        ctx.emit('voice:deafen', { isDeafened: true });
        return {
            handled: true,
            message: 'Deafened - cannot hear others'
        };
    },
};
exports.undeafenCmd = {
    name: 'undeafen',
    description: 'Undeafen (unmute audio output)',
    usage: '/undeafen',
    aliases: ['undeaf'],
    handler: (ctx) => {
        ctx.emit('voice:deafen', { isDeafened: false });
        return {
            handled: true,
            message: 'Undeafened - can hear others'
        };
    },
};
