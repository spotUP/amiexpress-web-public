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
/** Map reaction names to the text face every caller sees. */
export declare const EMOJI_DISPLAY: Record<string, string>;
/** Picker words, in the order of REACTION_EMOJIS. */
export declare const REACTION_WORDS: readonly ["Thumbs Up", "Thumbs Down", "Heart", "Fire", "Laugh", "Wow", "Sad", "Angry"];
