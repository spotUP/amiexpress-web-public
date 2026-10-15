/** Slash command handler */
/**
 * Is this input a command, or is it something somebody wants to say?
 *
 * A command is a slash followed by a NAME. `startsWith('/')` alone was too
 * loose: the emoji catalogue contains `/!\`, so picking it into an empty
 * input and pressing Enter ran the command parser, which reported "Unknown
 * command" and swallowed the line - the reported "some emojis cannot be sent
 * because of the characters they start with".
 *
 * Deliberately strict about the first character after the slash: no command
 * begins with a digit or punctuation, and text very well might.
 */
export declare function looksLikeCommand(input: string): boolean;
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
