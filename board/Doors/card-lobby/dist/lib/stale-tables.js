"use strict";
/**
 * TABLES THAT NOBODY IS AT GO AWAY.
 *
 * "stale games needs to be cleared from the lobby" (sysop, 2026-09-16).
 * Nothing ever removed a table, so they accumulated for as long as the board
 * has been up: the lobby found on 2026-09-15 held 120 of them, and a caller
 * looking for a game had to read past every table anyone had ever opened.
 *
 * WHAT CAN ACTUALLY BE KNOWN. The lobby stores no presence - there is no
 * heartbeat, and a profile keeps its `currentTableId` after the caller's line
 * drops - so "is anyone there?" cannot be asked directly. Two things CAN be
 * read off the stored state, and they are the two rules:
 *
 *   NO HUMAN IS SEATED. A table exists because somebody opened it; when the
 *   last human leaves, what is left is bots playing to an empty room -
 *   "ai players needs to count as nobody in this case" (sysop, 2026-09-16).
 *   That is stale the moment it happens, with one exception: a hand still in
 *   progress is left to the clock below rather than swept out from under
 *   itself. Nothing drives those bots without a door watching them, so a
 *   bots-only table mid-hand goes half an hour later regardless - it is
 *   bounded either way, and this way a game is never deleted while it is
 *   being played.
 *
 *   NOBODY HAS TOUCHED IT. Every action at a table stamps `updatedAt`, and a
 *   live door refreshes the tables it can see - so a table that has gone
 *   quiet for half an hour has no door watching it. Long enough that two
 *   players thinking hard are never mistaken for an empty room.
 *
 * And one thing that is never pruned whatever the clock says: the table the
 * caller doing the pruning is sitting at. A player who steps away from the
 * keyboard mid-hand must not come back to a lobby that has forgotten their
 * game.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STALE_AFTER_MS = void 0;
exports.pruneStaleTables = pruneStaleTables;
exports.describePruned = describePruned;
const utils_1 = require("./utils");
/** How long a table may go untouched before it is considered abandoned. */
exports.STALE_AFTER_MS = 30 * 60 * 1000;
/** Is anybody human sitting at this table? */
function hasHumanPlayer(table) {
    return table.players.some((player) => player.role === 'player' && !(0, utils_1.isBotPlayer)(player));
}
/**
 * Split a lobby into the tables worth keeping and the ones that are finished
 * with.
 *
 * Pure: it is handed the clock rather than reading one, so the rules can be
 * asked a question in a test without waiting half an hour.
 */
function pruneStaleTables(tables, options) {
    const staleAfter = options.staleAfterMs ?? exports.STALE_AFTER_MS;
    const kept = [];
    const removed = [];
    for (const table of tables) {
        // Never the caller's own table, whatever the clock says.
        if (options.keepTableId !== undefined && table.id === options.keepTableId) {
            kept.push(table);
            continue;
        }
        const untouchedFor = options.now - (table.updatedAt ?? table.createdAt ?? options.now);
        const abandoned = !hasHumanPlayer(table) && !table.hand;
        const forgotten = untouchedFor >= staleAfter;
        if (abandoned || forgotten)
            removed.push(table);
        else
            kept.push(table);
    }
    return { kept, removed };
}
/** How a pruned table reads in the log. */
function describePruned(table) {
    return `#${table.id} ${table.gameName}`;
}
