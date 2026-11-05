import type { AppState } from './state';
import { CommandRegistry, CommandContext, CommandResult } from '../commands/types';
/** Create command context */
export declare function createCommandContext(state: AppState, user: {
    id: number;
    username: string;
    securityLevel?: number;
}): CommandContext;
/** Execute a slash command */
export declare function executeCommand(input: string, registry: CommandRegistry, ctx: CommandContext): Promise<CommandResult>;
