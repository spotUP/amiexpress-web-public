"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCommandContext = createCommandContext;
exports.executeCommand = executeCommand;
const services_1 = require("../services");
/** Create command context */
function createCommandContext(state, user) {
    return {
        userId: user.id,
        username: user.username,
        secLevel: user.securityLevel || 10,
        currentChannel: state.currentChannel,
        emit: (e, d) => services_1.events.emit(e, d),
        systemMsg: () => { },
        errorMsg: () => { }
    };
}
/** Execute a slash command */
async function executeCommand(input, registry, ctx) {
    const parts = input.slice(1).split(/\s+/);
    const cmdName = parts[0].toLowerCase();
    const args = parts.slice(1);
    const cmd = registry.get(cmdName);
    if (!cmd) {
        return { handled: true, error: `Unknown command: /${cmdName}` };
    }
    if (cmd.minSecLevel && ctx.secLevel < cmd.minSecLevel) {
        return { handled: true, error: `Permission denied. Need level ${cmd.minSecLevel}` };
    }
    try {
        return await cmd.handler(ctx, args);
    }
    catch (err) {
        return { handled: true, error: err.message };
    }
}
