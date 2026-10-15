/** Mention types */
export type MentionType = 'user' | 'everyone' | 'here';
/** Parsed mention */
export interface Mention {
    type: MentionType;
    username?: string;
    start: number;
    end: number;
}
/** Extract mentions from text */
export declare function extractMentions(text: string): Mention[];
/** Check if text mentions a specific user */
export declare function mentionsUser(text: string, username: string): boolean;
/** Check if text has @everyone or @here */
export declare function hasBroadcastMention(text: string): boolean;
/** Highlight mentions for display */
export declare function highlightMentions(text: string, currentUser: string): string;
/** Get list of mentioned usernames */
export declare function getMentionedUsers(text: string): string[];
