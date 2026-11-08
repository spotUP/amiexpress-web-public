/**
 * Reaction counts per message id.
 *
 * The backend stores reactions with the message and broadcasts the full
 * per-emoji counts of a message on every change (`chat:reaction`), and
 * attaches them to every history item of `room:joined`. This module is the
 * door's one copy of those counts; features/reaction-rows lays them out under the message;
 * `formatReactionCounts` is the one-line form for /reactions.
 */
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
