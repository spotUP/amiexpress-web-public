import type { SlashCommand } from './types';
/** /reply - Reply to last message */
export declare const replyCmd: SlashCommand;
/** /thread - Start a thread on a message */
export declare const threadCmd: SlashCommand;
/**
 * /edit [id] new text - edit one of your own messages. Without an id it is
 * your last message; the id is a stored message id, so it is all digits.
 */
export declare const editCmd: SlashCommand;
/** /deletemsg [id] - delete a message (yours; any message for a room operator or the sysop). /delete is the channel command. */
export declare const deleteMessageCmd: SlashCommand;
