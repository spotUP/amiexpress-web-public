/**
 * The quiz itself: packs, a round, and the score table.
 *
 * Nothing in here draws anything or touches a socket. A teletext quiz is a
 * small amount of state and a lot of presentation, and keeping them apart
 * is what lets the rules be tested without a terminal.
 *
 * Bamboozle, the quiz this is shaped after, was not a program: every
 * question was a page and every answer was a page number, so the whole game
 * was the link graph. This board can compute, so the questions are picked
 * fresh per round instead of being a fixed tree - but the page a caller
 * sees is drawn the same way a broadcast one was.
 */
import * as fs from 'fs';
import * as path from 'path';

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
  errors: { file: string; message: string }[];
}

/** The four answers are the four fastext keys, in packet 27 order. */
export const ANSWER_KEYS = ['red', 'green', 'yellow', 'cyan'] as const;
export type AnswerKey = (typeof ANSWER_KEYS)[number];

// --- Packs ---------------------------------------------------------------

/**
 * Read every question pack in a directory.
 *
 * A broken pack is reported and skipped. The sysop writes these by hand, so
 * "one bad file takes the door down" is not an acceptable failure.
 */
export function loadPacks(dir: string): PackLoadResult {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter(name => name.toLowerCase().endsWith('.json')).sort();
  } catch {
    return { packs: [], errors: [] };
  }

  const packs: QuizPack[] = [];
  const errors: { file: string; message: string }[] = [];

  for (const name of names) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      packs.push(validatePack(raw, path.basename(name, '.json')));
    } catch (error) {
      errors.push({ file: name, message: (error as Error).message });
    }
  }
  return { packs, errors };
}

export function validatePack(raw: unknown, fallbackId: string): QuizPack {
  if (!raw || typeof raw !== 'object') throw new Error('not an object');
  const pack = raw as Partial<QuizPack>;

  const questions = Array.isArray(pack.questions) ? pack.questions : [];
  if (questions.length === 0) throw new Error('holds no questions');

  questions.forEach((question, at) => {
    const where = `question ${at + 1}`;
    if (!question || typeof question.question !== 'string' || !question.question.trim()) {
      throw new Error(`${where} has no text`);
    }
    if (!Array.isArray(question.answers) || question.answers.length !== 4) {
      // Four, because there are four coloured keys. Not three, not five.
      throw new Error(`${where} needs exactly four answers, one per colour key`);
    }
    if (question.answers.some(answer => typeof answer !== 'string' || !answer.trim())) {
      throw new Error(`${where} has an empty answer`);
    }
    if (!Number.isInteger(question.correct) || question.correct < 0 || question.correct > 3) {
      throw new Error(`${where} does not say which answer is right`);
    }
  });

  return {
    id: typeof pack.id === 'string' && pack.id ? pack.id : fallbackId,
    title: typeof pack.title === 'string' && pack.title ? pack.title : fallbackId,
    credit: typeof pack.credit === 'string' ? pack.credit : undefined,
    questions: questions as Question[],
  };
}

// --- A round -------------------------------------------------------------

export interface Round {
  questions: Question[];
  at: number;
  score: number;
  /** How many in a row, for the caller who is on a run. */
  streak: number;
  bestStreak: number;
  /** What was answered, in order, for the summary. */
  answers: { correct: boolean; chose: number }[];
}

export type Rng = () => number;

/**
 * Pick the questions for one round.
 *
 * Shuffled without replacement, so a short pack never asks the same
 * question twice in a round; a pack shorter than the round length simply
 * makes a shorter round.
 */
export function pickQuestions(pack: QuizPack, count: number, rng: Rng = Math.random): Question[] {
  const pool = [...pack.questions];
  for (let at = pool.length - 1; at > 0; at--) {
    const swap = Math.floor(rng() * (at + 1));
    [pool[at], pool[swap]] = [pool[swap], pool[at]];
  }
  return pool.slice(0, Math.max(1, Math.min(count, pool.length)));
}

export function startRound(questions: Question[]): Round {
  return { questions, at: 0, score: 0, streak: 0, bestStreak: 0, answers: [] };
}

export function currentQuestion(round: Round): Question | null {
  return round.questions[round.at] ?? null;
}

export function isFinished(round: Round): boolean {
  return round.at >= round.questions.length;
}

/**
 * Answer the question in front of the caller. Returns whether it was right.
 *
 * `scoring` is false for a question the caller revealed the answer to: it
 * still counts as answered, and it is still reported right or wrong, but it
 * earns nothing and breaks the run. Reveal is a decoder function, not a
 * cheat code.
 */
export function answer(round: Round, chose: number, scoring = true): boolean {
  const question = currentQuestion(round);
  if (!question) return false;

  const correct = chose === question.correct;
  round.answers.push({ correct, chose });
  if (correct && scoring) {
    round.score++;
    round.streak++;
    round.bestStreak = Math.max(round.bestStreak, round.streak);
  } else {
    round.streak = 0;
  }
  return correct;
}

/** Move past the question that was just answered. */
export function advance(round: Round): void {
  round.at++;
}

// --- The score table -----------------------------------------------------

export interface ScoreRow {
  username: string;
  score: number;
  outOf: number;
  bestStreak: number;
  at: string;
}

const SCORE_LIMIT = 15;

/**
 * Where scores live.
 *
 * `data/` under the door, because the deploy's image-to-volume sync
 * deliberately excludes every door's data directory - runtime state belongs
 * to the board, not to the image.
 */
export function scoresPath(doorRoot: string): string {
  return path.join(doorRoot, 'data', 'scores.json');
}

export function readScores(doorRoot: string): ScoreRow[] {
  try {
    const raw = JSON.parse(fs.readFileSync(scoresPath(doorRoot), 'utf8'));
    return Array.isArray(raw) ? (raw as ScoreRow[]) : [];
  } catch {
    return [];
  }
}

/**
 * Add a score and keep the table to its limit.
 *
 * Written through a temporary file: two callers finishing a round at the
 * same moment must not leave a half-written table that reads as no table at
 * all.
 */
export function recordScore(doorRoot: string, row: ScoreRow): ScoreRow[] {
  const table = [...readScores(doorRoot), row]
    .sort((a, b) => b.score - a.score || b.bestStreak - a.bestStreak || a.at.localeCompare(b.at))
    .slice(0, SCORE_LIMIT);

  const target = scoresPath(doorRoot);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(table, null, 2) + '\n', 'utf8');
    fs.renameSync(temporary, target);
  } catch (error) {
    // A board with a read-only door directory still plays; it just does not
    // remember. Losing the table is not worth losing the game over.
    console.error('[TeletextQuiz] could not write scores:', (error as Error).message);
  }
  return table;
}
