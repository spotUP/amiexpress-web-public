/** Reaction on a message */
export interface Reaction {
    id: number;
    messageId: string;
    userId: number;
    emoji: string;
    createdAt: Date;
}
/** Grouped reaction for display */
export interface ReactionGroup {
    emoji: string;
    count: number;
    users: number[];
    hasReacted: boolean;
}
/** Available emoji reactions */
export declare const REACTION_EMOJIS: readonly ["+1", "-1", "heart", "fire", "laugh", "wow", "sad", "angry"];
/** Map emoji codes to ASCII display */
export declare const EMOJI_DISPLAY: Record<string, string>;
