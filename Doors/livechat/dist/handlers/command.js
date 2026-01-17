"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandHandler = void 0;
/** Parse and execute slash commands */
class CommandHandler {
    constructor() {
        this.commands = new Map();
        this.registerDefaults();
    }
    registerDefaults() {
        this.register('help', () => ({
            handled: true,
            message: '/join #channel | /msg user | /me action | /quit'
        }));
        this.register('me', (args) => ({
            handled: true,
            message: `ACTION: ${args}`
        }));
        this.register('quit', () => ({
            handled: true,
            message: 'QUIT'
        }));
    }
    /** Register a command */
    register(name, fn) {
        this.commands.set(name.toLowerCase(), fn);
    }
    /** Execute a command */
    execute(input) {
        if (!input.startsWith('/')) {
            return { handled: false };
        }
        const [cmd, ...rest] = input.slice(1).split(' ');
        const fn = this.commands.get(cmd.toLowerCase());
        if (!fn) {
            return { handled: true, error: `Unknown command: /${cmd}` };
        }
        return fn(rest.join(' '));
    }
}
exports.CommandHandler = CommandHandler;
