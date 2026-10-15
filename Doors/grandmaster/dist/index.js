"use strict";
/**
 * GRANDMASTER - TGM3-Inspired Multiplayer Tetris
 *
 * A next-generation Tetris experience for BBS featuring:
 * - Authentic TGM3 mechanics (20G gravity, IRS/IHS, lock delay)
 * - Full grading system (9 -> S13 -> m9 -> GM)
 * - Real-time multiplayer with garbage attacks
 * - 14 game modes including Battle Royale
 * - 4 rotation systems (SRS, ARS, NRS, BARS)
 * - AI opponents with 10 difficulty levels
 *
 * Commands:
 *   GMASTER           - Launch (main menu)
 *   GMASTER MASTER    - Master mode solo
 *   GMASTER VERSUS    - Multiplayer lobby
 *   GMASTER SPRINT    - 40-line sprint
 *   GMASTER STATS     - Your statistics
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = exports.metadata = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
Object.defineProperty(exports, "createApp", { enumerable: true, get: function () { return app_1.createApp; } });
/**
 * Metadata
 */
exports.metadata = {
    name: 'GRANDMASTER',
    version: '1.0.0',
    description: 'TGM3-Inspired Multiplayer Tetris',
    author: 'AmiExpress SDK',
    command: 'GMASTER',
};
/**
 * Main door class
 */
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
door.onStart(async (ctx) => {
    const session = ctx;
    const args = session.params || [];
    const mode = args[0]?.toUpperCase();
    // Create and run the app
    await (0, app_1.createApp)(session, mode);
});
exports.default = door;
//# sourceMappingURL=index.js.map