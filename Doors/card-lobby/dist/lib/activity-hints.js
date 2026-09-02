"use strict";
/**
 * What the ACTIVITY panel says about the moment, above the event log.
 *
 * Kept away from the door so the wording can be tested without a terminal,
 * and because the door had grown to the repo's 2000-line ceiling on the way
 * to writing it.
 *
 * The keys belong to the GAME being played: an UNO table was being shown
 * poker's "F Fold  X Check  C Call  R Raise" in a panel too narrow to hold
 * the line (reported 2026-09-02, with a screenshot).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildActivityHints = buildActivityHints;
const constants_1 = require("./constants");
function buildActivityHints(input) {
    const { viewMode, table, isUno, userId, engine } = input;
    if (viewMode !== 'table' || !table || !userId)
        return [];
    const lines = [];
    if (!engine) {
        const seated = table.players.filter((player) => player.role === 'player' && player.stack > 0);
        lines.push(seated.length < table.minPlayers
            ? `{${constants_1.UI_THEME.warning}-fg}Waiting for players to join...{/}`
            : `{${constants_1.UI_THEME.warning}-fg}Ready to deal. Press D or use Deal to start.{/}`);
    }
    else {
        const seat = engine.state.actionTo;
        if (seat === null || seat === undefined) {
            lines.push(`{${constants_1.UI_THEME.warning}-fg}Dealing in progress...{/}`);
        }
        else {
            const actor = engine.state.players[seat];
            if (actor?.id === userId) {
                lines.push(`{${constants_1.UI_THEME.warning}-fg}Your turn. Choose an action below.{/}`);
            }
            else if (actor?.name) {
                lines.push(`{${constants_1.UI_THEME.warning}-fg}Waiting for ${actor.name} to act...{/}`);
            }
        }
    }
    lines.push(isUno
        ? `{${constants_1.UI_THEME.dim}-fg}Keys: D Draw  L Leave{/}`
        : `{${constants_1.UI_THEME.dim}-fg}Keys: F Fold  X Check  C Call  R Raise  L Leave  D Deal{/}`);
    return lines;
}
