/** Command execution context */
export interface CommandContext {
    userId: number;
    username: string;
    secLevel: number;
    currentChannel: string;
    emit: (event: string, data: any) => void;
    systemMsg: (text: string) => void;
    errorMsg: (text: string) => void;
}
/** Command result */
export interface CommandResult {
    handled: boolean;
    message?: string;
    error?: string;
    action?: 'quit' | 'join' | 'leave' | 'switch' | 'thread' | 'pin' | 'unpin' | 'showpinned' | 'search' | 'kick' | 'ban' | 'unban' | 'mute' | 'unmute';
    data?: any;
}
/** Slash command definition */
export interface SlashCommand {
    name: string;
    description: string;
    usage: string;
    aliases?: string[];
    minSecLevel?: number;
    handler: (ctx: CommandContext, args: string[]) => Promise<CommandResult> | CommandResult;
}
/** Command registry */
export declare class CommandRegistry {
    private commands;
    register(cmd: SlashCommand): void;
    get(name: string): SlashCommand | undefined;
    getAll(): SlashCommand[];
}
