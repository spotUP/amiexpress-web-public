"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchCmd = void 0;
/** /search - Open search overlay */
exports.searchCmd = {
    name: 'search',
    description: 'Search messages',
    usage: '/search [query]',
    aliases: ['find'],
    handler: (ctx, args) => {
        const query = args.join(' ');
        return {
            handled: true,
            action: 'search',
            data: { query }
        };
    }
};
