/**
 * TELETEXT QUIZ - the caller's end of it.
 *
 * Views, keys and the one decision this door makes that a broadcast quiz
 * could not: the pages are composed for this round, for this caller, at the
 * moment they are shown.
 */
import { TeletextScreen, KeyStream } from '@amiexpress/bbs-door-sdk/teletext/screen';
import { resolveDoorRoot } from '@amiexpress/bbs-door-sdk/settings';
import * as path from 'path';

import {
  loadPacks,
  pickQuestions,
  startRound,
  currentQuestion,
  answer as answerRound,
  advance,
  isFinished,
  readScores,
  recordScore,
  type QuizPack,
  type Round,
  type ScoreRow,
} from './quiz';
import { titlePage, questionPage, resultPage, finalPage, messagePage } from './pages';
import { loadSettings, type QuizSettings } from './settings';

export interface DoorSession {
  socket: { emit(event: string, data: string): void };
  bbsSession: Record<string, unknown>;
  user?: { username?: string };
  close(): void;
  /** The board's achievement hook, when the host offers one. */
  achievement?(type: string, opts?: { value?: number; key?: string }): boolean;
}

type View = 'title' | 'question' | 'result' | 'final' | 'broken';

const ANSWER_BY_KEY: Record<string, number> = {
  r: 0, R: 0,
  g: 1, G: 1,
  y: 2, Y: 2,
  c: 3, C: 3,
};

export class QuizApp {
  private readonly session: DoorSession;
  private readonly settings: QuizSettings;
  private readonly screen: TeletextScreen;
  private readonly keys: KeyStream;
  private readonly doorRoot: string;

  private packs: QuizPack[] = [];
  private packErrors: { file: string; message: string }[] = [];
  private view: View = 'title';
  private round: Round | null = null;
  private revealed = false;
  private lastChoice = -1;
  private lastCorrect = false;
  private table: ScoreRow[] = [];
  private closed = false;

  constructor(session: DoorSession, doorRoot = resolveDoorRoot(__dirname)) {
    this.session = session;
    this.settings = loadSettings();
    this.doorRoot = doorRoot;

    const teletextMode = Boolean(session.bbsSession?.texttvMode);
    this.screen = new TeletextScreen({
      write: data => session.socket.emit('ansi-output', data),
      rows: Number(session.bbsSession?.screenHeight),
      mode: teletextMode ? 'teletext' : 'ansi',
    });

    this.keys = new KeyStream({
      key: ch => this.handleKey(ch),
      escape: () => this.quit(),
    });
  }

  // --- Lifecycle --------------------------------------------------------

  start(): void {
    this.screen.begin();

    const loaded = loadPacks(path.join(this.doorRoot, 'packs'));
    this.packErrors = loaded.errors;
    this.packs = this.settings.pack
      ? loaded.packs.filter(pack => pack.id === this.settings.pack)
      : loaded.packs;

    if (this.packs.length === 0) {
      this.view = 'broken';
      this.screen.paint(
        messagePage('NO QUESTIONS', [
          this.settings.pack
            ? `No pack called ${this.settings.pack}.`
            : 'No question packs are installed.',
          '',
          "Packs are JSON files in the door's",
          'packs/ folder. See packs/README.md.',
          ...loaded.errors.slice(0, 4).map(e => `${e.file}: ${e.message}`),
        ], 'red'),
      );
      this.screen.status('Q=Quit');
      return;
    }

    this.table = readScores(this.doorRoot);
    this.paintTitle();
  }

  stop(): void {
    this.closed = true;
    this.keys.dispose();
    this.screen.end();
  }

  handleInput(data: string): void {
    if (!this.closed) this.keys.feed(data);
  }

  // --- Keys -------------------------------------------------------------

  private handleKey(ch: string): void {
    if (ch === 'q' || ch === 'Q') return this.quit();

    switch (this.view) {
      case 'title':
        if (ch === ' ' || ch === '\r' || ch === '\n') this.beginRound();
        return;
      case 'question':
        if (ch === 'v' || ch === 'V') return this.revealAnswer();
        if (ch in ANSWER_BY_KEY) return this.answer(ANSWER_BY_KEY[ch]);
        return;
      case 'result':
        if (ch === ' ' || ch === '\r' || ch === '\n') this.nextQuestion();
        return;
      case 'final':
        if (ch === ' ' || ch === '\r' || ch === '\n') this.beginRound();
        return;
      default:
        return;
    }
  }

  // --- The round --------------------------------------------------------

  private beginRound(): void {
    // Every installed pack at once unless the sysop named one, so a board
    // that adds a pack does not have to change a setting to use it.
    const pool: QuizPack = {
      id: 'round',
      title: this.packs.length === 1 ? this.packs[0].title : `${this.packs.length} packs`,
      questions: this.packs.flatMap(pack => pack.questions),
    };
    this.round = startRound(pickQuestions(pool, this.settings.questions));
    this.revealed = false;
    this.paintQuestion();
  }

  private revealAnswer(): void {
    if (!this.settings.allowReveal) {
      this.screen.status('Reveal is switched off on this board');
      return;
    }
    this.revealed = true;
    this.paintQuestion();
  }

  private answer(chose: number): void {
    const round = this.round;
    const question = round && currentQuestion(round);
    if (!round || !question) return;

    // A revealed question is still answered and still judged - it just
    // earns nothing, and it breaks a run.
    this.lastCorrect = answerRound(round, chose, !this.revealed);
    this.lastChoice = chose;
    this.view = 'result';
    this.screen.paint(resultPage(question, chose, this.lastCorrect, round));
    this.screen.status(
      `${this.lastCorrect ? 'CORRECT' : 'WRONG'}${this.revealed ? ' (revealed)' : ''}  SPACE=Next  Q=Quit`,
    );
  }

  private nextQuestion(): void {
    if (!this.round) return;
    advance(this.round);
    this.revealed = false;
    if (isFinished(this.round)) return this.finish();
    this.paintQuestion();
  }

  private finish(): void {
    const round = this.round;
    if (!round) return;

    const username = this.session.user?.username || 'anonymous';
    this.table = recordScore(this.doorRoot, {
      username,
      score: round.score,
      outOf: round.questions.length,
      bestStreak: round.bestStreak,
      at: new Date().toISOString(),
    });

    // The board owns the namespace and the credential; a host without the
    // hook makes this a no-op, so there is nothing to guard.
    this.session.achievement?.('teletext_quiz_round', { value: round.score });
    if (round.score === round.questions.length && round.questions.length >= 5) {
      this.session.achievement?.('teletext_quiz_perfect', { value: round.questions.length });
    }

    this.view = 'final';
    this.screen.paint(finalPage(round, this.table, username));
    this.screen.status(`${round.score}/${round.questions.length}  SPACE=Again  Q=Quit`);
  }

  private quit(): void {
    this.stop();
    this.session.close();
  }

  // --- Painting ---------------------------------------------------------

  private paintTitle(): void {
    this.view = 'title';
    const best = this.table[0] ?? null;
    const questions = Math.min(
      this.settings.questions,
      this.packs.reduce((total, pack) => total + pack.questions.length, 0),
    );
    const title = this.packs.length === 1 ? this.packs[0].title : `${this.packs.length} question packs`;
    this.screen.paint(titlePage(title, questions, best));
    this.screen.status(
      this.packErrors.length > 0
        ? `SPACE=Start  Q=Quit  (${this.packErrors.length} pack(s) unreadable)`
        : 'SPACE=Start  Q=Quit',
    );
  }

  private paintQuestion(): void {
    const round = this.round;
    const question = round && currentQuestion(round);
    if (!round || !question) return;
    this.view = 'question';
    this.screen.paint(questionPage(question, round, this.revealed), { reveal: this.revealed });
    this.screen.status(
      `Q${round.at + 1}/${round.questions.length}  SCORE ${round.score}  R G Y C${this.settings.allowReveal ? '  V=Reveal' : ''}`,
    );
  }
}
