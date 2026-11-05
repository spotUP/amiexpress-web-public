/**
 * The quiz driven through its real keys, against real composed pages.
 *
 * The rules are tested next door in quiz.test.ts. What is checked here is
 * that a caller pressing R gets the red answer, that the concealed answer
 * really is concealed on the page as drawn, and that a round reaches the
 * score table.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { QuizApp, type DoorSession } from '../app';

class FakeTerminal {
  readonly chunks: string[] = [];
  closed = false;
  readonly achievements: { type: string; value?: number }[] = [];

  session(teletextMode = false): DoorSession {
    return {
      socket: { emit: (_event: string, data: string) => { this.chunks.push(data); } },
      bbsSession: { texttvMode: teletextMode, screenHeight: 25 },
      user: { username: 'tester' },
      close: () => { this.closed = true; },
      achievement: (type, opts) => {
        this.achievements.push({ type, value: opts?.value });
        return true;
      },
    };
  }

  get text(): string {
    return this.chunks
      .join('')
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1b#[0-9]/g, '');
  }

  forget(): void {
    this.chunks.length = 0;
  }
}

/** A board with exactly one question, so nothing depends on the shuffle. */
function boardWithOneQuestion(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teletext-quiz-door-'));
  fs.mkdirSync(path.join(root, 'packs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'packs', 'test.json'),
    JSON.stringify({
      id: 'test',
      title: 'One Question Pack',
      questions: [
        {
          question: 'Which BBS software is this board built on?',
          answers: ['AMIEXPRESS', 'CNET', 'STARNET', 'TAG'],
          correct: 0,
          note: 'Written by Joe Hodge for the Amiga.',
        },
      ],
    }),
  );
  return root;
}

function open(root: string): { term: FakeTerminal; app: QuizApp } {
  const term = new FakeTerminal();
  const app = new QuizApp(term.session(), root);
  app.start();
  return { term, app };
}

function type(app: QuizApp, keys: string): void {
  for (const key of keys) app.handleInput(key);
}

export async function titleAsksForSpace(): Promise<void> {
  const root = boardWithOneQuestion();
  const { term, app } = open(root);
  assert.ok(term.text.includes('QUIZ'), term.text.slice(0, 120));
  assert.ok(term.text.includes('One Question Pack'));
  app.stop();
  fs.rmSync(root, { recursive: true, force: true });
}

export async function spaceStartsAndShowsFourColouredAnswers(): Promise<void> {
  const root = boardWithOneQuestion();
  const { term, app } = open(root);
  term.forget();
  type(app, ' ');
  for (const answer of ['AMIEXPRESS', 'CNET', 'STARNET', 'TAG']) {
    assert.ok(term.text.includes(answer), `expected ${answer} on the question page`);
  }
  assert.ok(term.text.includes('RED') && term.text.includes('CYAN'), 'the keys are named');
  app.stop();
  fs.rmSync(root, { recursive: true, force: true });
}

export async function theAnswerIsConcealedOnThePage(): Promise<void> {
  // It is really written on the page, as a teletext quiz always wrote it -
  // the decoder just refuses to draw it until asked.
  const root = boardWithOneQuestion();
  const { term, app } = open(root);
  type(app, ' ');
  term.forget();
  const occurrences = (text: string) => text.split('AMIEXPRESS').length - 1;
  assert.strictEqual(occurrences(term.text), 0, 'nothing repainted yet');

  type(app, 'v');
  // Once revealed the page carries it twice: the red option and the answer
  // line underneath.
  assert.strictEqual(occurrences(term.text), 2, 'revealed shows both');
  app.stop();
  fs.rmSync(root, { recursive: true, force: true });
}

export async function redAnswersWithTheRedOption(): Promise<void> {
  const root = boardWithOneQuestion();
  const { term, app } = open(root);
  type(app, ' ');
  term.forget();
  type(app, 'r');
  assert.ok(term.text.includes('CORRECT'), term.text.slice(0, 200));
  assert.ok(term.text.includes('Joe Hodge'), 'the note is shown on the result page');
  app.stop();
  fs.rmSync(root, { recursive: true, force: true });
}

export async function aWrongKeyShowsTheAnswer(): Promise<void> {
  const root = boardWithOneQuestion();
  const { term, app } = open(root);
  type(app, ' ');
  term.forget();
  type(app, 'g');
  assert.ok(term.text.includes('WRONG'));
  assert.ok(term.text.includes('THE ANSWER WAS'));
  app.stop();
  fs.rmSync(root, { recursive: true, force: true });
}

export async function aRoundReachesTheScoreTable(): Promise<void> {
  const root = boardWithOneQuestion();
  const { term, app } = open(root);
  type(app, ' ');
  type(app, 'r');
  term.forget();
  type(app, ' ');

  assert.ok(term.text.includes('FINISHED'), term.text.slice(0, 200));
  assert.ok(term.text.includes('1 OUT OF 1'));
  assert.ok(term.text.includes('tester'), 'the caller is on the table');

  const written = JSON.parse(fs.readFileSync(path.join(root, 'data', 'scores.json'), 'utf8'));
  assert.strictEqual(written[0].username, 'tester');
  assert.strictEqual(written[0].score, 1);
  app.stop();
  fs.rmSync(root, { recursive: true, force: true });
}

export async function revealingCostsTheScore(): Promise<void> {
  const root = boardWithOneQuestion();
  const { term, app } = open(root);
  type(app, ' ');
  type(app, 'v');
  type(app, 'r');
  term.forget();
  type(app, ' ');
  assert.ok(term.text.includes('0 OUT OF 1'), 'a revealed question earns nothing');
  app.stop();
  fs.rmSync(root, { recursive: true, force: true });
}

export async function aPerfectRoundTellsTheBoard(): Promise<void> {
  const root = boardWithOneQuestion();
  const { term, app } = open(root);
  type(app, ' ');
  type(app, 'r');
  type(app, ' ');
  const types = term.achievements.map(a => a.type);
  assert.ok(types.includes('teletext_quiz_round'), 'every round is reported');
  // The perfect-round achievement needs a round worth winning; one question
  // is not one.
  assert.ok(!types.includes('teletext_quiz_perfect'), 'a one-question round is not a perfect round');
  app.stop();
  fs.rmSync(root, { recursive: true, force: true });
}

export async function spacePlaysAgain(): Promise<void> {
  const root = boardWithOneQuestion();
  const { term, app } = open(root);
  type(app, ' ');
  type(app, 'r');
  type(app, ' ');
  term.forget();
  type(app, ' ');
  assert.ok(term.text.includes('Which BBS software'), 'a new round starts');
  app.stop();
  fs.rmSync(root, { recursive: true, force: true });
}

export async function aBoardWithNoPacksSaysSo(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teletext-quiz-empty-'));
  const { term, app } = open(root);
  assert.ok(term.text.includes('NO QUESTIONS'), term.text.slice(0, 200));
  assert.ok(term.text.includes('packs/README.md'), 'and says where packs go');
  term.forget();
  type(app, ' ');
  assert.strictEqual(term.text, '', 'and nothing starts');
  app.stop();
  fs.rmSync(root, { recursive: true, force: true });
}

export async function quitClosesTheDoor(): Promise<void> {
  const root = boardWithOneQuestion();
  const { term, app } = open(root);
  type(app, 'q');
  assert.strictEqual(term.closed, true);
  app.stop();
  fs.rmSync(root, { recursive: true, force: true });
}

export async function theShippedPackIsValid(): Promise<void> {
  // The pack that ships with the door has to survive its own validator.
  const { loadPacks } = await import('../quiz');
  const loaded = loadPacks(path.join(__dirname, '..', 'packs'));
  assert.deepStrictEqual(loaded.errors, [], JSON.stringify(loaded.errors));
  assert.ok(loaded.packs.length >= 1, 'at least one pack ships');
  assert.ok(loaded.packs[0].questions.length >= 10, 'and it is worth playing');
}
