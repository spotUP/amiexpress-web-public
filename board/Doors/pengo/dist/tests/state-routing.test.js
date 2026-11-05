"use strict";
/**
 * The main input switch in index.ts must not quit to the menu during a
 * timed animation hand-over.
 *
 * Reported: "the game ends after level 1". `GameState` has nine members
 * (menu, playing, dying, levelComplete, gameover, highscores, enterName,
 * paused, help) but the switch only handled seven - `dying` and
 * `levelComplete` fell through to `default: showMenu()`. Both states are
 * entered by PengoGame itself and left on a timer (dying via
 * pengo.isDead/deathFrame counted up in update(); levelComplete via the
 * setTimeout in update() that flips state back to 'playing' after 2000ms).
 * A keypress landing during that window used to drop the player straight to
 * the main menu, which reads exactly like the game ending after level 1.
 *
 * index.ts wires blessed widgets and a live Door at module scope (see
 * `door.onStart` / `new Screen(...)`), so - same as menu.test.ts - these
 * assertions read the switch as source text rather than importing and
 * driving it, to avoid constructing a real Door/Screen in the test process.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.levelCompleteIgnoresInputInsteadOfQuittingToMenu = levelCompleteIgnoresInputInsteadOfQuittingToMenu;
exports.dyingIgnoresInputInsteadOfQuittingToMenu = dyingIgnoresInputInsteadOfQuittingToMenu;
exports.theDefaultCaseIsExhaustivenessNotAMenuBailout = theDefaultCaseIsExhaustivenessNotAMenuBailout;
exports.everyOtherRouteIsUnchanged = everyOtherRouteIsUnchanged;
exports.gameStateIsImportedForTheExhaustivenessCheck = gameStateIsImportedForTheExhaustivenessCheck;
const assert_1 = __importDefault(require("assert"));
const fs_1 = require("fs");
const path_1 = require("path");
function indexSource() {
    return (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '..', 'index.ts'), 'utf8');
}
/** Strips `//` line comments, so an explanatory comment mentioning a call
 *  by name (e.g. "used to call showMenu()") cannot fool a source assertion
 *  about the actual code. */
function stripLineComments(text) {
    return text
        .split('\n')
        .map(line => line.replace(/\/\/.*$/, ''))
        .join('\n');
}
/** Pulls the body of the `switch (gameData.state) { ... }` block. */
function switchBody(src) {
    const start = src.indexOf('switch (gameData.state)');
    assert_1.default.ok(start >= 0, 'handleInput must still route on gameData.state');
    // Balance braces from the switch's opening brace to find its matching close.
    const openBrace = src.indexOf('{', start);
    let depth = 0;
    for (let i = openBrace; i < src.length; i++) {
        if (src[i] === '{')
            depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0)
                return src.slice(openBrace, i + 1);
        }
    }
    throw new Error('unbalanced switch block');
}
/**
 * A keypress during 'levelComplete' must not fall through to the menu.
 *
 * The game itself owns the transition back to 'playing' (the setTimeout in
 * PengoGame.update()); routing player input here has nothing to do and must
 * not touch gameData.state.
 */
async function levelCompleteIgnoresInputInsteadOfQuittingToMenu() {
    const body = switchBody(indexSource());
    const caseMatch = body.match(/case "dying":\s*\n\s*case "levelComplete":\s*\n([\s\S]*?)\n\s*(?:case |default)/);
    assert_1.default.ok(caseMatch, '"dying" and "levelComplete" must be handled as one explicit case group');
    const caseBody = stripLineComments(caseMatch[1]);
    assert_1.default.ok(!/showMenu\(\)/.test(caseBody), 'a keypress during levelComplete (or dying) must not call showMenu() - that quits to the ' +
        'main menu mid-handover, which is the reported bug');
    assert_1.default.ok(!/gameData\.state\s*=/.test(caseBody), 'input routing for these states must not itself change gameData.state - only the timed ' +
        'hand-over in PengoGame.update() may do that');
    assert_1.default.ok(/break;/.test(caseBody), 'the case must terminate, not fall through further');
}
/** Same guarantee, spelled out for the death animation on its own. */
async function dyingIgnoresInputInsteadOfQuittingToMenu() {
    const body = switchBody(indexSource());
    assert_1.default.ok(/case "dying":\s*\n\s*case "levelComplete":/.test(body), '"dying" must route through the same input-ignoring case as "levelComplete"');
}
/**
 * The catch-all must be a compile-time exhaustiveness guard, not a runtime
 * "go to the menu" for whatever state didn't get an explicit case - that
 * destructive default is what turned the missing dying/levelComplete cases
 * into "the game ends after level 1" instead of a typecheck failure.
 */
async function theDefaultCaseIsExhaustivenessNotAMenuBailout() {
    const body = switchBody(indexSource());
    assert_1.default.ok(/default:\s*\{[\s\S]*const _exhaustive: never = gameData\.state;/.test(body), 'the default case must assign gameData.state to a `never`-typed const, so adding a new ' +
        'GameState member without a case above fails the typecheck');
    const defaultMatch = body.match(/default:\s*\{([\s\S]*)\}\s*$/);
    assert_1.default.ok(defaultMatch, 'the default case must be present');
    assert_1.default.ok(!/showMenu\(\)/.test(stripLineComments(defaultMatch[1])), 'the default case must not call showMenu() - an unreachable/unknown state must be a safe ' +
        'no-op, not a forced trip to the main menu mid-game');
}
/**
 * Every other route the switch drove before this fix must still drive the
 * same handler, in the same case, unchanged. This fix is about two missing
 * cases, not a rewrite of the router.
 */
async function everyOtherRouteIsUnchanged() {
    const body = switchBody(indexSource());
    assert_1.default.ok(/case "menu":\s*\n\s*handleMenuInput\(inputKey\);/.test(body), 'menu -> handleMenuInput');
    assert_1.default.ok(/case "highscores":\s*\n\s*case "help":\s*\n\s*showMenu\(\);/.test(body), 'highscores/help -> showMenu (any key returns to the menu from these screens)');
    assert_1.default.ok(/case "playing":\s*\n\s*handleGameInput\(inputKey\);/.test(body), 'playing -> handleGameInput');
    assert_1.default.ok(/case "paused":\s*\n\s*handlePausedInput\(inputKey\);/.test(body), 'paused -> handlePausedInput');
    assert_1.default.ok(/case "gameover":\s*\n\s*handleGameOverInput\(inputKey\);/.test(body), 'gameover -> handleGameOverInput');
    assert_1.default.ok(/case "enterName":\s*\n\s*handleNameEntryInput\(inputKey\);/.test(body), 'enterName -> handleNameEntryInput');
}
/** GameState must be imported so the exhaustiveness check can reference it. */
async function gameStateIsImportedForTheExhaustivenessCheck() {
    const src = indexSource();
    assert_1.default.ok(/import\s*\{[^}]*\bGameState\b[^}]*\}\s*from\s*"\.\/game\/types"/.test(src), 'the never-check needs GameState in scope (or the assignment type-checks vacuously)');
}
//# sourceMappingURL=state-routing.test.js.map