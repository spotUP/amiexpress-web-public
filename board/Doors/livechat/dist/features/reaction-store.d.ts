export type ReactionCounts = Record<string, number>;
/** Replace the counts of one message. An empty map clears it. */
export declare function setReactionCounts(messageId: string | number, next: ReactionCounts | undefined | null): void;
export declare function getReactionCounts(messageId: string | number): ReactionCounts;
/** Seed from a `room:joined` history array: items are `{ id, reactions? }`. */
export declare function seedReactionCounts(history: ReadonlyArray<{
    id?: string | number;
    reactions?: ReactionCounts;
}>): void;
export declare function clearReactionCounts(): void;
/** ` [<3 2] [[+] 1]` style suffix for a message line; empty when none. */
export declare function formatReactionCounts(messageId: string | number): string;
