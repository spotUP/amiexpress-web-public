"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCmd = exports.createCmd = void 0;
/** /create - Create a new channel */
exports.createCmd = {
    name: 'create',
    description: 'Create a new channel. --private and --invite-only make it members-only.',
    usage: '/create #name [topic] [--private] [--invite-only] [--motd "text"]',
    handler: (_ctx, args) => {
        if (!args[0])
            return { handled: true, error: 'Usage: /create #name [topic] [--private] [--invite-only] [--motd "text"]' };
        const flags = {};
        const name = args[0].replace(/^#/, '');
        const rest = [];
        for (let i = 1; i < args.length; i++) {
            const a = args[i];
            if (a === '--private')
                flags.isPrivate = true;
            else if (a === '--invite-only')
                flags.isInviteOnly = true;
            else if (a === '--motd') {
                const parts = [];
                while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                    parts.push(args[++i]);
                }
                flags.motd = parts.join(' ').replace(/^["']|["']$/g, '');
            }
            else
                rest.push(a);
        }
        const topic = rest.join(' ');
        return { handled: true, message: `Creating #${name}...`, data: { name, topic, ...flags } };
    },
};
/** /delete - Delete a channel */
exports.deleteCmd = {
    name: 'delete',
    description: 'Delete a channel',
    usage: '/delete #channel',
    minSecLevel: 80,
    handler: (ctx, args) => {
        const name = args[0]?.replace('#', '');
        if (!name)
            return { handled: true, error: 'Usage: /delete #channel' };
        return { handled: true, message: `Deleting #${name}...`, data: { channel: name } };
    }
};
