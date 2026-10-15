"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuizApp = void 0;
/**
 * TELETEXT QUIZ - the caller's end of it.
 *
 * Views, keys and the one decision this door makes that a broadcast quiz
 * could not: the pages are composed for this round, for this caller, at the
 * moment they are shown.
 */
const screen_1 = require("@amiexpress/bbs-door-sdk/teletext/screen");
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
const path = __importStar(require("path"));
const quiz_1 = require("./quiz");
const pages_1 = require("./pages");
const settings_2 = require("./settings");
const ANSWER_BY_KEY = {
    r: 0, R: 0,
    g: 1, G: 1,
    y: 2, Y: 2,
    c: 3, C: 3,
};
class QuizApp {
    constructor(session, doorRoot = (0, settings_1.resolveDoorRoot)(__dirname)) {
        this.packs = [];
        this.packErrors = [];
        this.view = 'title';
        this.round = null;
        this.revealed = false;
        this.lastChoice = -1;
        this.lastCorrect = false;
        this.table = [];
        this.closed = false;
        this.session = session;
        this.settings = (0, settings_2.loadSettings)();
        this.doorRoot = doorRoot;
        const teletextMode = Boolean(session.bbsSession?.texttvMode);
        this.screen = new screen_1.TeletextScreen({
            write: data => session.socket.emit('ansi-output', data),
            rows: Number(session.bbsSession?.screenHeight),
            mode: teletextMode ? 'teletext' : 'ansi',
        });
        this.keys = new screen_1.KeyStream({
            key: ch => this.handleKey(ch),
            escape: () => this.quit(),
        });
    }
    // --- Lifecycle --------------------------------------------------------
    start() {
        this.screen.begin();
        const loaded = (0, quiz_1.loadPacks)(path.join(this.doorRoot, 'packs'));
        this.packErrors = loaded.errors;
        this.packs = this.settings.pack
            ? loaded.packs.filter(pack => pack.id === this.settings.pack)
            : loaded.packs;
        if (this.packs.length === 0) {
            this.view = 'broken';
            this.screen.paint((0, pages_1.messagePage)('NO QUESTIONS', [
                this.settings.pack
                    ? `No pack called ${this.settings.pack}.`
                    : 'No question packs are installed.',
                '',
                "Packs are JSON files in the door's",
                'packs/ folder. See packs/README.md.',
                ...loaded.errors.slice(0, 4).map(e => `${e.file}: ${e.message}`),
            ], 'red'));
            this.screen.status('Q=Quit');
            return;
        }
        this.table = (0, quiz_1.readScores)(this.doorRoot);
        this.paintTitle();
    }
    stop() {
        this.closed = true;
        this.keys.dispose();
        this.screen.end();
    }
    handleInput(data) {
        if (!this.closed)
            this.keys.feed(data);
    }
    // --- Keys -------------------------------------------------------------
    handleKey(ch) {
        if (ch === 'q' || ch === 'Q')
            return this.quit();
        switch (this.view) {
            case 'title':
                if (ch === ' ' || ch === '\r' || ch === '\n')
                    this.beginRound();
                return;
            case 'question':
                if (ch === 'v' || ch === 'V')
                    return this.revealAnswer();
                if (ch in ANSWER_BY_KEY)
                    return this.answer(ANSWER_BY_KEY[ch]);
                return;
            case 'result':
                if (ch === ' ' || ch === '\r' || ch === '\n')
                    this.nextQuestion();
                return;
            case 'final':
                if (ch === ' ' || ch === '\r' || ch === '\n')
                    this.beginRound();
                return;
            default:
                return;
        }
    }
    // --- The round --------------------------------------------------------
    beginRound() {
        // Every installed pack at once unless the sysop named one, so a board
        // that adds a pack does not have to change a setting to use it.
        const pool = {
            id: 'round',
            title: this.packs.length === 1 ? this.packs[0].title : `${this.packs.length} packs`,
            questions: this.packs.flatMap(pack => pack.questions),
        };
        this.round = (0, quiz_1.startRound)((0, quiz_1.pickQuestions)(pool, this.settings.questions));
        this.revealed = false;
        this.paintQuestion();
    }
    revealAnswer() {
        if (!this.settings.allowReveal) {
            this.screen.status('Reveal is switched off on this board');
            return;
        }
        this.revealed = true;
        this.paintQuestion();
    }
    answer(chose) {
        const round = this.round;
        const question = round && (0, quiz_1.currentQuestion)(round);
        if (!round || !question)
            return;
        // A revealed question is still answered and still judged - it just
        // earns nothing, and it breaks a run.
        this.lastCorrect = (0, quiz_1.answer)(round, chose, !this.revealed);
        this.lastChoice = chose;
        this.view = 'result';
        this.screen.paint((0, pages_1.resultPage)(question, chose, this.lastCorrect, round));
        this.screen.status(`${this.lastCorrect ? 'CORRECT' : 'WRONG'}${this.revealed ? ' (revealed)' : ''}  SPACE=Next  Q=Quit`);
    }
    nextQuestion() {
        if (!this.round)
            return;
        (0, quiz_1.advance)(this.round);
        this.revealed = false;
        if ((0, quiz_1.isFinished)(this.round))
            return this.finish();
        this.paintQuestion();
    }
    finish() {
        const round = this.round;
        if (!round)
            return;
        const username = this.session.user?.username || 'anonymous';
        this.table = (0, quiz_1.recordScore)(this.doorRoot, {
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
        this.screen.paint((0, pages_1.finalPage)(round, this.table, username));
        this.screen.status(`${round.score}/${round.questions.length}  SPACE=Again  Q=Quit`);
    }
    quit() {
        this.stop();
        this.session.close();
    }
    // --- Painting ---------------------------------------------------------
    paintTitle() {
        this.view = 'title';
        const best = this.table[0] ?? null;
        const questions = Math.min(this.settings.questions, this.packs.reduce((total, pack) => total + pack.questions.length, 0));
        const title = this.packs.length === 1 ? this.packs[0].title : `${this.packs.length} question packs`;
        this.screen.paint((0, pages_1.titlePage)(title, questions, best));
        this.screen.status(this.packErrors.length > 0
            ? `SPACE=Start  Q=Quit  (${this.packErrors.length} pack(s) unreadable)`
            : 'SPACE=Start  Q=Quit');
    }
    paintQuestion() {
        const round = this.round;
        const question = round && (0, quiz_1.currentQuestion)(round);
        if (!round || !question)
            return;
        this.view = 'question';
        this.screen.paint((0, pages_1.questionPage)(question, round, this.revealed), { reveal: this.revealed });
        this.screen.status(`Q${round.at + 1}/${round.questions.length}  SCORE ${round.score}  R G Y C${this.settings.allowReveal ? '  V=Reveal' : ''}`);
    }
}
exports.QuizApp = QuizApp;
//# sourceMappingURL=app.js.map