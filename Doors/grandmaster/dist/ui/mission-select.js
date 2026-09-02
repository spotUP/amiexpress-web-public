"use strict";
/**
 * MISSION mode - the select screen.
 *
 * Free selection: every mission in the pack is playable from the start, and
 * the list doubles as a progress board - a cleared mission shows its best
 * time. HeborisCE's own mission screen is a browser over a pack too
 * (mission.c:47-171 walks the entries with the same left/right keys).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatClearTime = formatClearTime;
exports.missionRows = missionRows;
exports.showMissionSelect = showMissionSelect;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
/** mm:ss for a clear time. */
function formatClearTime(seconds) {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
/**
 * One row per mission: number, name, objective, and the best time if this
 * player has cleared it. Exported so a test can assert what the list SAYS
 * without building a terminal.
 */
function missionRows(pack, clears) {
    return pack.missions.map((mission, index) => {
        const cleared = clears[mission.id];
        const mark = cleared ? `{green-fg}[${formatClearTime(cleared.seconds)}]{/green-fg}` : '{gray-fg}[  -  ]{/gray-fg}';
        const number = String(index + 1).padStart(2, '0');
        return `${number}  ${mission.name.padEnd(16).slice(0, 16)}  ${mark}`;
    });
}
/**
 * Show the pack and return the chosen mission, or null if the player quit.
 */
async function showMissionSelect(screen, pack, progress, playerName) {
    const clears = progress.getClears(playerName, pack.name);
    const rows = missionRows(pack, clears);
    const done = Object.keys(clears).length;
    return new Promise((resolve) => {
        const box = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 46,
            height: Math.min(rows.length, 14) + 6,
            border: { type: 'line' },
            label: ` MISSIONS - ${pack.name} (${done}/${pack.missions.length}) `,
            style: { bg: 'black', border: { fg: 'cyan' } },
            fixed: true,
            tags: true,
        });
        const hint = (0, blessed_helpers_1.createBox)({
            // One row of text: a frame would leave nowhere to put it.
            border: undefined,
            parent: box,
            bottom: 1,
            left: 1,
            width: 42,
            height: 1,
            tags: true,
            style: { fg: 'gray' },
            content: pack.missions[0]?.hint ?? '',
        });
        const list = (0, blessed_helpers_1.createList)({
            parent: box,
            top: 1,
            left: 1,
            width: 42,
            height: Math.min(rows.length, 14) + 2,
            keys: true,
            vi: true,
            mouse: true,
            tags: true,
            scrollable: true,
            alwaysScroll: true,
            style: {
                selected: { bg: 'blue', fg: 'white' },
                item: { fg: 'white' },
            },
            items: rows,
        });
        const close = (mission) => {
            list.destroy();
            hint.destroy();
            box.destroy();
            screen.render();
            resolve(mission);
        };
        list.on('select item', (_item, index) => {
            hint.setContent(pack.missions[index]?.hint ?? '');
            screen.render();
        });
        list.key(['enter', 'return'], () => {
            const index = list.selected ?? 0;
            close(pack.missions[index] ?? null);
        });
        list.key(['escape', 'q'], () => close(null));
        list.focus();
        screen.render();
    });
}
//# sourceMappingURL=mission-select.js.map