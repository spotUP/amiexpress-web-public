import type { SlashCommand } from './types';
/** /rooms - list the channels the sidebar shows */
export declare const roomsCmd: SlashCommand;
/** /ignore - hide a user's room messages and DMs; bare /ignore lists them */
export declare const ignoreCmd: SlashCommand;
/** /unignore - lift an ignore */
export declare const unignoreCmd: SlashCommand;
/** /draw - open the drawing menu, or join a drawing channel */
export declare const drawCmd: SlashCommand;
/** /files - open the file sharing browser */
export declare const filesCmd: SlashCommand;
/** /settings - open the settings overlay */
export declare const settingsCmd: SlashCommand;
