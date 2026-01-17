"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchCmd = exports.clearCmd = exports.quitCmd = void 0;
/** /quit - Exit chat */
exports.quitCmd = {
    name: 'quit',
    description: 'Exit chat',
    usage: '/quit',
    aliases: ['exit', 'bye', 'q'],
    handler: () => {
        return { handled: true, action: 'quit', message: 'Goodbye!' };
    }
};
/** /clear - Clear chat display */
exports.clearCmd = {
    name: 'clear',
    description: 'Clear chat display',
    usage: '/clear',
    aliases: ['cls'],
    handler: () => {
        return { handled: true, data: { type: 'clear' } };
    }
};
/** /search - Search messages */
exports.searchCmd = {
    name: 'search',
    description: 'Search messages',
    usage: '/search query',
    aliases: ['find'],
    handler: (ctx, args) => {
        const query = args.join(' ');
        if (!query)
            return { handled: true, error: 'Usage: /search query' };
        return { handled: true, data: { type: 'search', query } };
    }
};
