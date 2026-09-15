"use strict";
/**
 * ERASER: rows the field marks, and you have to clear THOSE.
 *
 * Reference types 7 and 39 (`mission.c:1462-1506` marks them, `905-947`
 * judges them). Up to four rows are marked at the start of the mission and a
 * fresh set appears whenever every marked row has been cleared and the norm
 * is not met yet. A marked row only counts when the piece that just locked
 * OCCUPIED it - clearing it with a piece that landed elsewhere is not the
 * shot the mission asked for.
 *
 * The reference picks each row at random between `opt_1 + 1` and `opt_2 + 1`,
 * refuses duplicates, never marks more than four, and never marks more than
 * the norm still needs (`mission.c:1484-1487`). Its last remaining row is
 * pinned to the bottom of the band, so a mission cannot end on a row nobody
 * can reach.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_MARKED_ROWS = void 0;
exports.chooseMarkedRows = chooseMarkedRows;
exports.claimMarkedRows = claimMarkedRows;
/** The reference never marks more than four rows at a time. */
exports.MAX_MARKED_ROWS = 4;
/**
 * Choose the rows to mark.
 *
 * `remaining` is how many more the mission still needs, which caps the set:
 * marking three rows for a mission that needs one more would let a player
 * finish on a row that was never required.
 */
function chooseMarkedRows(pattern, remaining, height, random = Math.random) {
    const max = Math.min(pattern.max, height - 1);
    const min = Math.max(0, Math.min(pattern.min, max));
    const wanted = Math.max(0, Math.min(pattern.lines, exports.MAX_MARKED_ROWS, remaining));
    const rows = [];
    // The band may be narrower than the number of rows asked for, and a random
    // walk that cannot succeed must not spin: the candidates are enumerated.
    const candidates = [];
    for (let row = min; row <= max; row++)
        candidates.push(row);
    while (rows.length < wanted && candidates.length > 0) {
        const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
        rows.push(candidates.splice(index, 1)[0]);
    }
    return rows.sort((a, b) => a - b);
}
/**
 * Which marked rows a lock claimed.
 *
 * `mission.c:905-947` walks the four cells of the piece that just locked and
 * counts a marked row when the piece SAT IN it and the row is being erased.
 * A marked row cleared by a piece that landed elsewhere is not the shot the
 * mission asked for, and a row already claimed cannot be claimed twice.
 */
function claimMarkedRows(marked, occupiedRows, clearedRows) {
    const occupied = new Set(occupiedRows);
    const cleared = new Set(clearedRows);
    const claimed = marked.filter((row) => occupied.has(row) && cleared.has(row));
    return {
        claimed,
        remaining: marked.filter((row) => !claimed.includes(row)),
    };
}
//# sourceMappingURL=eraser.js.map