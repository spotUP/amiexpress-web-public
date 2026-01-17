"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCmd = exports.createCmd = void 0;
/** /create - Create a new channel */
exports.createCmd = {
    name: 'create',
    description: 'Create a new channel',
    usage: '/create #name [topic]',
    handler: (ctx, args) => {
        const name = args[0]?.replace('#', '');
        const topic = args.slice(1).join(' ');
        if (!name)
            return { handled: true, error: 'Usage: /create #name [topic]' };
        return { handled: true, message: `Creating #${name}...`, data: { name, topic } };
    }
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
