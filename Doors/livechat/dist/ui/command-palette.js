"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandPaletteItems = commandPaletteItems;
/**
 * THE SLASH-COMMAND PALETTE'S ROWS.
 *
 * Three fixed fields - a twelve-column name, a twenty-column usage, a
 * description with what is left - which is forty-five columns before the
 * list's own frame and selection marker. On an eighty-column screen that is
 * the palette; on a C64 every row wrapped onto a second one and was cut
 * mid-word: `/mode` over `Set channe`, `/msg` over `Send a dir` (the sysop,
 * 2026-09-22: "this is how the command palette looks, it looks broken").
 *
 * A caller reading a command list wants the COMMAND and what it does. The
 * usage belongs to the row he has selected, and at forty columns there is no
 * room for it beside the name, so the compact row drops it: `/mode Set
 * channel modes`, one command to a row, cut at the screen's edge rather than
 * at a column that assumes eighty.
 *
 * Pure, so both shapes are checked in a test instead of by opening a door.
 */
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
/** The eighty-column field widths, unchanged since the palette was written. */
const NAME_WIDTH = 12;
const USAGE_WIDTH = 20;
/** The list's frame and the `> ` it prints in front of the selected row. */
const LIST_CHROME = 4;
/**
 * One row per command, already tagged for blessed.
 *
 * `dim` is the theme colour the usage is printed in; at the compact tier no
 * usage is printed and the tag never appears.
 */
function commandPaletteItems(commands, cols, dim) {
    if ((0, bbs_door_sdk_1.isCompactWidth)(cols)) {
        const room = Math.max(8, cols - LIST_CHROME);
        return commands.map(cmd => {
            const head = `/${cmd.name}`;
            const desc = (cmd.description ?? '').trim();
            const row = desc ? `${head} ${desc}` : head;
            return row.slice(0, room);
        });
    }
    const descWidth = Math.max(10, cols - NAME_WIDTH - USAGE_WIDTH - 6);
    return commands.map(cmd => {
        const name = cmd.name.padEnd(NAME_WIDTH).slice(0, NAME_WIDTH);
        const usage = (cmd.usage || '').padEnd(USAGE_WIDTH).slice(0, USAGE_WIDTH);
        const desc = (cmd.description || '').slice(0, descWidth);
        return `/${name} {${dim}-fg}${usage}{/${dim}-fg} ${desc}`;
    });
}
