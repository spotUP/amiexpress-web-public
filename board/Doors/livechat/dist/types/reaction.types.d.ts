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
/** Map reaction names to the ASCII face (latin1 and Amiga callers; also the fallback). */
export declare const EMOJI_DISPLAY: Record<string, string>;
/** Real emoji for callers whose wire is UTF-8 (BBSApi.unicodeCapable). Each is 2 terminal columns. */
export declare const EMOJI_UTF8: Record<string, string>;
/** Picker words, in the order of REACTION_EMOJIS. */
export declare const REACTION_WORDS: readonly ["Thumbs Up", "Thumbs Down", "Heart", "Fire", "Laugh", "Wow", "Sad", "Angry"];
