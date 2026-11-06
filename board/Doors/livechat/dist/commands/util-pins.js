"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.helpCmd = void 0;
/** /help - Show available commands */
const helpCmd = (registry) => ({
    name: 'help',
    description: 'Show available commands',
    usage: '/help [command]',
    aliases: ['?', 'commands'],
    handler: (ctx, args) => {
        if (args[0]) {
            const cmd = registry.get(args[0]);
            if (!cmd)
                return { handled: true, error: `Unknown: ${args[0]}` };
            return { handled: true, message: `/${cmd.name} - ${cmd.description}\n${cmd.usage}` };
        }
        const cmds = registry.getAll()
            .filter(c => !c.minSecLevel || ctx.secLevel >= c.minSecLevel)
            .map(c => `/${c.name}`).join(', ');
        return { handled: true, message: `Commands: ${cmds}` };
    }
});
exports.helpCmd = helpCmd;
