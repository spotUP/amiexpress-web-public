import type { SlashCommand } from './types';
/** /motd [text] - Set or view channel MOTD */
export declare const motdCmd: SlashCommand;
/** /invite @user [#room] - Invite a user to an invite-only channel (moderator only) */
export declare const inviteCmd: SlashCommand;
/** /uninvite @user [#room] - Revoke a pending invite */
export declare const uninviteCmd: SlashCommand;
export declare const modeCmd: SlashCommand;
