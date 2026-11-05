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
exports.ANSWER_KEYS = void 0;
exports.loadPacks = loadPacks;
exports.validatePack = validatePack;
exports.pickQuestions = pickQuestions;
exports.startRound = startRound;
exports.currentQuestion = currentQuestion;
exports.isFinished = isFinished;
exports.answer = answer;
exports.advance = advance;
exports.scoresPath = scoresPath;
exports.readScores = readScores;
exports.recordScore = recordScore;
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** The four answers are the four fastext keys, in packet 27 order. */
exports.ANSWER_KEYS = ['red', 'green', 'yellow', 'cyan'];
// --- Packs ---------------------------------------------------------------
/**
 * Read every question pack in a directory.
 *
 * A broken pack is reported and skipped. The sysop writes these by hand, so
 * "one bad file takes the door down" is not an acceptable failure.
 */
function loadPacks(dir) {
    let names;
    try {
        names = fs.readdirSync(dir).filter(name => name.toLowerCase().endsWith('.json')).sort();
    }
    catch {
        return { packs: [], errors: [] };
    }
    const packs = [];
    const errors = [];
    for (const name of names) {
        try {
            const raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
            packs.push(validatePack(raw, path.basename(name, '.json')));
        }
        catch (error) {
            errors.push({ file: name, message: error.message });
        }
    }
    return { packs, errors };
}
function validatePack(raw, fallbackId) {
    if (!raw || typeof raw !== 'object')
        throw new Error('not an object');
    const pack = raw;
    const questions = Array.isArray(pack.questions) ? pack.questions : [];
    if (questions.length === 0)
        throw new Error('holds no questions');
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
        questions: questions,
    };
}
/**
 * Pick the questions for one round.
 *
 * Shuffled without replacement, so a short pack never asks the same
 * question twice in a round; a pack shorter than the round length simply
 * makes a shorter round.
 */
function pickQuestions(pack, count, rng = Math.random) {
    const pool = [...pack.questions];
    for (let at = pool.length - 1; at > 0; at--) {
        const swap = Math.floor(rng() * (at + 1));
        [pool[at], pool[swap]] = [pool[swap], pool[at]];
    }
    return pool.slice(0, Math.max(1, Math.min(count, pool.length)));
}
function startRound(questions) {
    return { questions, at: 0, score: 0, streak: 0, bestStreak: 0, answers: [] };
}
function currentQuestion(round) {
    return round.questions[round.at] ?? null;
}
function isFinished(round) {
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
function answer(round, chose, scoring = true) {
    const question = currentQuestion(round);
    if (!question)
        return false;
    const correct = chose === question.correct;
    round.answers.push({ correct, chose });
    if (correct && scoring) {
        round.score++;
        round.streak++;
        round.bestStreak = Math.max(round.bestStreak, round.streak);
    }
    else {
        round.streak = 0;
    }
    return correct;
}
/** Move past the question that was just answered. */
function advance(round) {
    round.at++;
}
const SCORE_LIMIT = 15;
/**
 * Where scores live.
 *
 * `data/` under the door, because the deploy's image-to-volume sync
 * deliberately excludes every door's data directory - runtime state belongs
 * to the board, not to the image.
 */
function scoresPath(doorRoot) {
    return path.join(doorRoot, 'data', 'scores.json');
}
function readScores(doorRoot) {
    try {
        const raw = JSON.parse(fs.readFileSync(scoresPath(doorRoot), 'utf8'));
        return Array.isArray(raw) ? raw : [];
    }
    catch {
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
function recordScore(doorRoot, row) {
    const table = [...readScores(doorRoot), row]
        .sort((a, b) => b.score - a.score || b.bestStreak - a.bestStreak || a.at.localeCompare(b.at))
        .slice(0, SCORE_LIMIT);
    const target = scoresPath(doorRoot);
    try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const temporary = `${target}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(table, null, 2) + '\n', 'utf8');
        fs.renameSync(temporary, target);
    }
    catch (error) {
        // A board with a read-only door directory still plays; it just does not
        // remember. Losing the table is not worth losing the game over.
        console.error('[TeletextQuiz] could not write scores:', error.message);
    }
    return table;
}
//# sourceMappingURL=quiz.js.map