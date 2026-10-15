"use strict";
/**
 * MISSION mode - the briefing.
 *
 * The select screen names a mission and its one-line hint; that is not enough
 * to play one. A mission carries an objective, a norm, a clock, a starting
 * speed, a stack of garbage and up to four rule changes, and the player meets
 * all of them at once when the first piece falls. This is the screen that
 * says so first.
 *
 * The text is built by a pure function so the wording can be tested without a
 * terminal - the same reason core/mission-run.ts judges away from the engine.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.missionObjectiveText = missionObjectiveText;
exports.missionConditions = missionConditions;
exports.missionBriefingLines = missionBriefingLines;
exports.pickMission = pickMission;
exports.showMissionBriefing = showMissionBriefing;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const mission_select_1 = require("./mission-select");
const door_theme_1 = require("../door-theme");
/** One sentence saying what the player has to do. */
/**
 * "with the T piece", and whether it has to have been held.
 *
 * The ORDER family is about the piece, so the briefing has to name it - a
 * player told only "clear two lines" will wonder why the clear did not count
 * (the reference's mission_opt_3 and its HOLD USE flag, mission.c:354-362).
 */
function by(mission) {
    const piece = mission.requiredPiece;
    if (!piece)
        return '';
    const named = piece === 'LJ' ? 'L or J piece'
        : piece === 'SZ' ? 'S or Z piece'
            : `${piece} piece`;
    return mission.requireHold
        ? ` with the ${named}, held first`
        : ` with the ${named}`;
}
function missionObjectiveText(mission) {
    const { objective, norm, timeLimitSeconds } = mission;
    const times = (n) => (n === 1 ? 'once' : `${n} times`);
    switch (objective) {
        case 'lines': return `Clear ${norm} lines. Any size counts.`;
        case 'single': return `Clear exactly one line, ${times(norm)}.`;
        case 'double': return `Clear two lines at once, ${times(norm)}.`;
        case 'triple': return `Clear three lines at once, ${times(norm)}.`;
        case 'tetris': return `Clear four lines at once, ${times(norm)}.`;
        case 'cycle': return 'Clear one line, two, three and four - one of each.';
        case 'tspin': return `Clear lines with a T-spin, ${times(norm)}.`;
        case 'tspinDouble': return `Clear two lines at once with a T-spin, ${times(norm)}.`;
        case 'combo': return `Reach a ${norm}-combo: clear on ${norm} pieces in a row.`;
        case 'allClear': return `Empty the whole board, ${times(norm)}.`;
        case 'pieces': return `Place ${norm} pieces without topping out.`;
        case 'level': return `Reach level ${norm}.`;
        case 'b2bTetris': return `Clear four lines at once ${times(norm)} in a row. `
            + 'A smaller clear resets the count.';
        case 'survive': return `Stay alive for ${timeLimitSeconds} seconds.`;
        case 'blockOrder': return `Clear ${norm} lines${by(mission)}.`;
        case 'singleOrder': return `Clear exactly one line${by(mission)}, ${times(norm)}.`;
        case 'doubleOrder': return mission.strictness === 'atLeast'
            ? `Clear two lines or more at once${by(mission)}, ${times(norm)}.`
            : `Clear two lines at once${by(mission)}, ${times(norm)}.`;
        case 'tripleOrder': return `Clear three lines at once${by(mission)}, ${times(norm)}.`;
        case 'reTripleOrder': {
            const piece = mission.requiredPiece;
            // 'LJ' and 'SZ' here are the reference's own special case: with a pair
            // named, every triple counts (mission.c:1044-1048).
            return piece === 'LJ' || piece === 'SZ'
                ? `Clear three lines at once, ${times(norm)}. Any piece.`
                : `Clear three lines at once with ANY piece but the ${piece}, ${times(norm)}.`;
        }
        case 'splitDouble': return `Clear two lines at once with at least one row `
            + `left between them, ${times(norm)}.`;
        case 'splitTriple': return `Clear three lines at once with a row left `
            + `between them, ${times(norm)}.`;
        case 'splitDouble2': return `Clear two lines at once with exactly two rows `
            + `left between them, ${times(norm)}.`;
        case 'square': return `Build a free-standing four-by-four block of `
            + `pieces, ${times(norm)}.`;
        case 'goldSquare': return `Build a four-by-four block of pieces, all of `
            + `one colour, ${times(norm)}.`;
        case 'eraser': return `Clear ${norm} marked row${norm === 1 ? '' : 's'} - `
            + 'the piece has to be IN the row it clears.';
        case 'eraserHeboris': return `Clear ${norm} marked row${norm === 1 ? '' : 's'} `
            + 'with four-line clears only.';
        case 'target': return `Clear ${times(norm)} the bright blocks off a `
            + 'stage that is already on the field.';
        default: return 'Play.';
    }
}
/** Every rule this mission changes, in the order a player meets them. */
function missionConditions(mission) {
    const conditions = [];
    if (mission.timeLimitSeconds > 0 && mission.objective !== 'survive') {
        conditions.push(`Time limit: ${(0, mission_select_1.formatClearTime)(mission.timeLimitSeconds)}`);
    }
    if (mission.startLevel > 0) {
        conditions.push(`Starts at level ${mission.startLevel}`);
    }
    if (mission.garbageRows > 0) {
        conditions.push(`${mission.garbageRows} rows of garbage to dig through`);
    }
    if (mission.modifiers.big) {
        conditions.push('BIG: every piece is twice the size');
    }
    if (mission.modifiers.hideNext) {
        conditions.push('HIDE NEXT: no preview of what is coming');
    }
    /*
     * The timings, in words a player can act on. 20G is the one that changes
     * how a piece is placed rather than how fast it falls, so it is named
     * outright; the rest are only worth saying when they are unusually tight.
     */
    if (mission.speed?.gravity !== undefined && mission.speed.gravity >= 20) {
        conditions.push('20G: every piece is on the floor the moment it appears');
    }
    else if (mission.speed?.gravity !== undefined) {
        conditions.push(`Gravity: ${mission.speed.gravity} cells a frame`);
    }
    if (mission.speed?.lockDelay !== undefined) {
        conditions.push(`Lock delay: ${mission.speed.lockDelay} frames`);
    }
    if (mission.speed?.are !== undefined) {
        conditions.push(`${mission.speed.are} frames between pieces`);
    }
    if (mission.speed?.das !== undefined) {
        conditions.push(`Delayed auto-shift: ${mission.speed.das} frames`);
    }
    if (mission.modifiers.rotateLock) {
        conditions.push('ROTATELOCK: pieces arrive turned, and cannot be turned');
    }
    if (mission.modifiers.xray) {
        conditions.push('X-RAY: one column of the stack is lit at a time');
    }
    if (mission.modifiers.oldStyle) {
        conditions.push('OLD STYLE: no hold, no back-to-back, and NEXT is a plain block');
    }
    if (mission.modifiers.color) {
        conditions.push('COLOR: the stack is a rolling rainbow, not its own colours');
    }
    if (mission.modifiers.mirror) {
        conditions.push('MIRROR: the stack flips left to right after every piece');
    }
    if (mission.modifiers.reverse) {
        conditions.push('REVERSE: left is right, and up is down');
    }
    if (mission.modifiers.blind) {
        conditions.push('BLIND: the stack is not drawn - it is still there');
    }
    if (mission.modifiers.riseEveryPieces) {
        conditions.push(`The floor rises one row every ${mission.modifiers.riseEveryPieces} pieces`);
    }
    if (mission.modifiers.hidden) {
        conditions.push('HIDDEN: locked blocks vanish - they are still there');
    }
    if (mission.modifiers.rollRoll) {
        conditions.push('ROLL ROLL: the piece turns by itself');
    }
    return conditions;
}
/**
 * The whole briefing as lines, ready to paint. Exported for the same reason
 * the pieces above are: what the player is told is worth a test.
 */
function missionBriefingLines(mission, clear) {
    const lines = [
        `{bold}{${door_theme_1.T.accent}-fg}${mission.name}{/${door_theme_1.T.accent}-fg}{/bold}`,
        '',
        `{${door_theme_1.T.ink}-fg}${missionObjectiveText(mission)}{/${door_theme_1.T.ink}-fg}`,
    ];
    const conditions = missionConditions(mission);
    if (conditions.length > 0) {
        lines.push('');
        for (const condition of conditions)
            lines.push(`{${door_theme_1.T.chrome}-fg}- ${condition}{/${door_theme_1.T.chrome}-fg}`);
    }
    if (mission.hint) {
        lines.push('', `{${door_theme_1.T.dim}-fg}${mission.hint}{/${door_theme_1.T.dim}-fg}`);
    }
    lines.push('');
    lines.push(clear
        ? `{${door_theme_1.T.ok}-fg}Cleared in ${(0, mission_select_1.formatClearTime)(clear.seconds)}{/${door_theme_1.T.ok}-fg}`
        : `{${door_theme_1.T.dim}-fg}Not cleared yet{/${door_theme_1.T.dim}-fg}`);
    return lines;
}
/**
 * Pick a mission and read its briefing, until the player either starts one or
 * leaves the pack.
 *
 * The loop lives here rather than in app.ts so it can be driven in a test:
 * backing out of a briefing has to return to the LIST, not to the menu, and
 * that is the part a player notices when it is wrong.
 */
async function pickMission(pack, clearFor, dialogs) {
    let showing = pack;
    for (;;) {
        const picked = await dialogs.select(showing);
        if (!picked)
            return null;
        if (picked === 'edit') {
            // No editor wired means nobody should have been able to ask - a
            // player's call has no `edit`. Leaving is the only answer that ends:
            // continuing would show the same screen, which would answer 'edit'
            // again, for ever.
            if (!dialogs.edit)
                return null;
            showing = await dialogs.edit(showing);
            continue;
        }
        if (await dialogs.brief(picked, clearFor(picked.id)))
            return picked;
    }
}
/**
 * Show the briefing. Resolves true to start the mission, false to go back to
 * the pack - the player has to be able to change their mind after reading
 * what they picked.
 */
async function showMissionBriefing(screen, mission, clear) {
    const lines = missionBriefingLines(mission, clear);
    return new Promise((resolve) => {
        const box = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 52,
            height: lines.length + 6,
            border: { type: 'line' },
            label: ' MISSION BRIEFING ',
            style: { bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.accent } },
            fixed: true,
            tags: true,
            content: lines.join('\n')
                + '\n\n{bold}ENTER{/bold} start    {bold}ESC{/bold} pick another',
            padding: { left: 2, right: 2, top: 1, bottom: 1 },
        });
        const finish = (start) => {
            screen.removeListener('keypress', onKey);
            box.destroy();
            screen.render();
            resolve(start);
        };
        const onKey = (_ch, key) => {
            const name = key?.name;
            if (name === 'enter' || name === 'return' || name === 'space')
                finish(true);
            else if (name === 'escape' || name === 'q')
                finish(false);
        };
        screen.on('keypress', onKey);
        screen.render();
    });
}
//# sourceMappingURL=mission-briefing.js.map