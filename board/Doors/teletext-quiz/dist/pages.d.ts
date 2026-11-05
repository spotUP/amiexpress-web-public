/**
 * The quiz drawn as teletext pages.
 *
 * Every page here is composed at the moment it is shown. That is the whole
 * difference between this and the quizzes it imitates: Bamboozle and Worms
 * for Teletext had to be drawn in advance and broadcast, because a
 * television had no processor and no way to answer back. A BBS has both, so
 * the page can know the caller's score.
 *
 * The layout is deliberately the one a real quiz page used: a double-height
 * title, the question, four answers in red, green, yellow and cyan against
 * the four fastext keys, and the answer itself carried on the page as
 * concealed text - which is how a teletext quiz always hid it.
 */
import { type ColorName } from '@amiexpress/bbs-door-sdk/teletext/compose';
import type { TeletextSubpage } from '@amiexpress/bbs-door-sdk/teletext';
import type { Question, Round, ScoreRow } from './quiz';
/** Red, green, yellow, cyan - the four keys, in packet 27 order. */
export declare const ANSWER_COLORS: ColorName[];
export declare const ANSWER_LABELS: string[];
export declare function titlePage(packTitle: string, questions: number, best: ScoreRow | null): TeletextSubpage;
export declare function questionPage(question: Question, round: Round, revealed: boolean): TeletextSubpage;
export declare function resultPage(question: Question, chose: number, correct: boolean, round: Round): TeletextSubpage;
export declare function finalPage(round: Round, table: ScoreRow[], username: string): TeletextSubpage;
export declare function messagePage(title: string, lines: string[], color?: ColorName): TeletextSubpage;
export declare function fit(text: string, width: number): string;
/** Break text onto 40-column lines without cutting words in half. */
export declare function wrap(text: string, width?: number): string[];
