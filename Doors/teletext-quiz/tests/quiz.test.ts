/**
 * The quiz rules, with no terminal in sight.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  validatePack,
  loadPacks,
  pickQuestions,
  startRound,
  answer,
  advance,
  isFinished,
  currentQuestion,
  readScores,
  recordScore,
  type QuizPack,
} from '../quiz';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'teletext-quiz-test-'));
}

const QUESTION = {
  question: 'Which BBS software is this?',
  answers: ['AmiExpress', 'CNet', 'StarNet', 'TAG'],
  correct: 0,
};

function pack(count = 4): QuizPack {
  return {
    id: 'test',
    title: 'Test',
    questions: Array.from({ length: count }, (_unused, at) => ({
      ...QUESTION,
      question: `Question ${at}`,
      correct: at % 4,
    })),
  };
}

export async function packMustHaveFourAnswers(): Promise<void> {
  // Four, because there are four coloured keys. Not three, not five.
  assert.throws(
    () => validatePack({ questions: [{ ...QUESTION, answers: ['a', 'b', 'c'] }] }, 'x'),
    /exactly four answers/,
  );
}

export async function packMustSayWhichAnswerIsRight(): Promise<void> {
  assert.throws(
    () => validatePack({ questions: [{ ...QUESTION, correct: 9 }] }, 'x'),
    /which answer is right/,
  );
  assert.throws(() => validatePack({ questions: [] }, 'x'), /no questions/);
}

export async function packTakesItsIdFromTheFilename(): Promise<void> {
  const parsed = validatePack({ questions: [QUESTION] }, 'fallback');
  assert.strictEqual(parsed.id, 'fallback');
  assert.strictEqual(parsed.title, 'fallback');
}

export async function oneBrokenPackDoesNotStopTheOthers(): Promise<void> {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'good.json'), JSON.stringify({ questions: [QUESTION] }));
  fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json');
  fs.writeFileSync(path.join(dir, 'empty.json'), JSON.stringify({ questions: [] }));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');

  const loaded = loadPacks(dir);
  assert.strictEqual(loaded.packs.length, 1, 'the good pack still loads');
  assert.strictEqual(loaded.errors.length, 2, 'both bad packs are reported');
  fs.rmSync(dir, { recursive: true, force: true });
}

export async function aMissingPacksFolderIsNotAnError(): Promise<void> {
  const loaded = loadPacks(path.join(tempDir(), 'nope'));
  assert.deepStrictEqual(loaded, { packs: [], errors: [] });
}

export async function roundNeverRepeatsAQuestion(): Promise<void> {
  const picked = pickQuestions(pack(6), 6, makeRng());
  const seen = new Set(picked.map(q => q.question));
  assert.strictEqual(seen.size, 6, 'six distinct questions');
}

export async function roundIsShorterThanAShortPack(): Promise<void> {
  assert.strictEqual(pickQuestions(pack(3), 10, makeRng()).length, 3);
  assert.strictEqual(pickQuestions(pack(3), 0, makeRng()).length, 1, 'at least one question');
}

export async function scoringCountsAndTracksTheRun(): Promise<void> {
  const round = startRound(pack(4).questions);
  assert.strictEqual(answer(round, currentQuestion(round)!.correct), true);
  advance(round);
  assert.strictEqual(answer(round, currentQuestion(round)!.correct), true);
  advance(round);
  assert.strictEqual(round.score, 2);
  assert.strictEqual(round.streak, 2);

  assert.strictEqual(answer(round, (currentQuestion(round)!.correct + 1) % 4), false);
  advance(round);
  assert.strictEqual(round.score, 2, 'a wrong answer does not score');
  assert.strictEqual(round.streak, 0, 'and breaks the run');
  assert.strictEqual(round.bestStreak, 2, 'but the best run is remembered');
}

export async function aRevealedQuestionIsJudgedButNeverScores(): Promise<void> {
  // Reveal is a decoder function, not a cheat code.
  const round = startRound(pack(2).questions);
  const correct = answer(round, currentQuestion(round)!.correct, false);
  assert.strictEqual(correct, true, 'it still says you were right');
  assert.strictEqual(round.score, 0, 'and still gives you nothing');
  assert.strictEqual(round.streak, 0);
}

export async function roundFinishesAfterTheLastQuestion(): Promise<void> {
  const round = startRound(pack(2).questions);
  assert.strictEqual(isFinished(round), false);
  advance(round);
  advance(round);
  assert.strictEqual(isFinished(round), true);
  assert.strictEqual(currentQuestion(round), null);
  assert.strictEqual(answer(round, 0), false, 'answering past the end does nothing');
}

export async function scoresSortAndTruncate(): Promise<void> {
  const dir = tempDir();
  assert.deepStrictEqual(readScores(dir), [], 'no table yet is not an error');

  for (let score = 0; score < 20; score++) {
    recordScore(dir, {
      username: `caller${score}`,
      score,
      outOf: 20,
      bestStreak: 1,
      at: new Date(2026, 0, 1, 0, score).toISOString(),
    });
  }

  const table = readScores(dir);
  assert.strictEqual(table.length, 15, 'the table is capped');
  assert.strictEqual(table[0].score, 19, 'best first');
  assert.ok(table[0].at, 'and it remembers when');
  fs.rmSync(dir, { recursive: true, force: true });
}

export async function scoresSurviveAGarbageFile(): Promise<void> {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data', 'scores.json'), 'not json at all');
  assert.deepStrictEqual(readScores(dir), [], 'a corrupt table reads as no table');
  const table = recordScore(dir, { username: 'a', score: 1, outOf: 2, bestStreak: 1, at: 'now' });
  assert.strictEqual(table.length, 1, 'and is replaced by a good one');
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Deterministic shuffle source, so a test never depends on Math.random. */
function makeRng(): () => number {
  let seed = 1;
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}
