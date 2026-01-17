import type { Message, ReactionGroup } from '../types';
/** Format a message for display */
export declare function formatMessage(msg: Message, currentUser: string, compact: boolean): string;
/** Format reactions */
export declare function formatReactions(reactions: ReactionGroup[]): string;
/** Format system message */
export declare function formatSystemMessage(text: string): string;
/** Get consistent color for username */
export declare function getUserColor(username: string): string;
/** Format thread indicator */
export declare function formatThread(replyCount: number): string;
/** Format pinned indicator */
export declare function formatPinned(isPinned: boolean): string;
