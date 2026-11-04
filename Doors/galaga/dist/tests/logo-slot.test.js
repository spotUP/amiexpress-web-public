"use strict";
/**
 * REACHABILITY: the artist's logo file reaches the screen through the door's
 * real entry point (Door.execute -> door.onStart -> showMenu -> renderMenu ->
 * sessionLogoRows -> blessed -> ctx.output -> socket).
 *
 * The sdk tests prove the reader; only this proves Galaga calls it. The
 * sentinel is a string no part of the figlet logo or the menu contains.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.artist_logo_file_reaches_the_screen_through_door_start = artist_logo_file_reaches_the_screen_through_door_start;
const assert_1 = __importDefault(require("assert"));
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const DOOR_DIR = (0, path_1.join)(__dirname, '..');
const ART_DIR = (0, path_1.join)(DOOR_DIR, 'art');
const SENTINEL = 'ZXQ-ARTIST-LOGO-7731';
async function artist_logo_file_reaches_the_screen_through_door_start() {
    assert_1.default.ok(!(0, fs_1.existsSync)(ART_DIR), 'refusing to run over a real art/ folder');
    const sent = [];
    const socket = {
        emit: (_event, data) => { if (typeof data === 'string')
            sent.push(data); },
        on: () => socket, off: () => socket, once: () => socket, removeListener: () => socket,
        removeAllListeners: () => socket,
    };
    const bbsSession = { nodeId: 1, screenWidth: 80 };
    // Door storage goes to a scratch board, not into the checkout.
    const board = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'galaga-logo-'));
    const priorBoard = process.env.BBS_DATA_DIR;
    // Storage only honours a data dir named `bbs`.
    process.env.BBS_DATA_DIR = (0, path_1.join)(board, 'bbs');
    (0, fs_1.mkdirSync)(ART_DIR);
    try {
        (0, fs_1.writeFileSync)((0, path_1.join)(ART_DIR, 'logo.ans'), `${SENTINEL}\r\nsecond row\r\n`);
        const { default: door } = await import('../index.js');
        // execute() stays in the input loop until the door closes; the menu is
        // drawn by then, so do not await it.
        void door.execute({ socket, bbsSession, user: { id: 'logo-slot-test' }, params: [] }).catch(() => undefined);
        for (let i = 0; i < 100 && !sent.join('').includes('Classic 1981'); i++) {
            await new Promise((r) => setTimeout(r, 50));
        }
        const screen = sent.join('');
        assert_1.default.ok(screen.includes('Classic 1981'), 'the menu never reached the screen');
        assert_1.default.ok(screen.includes(SENTINEL), 'the artist logo file did not reach the screen');
        assert_1.default.ok(!screen.includes('/ ___| __ _| |'), 'the code figlet drew although a logo file exists');
    }
    finally {
        (0, fs_1.rmSync)(ART_DIR, { recursive: true, force: true });
        (0, fs_1.rmSync)(board, { recursive: true, force: true });
        if (priorBoard === undefined)
            delete process.env.BBS_DATA_DIR;
        else
            process.env.BBS_DATA_DIR = priorBoard;
    }
}
//# sourceMappingURL=logo-slot.test.js.map