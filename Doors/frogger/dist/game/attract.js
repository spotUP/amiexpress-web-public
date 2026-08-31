"use strict";
/**
 * Frogger - Attract mode
 *
 * What the cabinet shows when nobody is playing: the title over the point
 * table, then the score ranking, then the invitation to play, then the
 * machine playing itself. Any key drops out of it into the menu.
 *
 * The panels are built here as plain lines of tagged text so they can be
 * asserted without a terminal attached.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ATTRACT_BLINK_FRAMES = exports.ATTRACT_FRAMES = exports.ATTRACT_ORDER = void 0;
exports.titleGrid = titleGrid;
exports.titleLines = titleLines;
exports.pointTablePanel = pointTablePanel;
exports.rankingPanel = rankingPanel;
exports.invitePanel = invitePanel;
exports.creditLine = creditLine;
exports.attractScreen = attractScreen;
exports.nextPhase = nextPhase;
const constants_1 = require("./constants");
exports.ATTRACT_ORDER = ['points', 'ranking', 'invite', 'demo'];
/** How long each panel stays up, in game ticks (20 per second). */
exports.ATTRACT_FRAMES = {
    points: 140,
    ranking: 140,
    invite: 100,
    demo: 600,
};
/** How fast the invitation blinks, in ticks per state. */
exports.ATTRACT_BLINK_FRAMES = 10;
/**
 * The title, drawn as a block font.
 *
 * '#' is the letter, and a yellow edge is laid down one column to the right
 * of every stroke, which is the shading the arcade logo has.
 */
const LETTERS = {
    F: ['######', '##....', '#####.', '##....', '##....'],
    R: ['#####.', '##..##', '#####.', '##.##.', '##..##'],
    O: ['.####.', '##..##', '##..##', '##..##', '.####.'],
    G: ['.####.', '##....', '##.###', '##..##', '.####.'],
    E: ['######', '##....', '#####.', '##....', '######'],
};
const TITLE = 'FROGGER';
const LETTER_WIDTH = 6;
const LETTER_GAP = 3; // two clear columns once the shading has taken one
/**
 * The title as a grid of cells: '#' for the face of the letter, '+' for the
 * shaded edge, ' ' for nothing.
 */
function titleGrid() {
    const width = TITLE.length * (LETTER_WIDTH + LETTER_GAP);
    const rows = 5;
    const grid = [];
    for (let r = 0; r < rows; r++)
        grid.push(new Array(width + 1).fill(' '));
    TITLE.split('').forEach((ch, i) => {
        const glyph = LETTERS[ch];
        const left = i * (LETTER_WIDTH + LETTER_GAP);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < LETTER_WIDTH; c++) {
                if (glyph[r][c] !== '#')
                    continue;
                // The shaded edge first, so the face always wins where they meet.
                if (grid[r][left + c + 1] === ' ')
                    grid[r][left + c + 1] = '+';
                grid[r][left + c] = '#';
            }
        }
    });
    return grid.map(row => row.join('').replace(/\s+$/, ''));
}
/**
 * The title, painted as blocks of background colour rather than as '#'
 * characters: a green face with the arcade logo's yellow shading beside it.
 *
 * Drawn the way the board is drawn, so the letters read as solid shapes on
 * a terminal instead of as a wall of punctuation.
 */
function titleLines(width) {
    return titleGrid().map(row => {
        let out = '';
        let run = 0;
        let colour = '';
        const flush = () => {
            if (!run)
                return;
            out += colour
                ? `{${colour}-bg}${' '.repeat(run)}{/${colour}-bg}`
                : ' '.repeat(run);
            run = 0;
        };
        for (const cell of row) {
            const next = cell === '#' ? 'green' :
                cell === '+' ? 'yellow' : '';
            if (next !== colour) {
                flush();
                colour = next;
            }
            run++;
        }
        flush();
        const pad = Math.max(0, Math.floor((width - row.length) / 2));
        return ' '.repeat(pad) + out;
    });
}
/** Centre a plain string in `width` columns, then colour it. */
function centred(text, width, colour) {
    const pad = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(pad) + `{${colour}-fg}${text}{/}`;
}
/**
 * The point table (FAQ 6.3), in the arcade's own wording and colours: the
 * headline of each rule in yellow, its qualifier under it in red.
 */
function pointTablePanel(width) {
    return [
        centred('-POINT TABLE-', width, 'white'),
        '',
        centred(`${constants_1.SCORES.hop} PTS FOR EACH STEP`, width, 'yellow'),
        '',
        centred(`${constants_1.SCORES.home} PTS FOR EVERY FROG`, width, 'yellow'),
        centred('ARRIVED HOME SAFELY', width, 'red'),
        '',
        centred(`${constants_1.SCORES.levelComplete} PTS BY SAVING FROGS`, width, 'yellow'),
        centred('INTO FIVE HOMES', width, 'red'),
        '',
        centred('PLUS BONUS', width, 'yellow'),
        centred(`${constants_1.SCORES.timeBonus} PTS X REMAINING SECOND`, width, 'red'),
    ];
}
const PLACES = ['1 ST', '2 ND', '3 RD', '4 TH', '5 TH'];
/** The score ranking, top five, highest first. */
function rankingPanel(data, width) {
    const top = [...data.highscores]
        .sort((a, b) => b.score - a.score)
        .slice(0, PLACES.length);
    const rows = PLACES.map((place, i) => {
        const score = top[i]?.score ?? 0;
        const text = `${place}   ${score.toString().padStart(5, '0')} PTS`;
        return centred(text, width, 'white');
    });
    return [centred('SCORE RANKING', width, 'yellow'), '', ...rows];
}
/**
 * The invitation.
 *
 * The cabinet asks for a coin and says how many frogs that buys. A BBS door
 * has no coin slot, so it asks for a key instead, and the count follows the
 * lives setting rather than being fixed.
 */
function invitePanel(data, width, blinkOn) {
    const frogs = constants_1.LIVES_OPTIONS.includes(data.startingLives)
        ? data.startingLives
        : constants_1.LIVES_OPTIONS[0];
    return [
        '',
        '',
        blinkOn ? centred('PRESS ANY KEY', width, 'green') : '',
        '',
        '',
        '',
        centred(`${frogs} FROGS PER PLAYER`, width, 'yellow'),
    ];
}
/** The credit line under every panel. */
function creditLine(width) {
    // Not "KONAMI (C) 1981" as the cabinet has it: this is a port, and
    // stamping somebody else's copyright notice on it would be a lie. The
    // credit is theirs, the code is not.
    return centred('ORIGINAL BY KONAMI 1981', width, 'white');
}
/**
 * One attract screen, ready to render.
 *
 * `demo` has no panel of its own - the machine plays the game instead, and
 * the caller renders the board.
 */
function attractScreen(phase, data, width, frame) {
    if (phase === 'demo')
        return [];
    const blinkOn = Math.floor(frame / exports.ATTRACT_BLINK_FRAMES) % 2 === 0;
    const body = phase === 'points' ? pointTablePanel(width) :
        phase === 'ranking' ? rankingPanel(data, width) :
            invitePanel(data, width, blinkOn);
    return [...titleLines(width), '', ...body, '', creditLine(width)];
}
/** The phase that follows this one. */
function nextPhase(phase) {
    const i = exports.ATTRACT_ORDER.indexOf(phase);
    return exports.ATTRACT_ORDER[(i + 1) % exports.ATTRACT_ORDER.length];
}
//# sourceMappingURL=attract.js.map