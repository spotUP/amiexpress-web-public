/** Slash command handler */
export interface CommandResult {
    handled: boolean;
    message?: string;
    error?: string;
}
type CommandFn = (args: string) => CommandResult;
/** Parse and execute slash commands */
export declare class CommandHandler {
    private commands;
    constructor();
    private registerDefaults;
    /** Register a command */
    register(name: string, fn: CommandFn): void;
    /** Execute a command */
    execute(input: string): CommandResult;
}
export {};
