"use strict";
/**
 * MISSION mode - the data model.
 *
 * HeborisCE's mission mode is not a hardcoded list of levels: it loads PACKS
 * (`loadMissionData(mission_file)`, src/script/mission.c:47-171), each holding
 * thirty entries, and each entry is a row of fields the mission editor writes -
 * `mission_type` (which of its 42 objectives), `mission_norm` (how many),
 * `mission_time` (the clock), `mission_lv` (starting speed), `mission_end`
 * (which ending plays) and `mission_erase` (rows of garbage to start with, or
 * a rise rate when negative), plus up to three per-type options
 * (mission.c:182-265).
 *
 * This door keeps that shape - a pack of missions, each a row of fields - and
 * ships one pack as JSON so a sysop can write another without touching code.
 * What it does NOT keep is the 42-type list: an objective is only offered
 * here if this engine can actually judge it (see MISSION_OBJECTIVES), and the
 * loader rejects the rest by name instead of accepting a mission that can
 * never be completed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MISSION_OBJECTIVES = void 0;
/**
 * The objectives this engine can judge, each with the reference type it comes
 * from (mission_info.c's `mission_name_editor` list).
 */
exports.MISSION_OBJECTIVES = [
    'lines', // "Erase %d line(s)!"
    'single', // "Erase 1 line only %d time(s)!"
    'double', // "Erase 2 lines at once %d time(s)!"
    'triple', // "Erase 3 lines at once %d time(s)!"
    'tetris', // "Erase 4 lines at once %d time(s)!"
    'cycle', // "Do cycle! (all kinds of line erase)"
    'tspin', // "Erase the line by 3-corner T-SPIN %d time(s)!"
    'tspinDouble', // "Erase 2 lines at once by 3-corner T-SPIN %d time(s)!"
    'combo', // "Do %d combo(s)!"
    'allClear', // "Erase all blocks %d time(s)!"
    'pieces', // "Put %d block(s)!"
    'level', // "Clear %d stage(s)!" - this door counts levels
    'b2bTetris', // HEBORIS: "%d times! Do not erase 3 or less lines!"
    'survive', // "Do not top out!" - outlast the clock
];
//# sourceMappingURL=mission-types.js.map