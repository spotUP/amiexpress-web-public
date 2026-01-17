"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRegistry = void 0;
/** Command registry */
class CommandRegistry {
    constructor() {
        this.commands = new Map();
    }
    register(cmd) {
        this.commands.set(cmd.name.toLowerCase(), cmd);
        if (cmd.aliases) {
            for (const alias of cmd.aliases) {
                this.commands.set(alias.toLowerCase(), cmd);
            }
        }
    }
    get(name) {
        return this.commands.get(name.toLowerCase());
    }
    getAll() {
        const seen = new Set();
        const cmds = [];
        for (const cmd of this.commands.values()) {
            if (!seen.has(cmd.name)) {
                seen.add(cmd.name);
                cmds.push(cmd);
            }
        }
        return cmds;
    }
}
exports.CommandRegistry = CommandRegistry;
