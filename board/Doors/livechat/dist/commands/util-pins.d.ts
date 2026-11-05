import type { SlashCommand, CommandRegistry } from './types';
/** /pin - Pin a message */
export declare const pinCmd: SlashCommand;
/** /pins - Show pinned messages */
export declare const pinsCmd: SlashCommand;
/** /help - Show available commands */
export declare const helpCmd: (registry: CommandRegistry) => SlashCommand;
