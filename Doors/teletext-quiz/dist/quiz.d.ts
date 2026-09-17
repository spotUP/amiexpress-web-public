export interface Question {
    question: string;
    /** Exactly four, in red, green, yellow, cyan order. */
    answers: string[];
    /** Index into answers, 0-3. */
    correct: number;
    /** Shown on the result page, when the pack offers one. */
    note?: string;
}
export interface QuizPack {
    id: string;
    title: string;
    credit?: string;
    questions: Question[];
}
export interface PackLoadResult {
    packs: QuizPack[];
    errors: {
        file: string;
        message: string;
    }[];
}
/** The four answers are the four fastext keys, in packet 27 order. */
export declare const ANSWER_KEYS: readonly ["red", "green", "yellow", "cyan"];
export type AnswerKey = (typeof ANSWER_KEYS)[number];
/**
 * Read every question pack in a directory.
 *
 * A broken pack is reported and skipped. The sysop writes these by hand, so
 * "one bad file takes the door down" is not an acceptable failure.
 */
export declare function loadPacks(dir: string): PackLoadResult;
export declare function validatePack(raw: unknown, fallbackId: string): QuizPack;
export interface Round {
    questions: Question[];
    at: number;
    score: number;
    /** How many in a row, for the caller who is on a run. */
    streak: number;
    bestStreak: number;
    /** What was answered, in order, for the summary. */
    answers: {
        correct: boolean;
        chose: number;
    }[];
}
export type Rng = () => number;
/**
 * Pick the questions for one round.
 *
 * Shuffled without replacement, so a short pack never asks the same
 * question twice in a round; a pack shorter than the round length simply
 * makes a shorter round.
 */
export declare function pickQuestions(pack: QuizPack, count: number, rng?: Rng): Question[];
export declare function startRound(questions: Question[]): Round;
export declare function currentQuestion(round: Round): Question | null;
export declare function isFinished(round: Round): boolean;
/**
 * Answer the question in front of the caller. Returns whether it was right.
 *
 * `scoring` is false for a question the caller revealed the answer to: it
 * still counts as answered, and it is still reported right or wrong, but it
 * earns nothing and breaks the run. Reveal is a decoder function, not a
 * cheat code.
 */
export declare function answer(round: Round, chose: number, scoring?: boolean): boolean;
/** Move past the question that was just answered. */
export declare function advance(round: Round): void;
export interface ScoreRow {
    username: string;
    score: number;
    outOf: number;
    bestStreak: number;
    at: string;
}
/**
 * Where scores live.
 *
 * `data/` under the door, because the deploy's image-to-volume sync
 * deliberately excludes every door's data directory - runtime state belongs
 * to the board, not to the image.
 */
export declare function scoresPath(doorRoot: string): string;
export declare function readScores(doorRoot: string): ScoreRow[];
/**
 * Add a score and keep the table to its limit.
 *
 * Written through a temporary file: two callers finishing a round at the
 * same moment must not leave a half-written table that reads as no table at
 * all.
 */
export declare function recordScore(doorRoot: string, row: ScoreRow): ScoreRow[];
