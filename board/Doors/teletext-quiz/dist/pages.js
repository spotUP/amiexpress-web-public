"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANSWER_LABELS = exports.ANSWER_COLORS = void 0;
exports.titlePage = titlePage;
exports.questionPage = questionPage;
exports.resultPage = resultPage;
exports.finalPage = finalPage;
exports.messagePage = messagePage;
exports.fit = fit;
exports.wrap = wrap;
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
const compose_1 = require("@amiexpress/bbs-door-sdk/teletext/compose");
/** Red, green, yellow, cyan - the four keys, in packet 27 order. */
exports.ANSWER_COLORS = ['red', 'green', 'yellow', 'cyan'];
exports.ANSWER_LABELS = ['RED', 'GREEN', 'YELLOW', 'CYAN'];
const WIDTH = 40;
function titlePage(packTitle, questions, best) {
    const page = new compose_1.PageBuilder()
        .write(1, 0, 'QUIZ', { fg: 'yellow', doubleHeight: true })
        .write(3, 0, wrap(packTitle, 38)[0] ?? '', { fg: 'white' })
        .write(5, 0, `${questions} questions. Four answers each.`, { fg: 'white' })
        .write(6, 0, 'Answer with the colour keys:', { fg: 'white' })
        .write(8, 1, 'R', { fg: 'red' })
        .write(8, 4, 'G', { fg: 'green' })
        .write(8, 7, 'Y', { fg: 'yellow' })
        .write(8, 10, 'C', { fg: 'cyan' })
        .write(10, 0, 'V reveals the answer - but a revealed', { fg: 'white' })
        .write(11, 0, 'question does not score.', { fg: 'white' });
    if (best) {
        page.write(14, 0, 'BEST SO FAR', { fg: 'cyan' });
        page.write(15, 0, `${fitName(best.username)} ${best.score}/${best.outOf}`, { fg: 'white' });
    }
    page.write(18, 0, 'Press SPACE to start.', { fg: 'green' });
    return page.subpage();
}
function questionPage(question, round, revealed) {
    const page = new compose_1.PageBuilder();
    page.write(0, 0, `QUESTION ${round.at + 1} OF ${round.questions.length}`, { fg: 'cyan' });
    page.write(1, 0, `SCORE ${round.score}`, { fg: 'white' });
    wrap(question.question, 38).slice(0, 3).forEach((line, at) => {
        page.write(3 + at, 0, line, { fg: 'yellow' });
    });
    question.answers.forEach((answer, at) => {
        const row = 8 + at * 2;
        page.write(row, 0, `${exports.ANSWER_LABELS[at].padEnd(7)}${fit(answer, 30)}`, {
            fg: exports.ANSWER_COLORS[at],
        });
    });
    // The answer rides on the page, concealed, exactly as a teletext quiz
    // carried it - reveal is a decoder function, not a second page.
    page.write(17, 0, 'ANSWER: ', { fg: 'white' });
    page.write(17, 8, fit(question.answers[question.correct], 28), {
        fg: 'white',
        conceal: !revealed,
    });
    if (revealed)
        page.write(19, 0, 'Revealed - this one does not score.', { fg: 'magenta' });
    return page.subpage();
}
function resultPage(question, chose, correct, round) {
    const page = new compose_1.PageBuilder()
        .write(1, 0, correct ? 'CORRECT' : 'WRONG', {
        fg: correct ? 'green' : 'red',
        doubleHeight: true,
    })
        .write(4, 0, 'YOU SAID', { fg: 'white' })
        .write(5, 0, fit(question.answers[chose], 38), { fg: exports.ANSWER_COLORS[chose] });
    if (!correct) {
        page.write(7, 0, 'THE ANSWER WAS', { fg: 'white' });
        page.write(8, 0, fit(question.answers[question.correct], 38), { fg: 'green' });
    }
    if (question.note) {
        wrap(question.note, 38).slice(0, 4).forEach((line, at) => {
            page.write(11 + at, 0, line, { fg: 'cyan' });
        });
    }
    page.write(17, 0, `SCORE ${round.score} OF ${round.answers.length}`, { fg: 'white' });
    if (round.streak >= 3)
        page.write(18, 0, `${round.streak} IN A ROW`, { fg: 'yellow', flash: true });
    page.write(20, 0, 'Press SPACE to go on.', { fg: 'green' });
    return page.subpage();
}
function finalPage(round, table, username) {
    const total = round.questions.length;
    const page = new compose_1.PageBuilder()
        .write(1, 0, 'FINISHED', { fg: 'yellow', doubleHeight: true })
        .write(4, 0, `${round.score} OUT OF ${total}`, { fg: 'white' })
        .write(5, 0, verdict(round.score, total), { fg: 'cyan' });
    if (round.bestStreak > 1) {
        page.write(6, 0, `Best run: ${round.bestStreak} in a row`, { fg: 'white' });
    }
    page.write(8, 0, 'HIGH SCORES', { fg: 'green' });
    table.slice(0, 8).forEach((row, at) => {
        const mine = row.username === username && row.score === round.score;
        page.write(10 + at, 0, `${String(at + 1).padStart(2)} ${fitName(row.username)} ${String(row.score).padStart(2)}/${row.outOf}`, { fg: mine ? 'yellow' : 'white' });
    });
    page.write(20, 0, 'SPACE plays again. Q leaves.', { fg: 'green' });
    return page.subpage();
}
function messagePage(title, lines, color = 'white') {
    const page = new compose_1.PageBuilder().write(1, 0, fit(title, 30), { fg: color, doubleHeight: true });
    lines.slice(0, 14).forEach((line, at) => page.write(4 + at, 0, fit(line, 39), { fg: 'white' }));
    return page.subpage();
}
function verdict(score, total) {
    if (total === 0)
        return '';
    const share = score / total;
    if (share === 1)
        return 'Every one. Nothing left to ask.';
    if (share >= 0.75)
        return 'Comfortably past the pub quiz line.';
    if (share >= 0.5)
        return 'Respectable.';
    if (share > 0)
        return 'Room to grow.';
    return 'Bold strategy.';
}
function fitName(name) {
    return fit(name, 12).padEnd(12);
}
function fit(text, width) {
    return text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + '.';
}
/** Break text onto 40-column lines without cutting words in half. */
function wrap(text, width = WIDTH) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        if (!line) {
            line = word;
        }
        else if (line.length + 1 + word.length <= width) {
            line += ` ${word}`;
        }
        else {
            lines.push(line);
            line = word;
        }
    }
    if (line)
        lines.push(line);
    return lines.length > 0 ? lines : [''];
}
//# sourceMappingURL=pages.js.map