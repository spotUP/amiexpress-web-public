import type { SlashCommand } from './types';
/** /create - Create a new channel */
/**
 * The kinds of room the chat hub stores (contract/chat-types.ts CHAT_ROOM_KINDS
 * in amiexpress-doorserver). /create asks for one when --type is not given.
 */
export declare const ROOM_KINDS: readonly ["text", "voice", "art"];
export type RoomKind = (typeof ROOM_KINDS)[number];
export declare const ROOM_KIND_LABELS: Record<RoomKind, string>;
export declare const isRoomKind: (v: unknown) => v is RoomKind;
export declare const createCmd: SlashCommand;
/** /delete - Delete a channel */
export declare const deleteCmd: SlashCommand;
