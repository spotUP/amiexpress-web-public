"use strict";
/**
 * The music: two user-supplied MODs, chosen by screen.
 *
 * Same suite shape as Super Qix's: the pure mapping, the server answering
 * from it, the assets actually shipped, and the client wiring asserted in
 * source - a music path that quietly plays nothing is the failure mode,
 * and none of these can hear anything, so they check everything that can
 * be checked without ears.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.theRoundAndItsInterludesKeepTheGameTrack = theRoundAndItsInterludesKeepTheGameTrack;
exports.everyOtherScreenPlaysTheTitleTrack = everyOtherScreenPlaysTheTitleTrack;
exports.theServerAnswersFromTheScreenItWasTold = theServerAnswersFromTheScreenItWasTold;
exports.bothModulesAreShippedAndAreRealProtrackerMods = bothModulesAreShippedAndAreRealProtrackerMods;
exports.theClientAsksAndTearsDown = theClientAsksAndTearsDown;
exports.theDoorSyncsFromBothChokepoints = theDoorSyncsFromBothChokepoints;
const assert_1 = __importDefault(require("assert"));
const fs_1 = require("fs");
const path_1 = require("path");
const music_select_1 = require("../music-select");
const server_1 = require("../server");
async function theRoundAndItsInterludesKeepTheGameTrack() {
    for (const state of ['playing', 'dying', 'levelComplete', 'paused']) {
        assert_1.default.strictEqual((0, music_select_1.trackForState)(state), music_select_1.IN_GAME_TRACK, state);
    }
}
async function everyOtherScreenPlaysTheTitleTrack() {
    for (const state of ['menu', 'gameover', 'highscores', 'enterName', 'help']) {
        assert_1.default.strictEqual((0, music_select_1.trackForState)(state), music_select_1.TITLE_TRACK, state);
    }
}
async function theServerAnswersFromTheScreenItWasTold() {
    (0, server_1.setMusicState)('menu');
    assert_1.default.strictEqual((await server_1.rpcHandlers.getMusicTrack()).track, music_select_1.TITLE_TRACK);
    (0, server_1.setMusicState)('playing');
    assert_1.default.strictEqual((await server_1.rpcHandlers.getMusicTrack()).track, music_select_1.IN_GAME_TRACK);
    (0, server_1.setMusicState)('menu'); // leave it where a fresh door starts
}
async function bothModulesAreShippedAndAreRealProtrackerMods() {
    for (const name of [music_select_1.IN_GAME_TRACK, music_select_1.TITLE_TRACK]) {
        const path = (0, path_1.join)(__dirname, '..', 'assets', name);
        assert_1.default.ok((0, fs_1.existsSync)(path), `${name} missing from assets/`);
        // A ProTracker MOD carries its magic at byte 1080; a truncated or
        // mis-copied file would play as silence.
        const fd = (0, fs_1.openSync)(path, 'r');
        const magic = Buffer.alloc(4);
        (0, fs_1.readSync)(fd, magic, 0, 4, 1080);
        (0, fs_1.closeSync)(fd);
        assert_1.default.strictEqual(magic.toString('latin1'), 'M.K.', `${name} magic`);
    }
}
async function theClientAsksAndTearsDown() {
    const client = (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '..', 'client.ts'), 'utf8');
    assert_1.default.ok(/door\.rpc\("getMusicTrack"/.test(client), 'the client polls the door');
    assert_1.default.ok(/\/api\/doors\/PENGO\/assets\//.test(client), 'and fetches this door\'s assets');
    assert_1.default.ok(/stopMusic\(\);/.test(client), 'and stops the music on teardown');
}
async function theDoorSyncsFromBothChokepoints() {
    const index = (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '..', 'index.ts'), 'utf8');
    const calls = (index.match(/syncMusicState\(\);/g) || []).length;
    assert_1.default.ok(calls >= 2, 'state must sync from the input handler AND the game loop - transitions ' +
        'happen in both, and covering them one by one is how one gets missed');
}
//# sourceMappingURL=music.test.js.map