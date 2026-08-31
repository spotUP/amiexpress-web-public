"use strict";
/**
 * The menu has to be navigable, and has to fit on the screen.
 *
 * Reported with a screenshot: "i cant navigate the menu in pengo and it's
 * offset to the left" - the title showed as "ngo" and every item was clipped.
 *
 * Two independent faults:
 *
 *   - The menu was a blessed List parented to gameArea. gameArea is only
 *     GRID_WIDTH * 2 columns - the width of the board - so a 40-column menu
 *     asking for left:"center" inside it resolved to left:-5 and hung five
 *     columns off the left edge.
 *
 *   - The screen is created with `input: null`: blessed never receives a real
 *     key, so the List's keys:true and focus() could never fire. Meanwhile
 *     handleMenuInput moved gameData.menuSelection, which the List ignored.
 *     Two competing menus, neither of them working.
 *
 * Pengo was the only arcade door still doing this; the other eight already
 * drive their menus from gameData.menuSelection.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nothingRelaysOnBlessedReceivingKeys = nothingRelaysOnBlessedReceivingKeys;
exports.theMenuIsDrivenByMenuSelection = theMenuIsDrivenByMenuSelection;
exports.noPopupIsWiderThanItsParent = noPopupIsWiderThanItsParent;
exports.noMenuLineExceedsItsWidth = noMenuLineExceedsItsWidth;
exports.theSelectedRowIsPickedOut = theSelectedRowIsPickedOut;
exports.aSettingsRowShowsItsValue = aSettingsRowShowsItsValue;
exports.theSelectionWrapsAtBothEnds = theSelectionWrapsAtBothEnds;
exports.noDoorInheritsArkanoidsBricks = noDoorInheritsArkanoidsBricks;
const assert_1 = __importDefault(require("assert"));
const fs_1 = require("fs");
const path_1 = require("path");
const constants_1 = require("../game/constants");
function indexSource() {
    return (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '..', 'index.ts'), 'utf8');
}
/** No screen may rely on blessed receiving keys, because it never does. */
async function nothingRelaysOnBlessedReceivingKeys() {
    const src = indexSource();
    assert_1.default.ok(/input: null/.test(src), 'this test assumes the screen takes no input; if that changed, revisit it');
    assert_1.default.ok(!/new List\(/.test(src), 'a blessed List owns its own selection and needs real key events - it can never work here');
    assert_1.default.ok(!/screen\.emit\('keypress'/.test(src), 're-emitting keypress at the screen and hoping a widget catches it is not a menu');
}
/** The menu is driven by the door's own selection state. */
async function theMenuIsDrivenByMenuSelection() {
    const src = indexSource();
    assert_1.default.ok(/case "menu":\s*\n\s*handleMenuInput\(inputKey\);/.test(src), 'menu input must reach handleMenuInput');
    assert_1.default.ok(/selection: gameData\.menuSelection/.test(src), 'the rendered menu must take its selection from gameData - it is drawn by the ' +
        'shared arcade menu now, which is given the selection rather than reading it');
    assert_1.default.ok(constants_1.MENU_OPTIONS.length > 1, 'there should be something to navigate');
}
/**
 * No popup is wider than what it is parented to.
 *
 * gameArea is the board's width, not the screen's, which is what pushed the
 * menu off the left edge.
 */
async function noPopupIsWiderThanItsParent() {
    const src = indexSource();
    const boardColumns = constants_1.GRID_WIDTH * 2;
    // Every popup that asks to be centred must be parented to the screen.
    const centred = [...src.matchAll(/new (?:Box|ScrollableBox)\(\{([\s\S]*?)\n  \}\)/g)];
    for (const [, body] of centred) {
        if (!/left: "center"/.test(body))
            continue;
        const width = body.match(/width:\s*(\d+)/);
        const parent = body.match(/parent:\s*(\w+)/);
        if (!width || !parent)
            continue;
        if (Number(width[1]) > boardColumns) {
            assert_1.default.strictEqual(parent[1], 'screen', `a ${width[1]}-column popup centred inside ${parent[1]} (only ${boardColumns} ` +
                'columns wide) resolves to a negative left and hangs off the screen');
        }
    }
}
/**
 * The shared arcade menu, which nine doors now draw through.
 *
 * Tested from here because pengo was the pilot adoption. The module lives in
 * sdk/engines/ui/arcade so a fix reaches every door at once - the same menu
 * was written nine times, and three separate hand-sweeps over those copies
 * (ghost borders, arrow keys, the wrap fix) each missed doors.
 */
const arcade_1 = require("@amiexpress/bbs-door-sdk/engines/ui/arcade");
/** Nothing may exceed the width it was asked for, or the box wraps. */
async function noMenuLineExceedsItsWidth() {
    for (const width of [30, 40, 54]) {
        const lines = (0, arcade_1.arcadeMenu)({
            title: ['A LONG ENOUGH TITLE'],
            options: ['Start Game', { label: 'Difficulty', value: 'MEDIUM' }, 'Quit'],
            selection: 1,
            width,
            subtitle: 'Classic Arcade Action!',
        });
        for (const line of lines) {
            assert_1.default.ok((0, arcade_1.visibleLength)(line) <= width, `a line of ${(0, arcade_1.visibleLength)(line)} columns in a ${width}-column menu will wrap: ` +
                JSON.stringify(line.replace(/\{[^}]*\}/g, '')));
        }
    }
}
/** The selected row is marked the way Arkanoid marks it. */
async function theSelectedRowIsPickedOut() {
    const lines = (0, arcade_1.arcadeMenu)({
        title: [], options: ['One', 'Two', 'Three'], selection: 1, width: 30,
    });
    const painted = lines.join('\n');
    assert_1.default.ok(/> Two </.test(painted.replace(/\{[^}]*\}/g, '')), 'the selected row gets the markers');
    assert_1.default.ok(!/> One </.test(painted.replace(/\{[^}]*\}/g, '')), 'and only the selected row');
    assert_1.default.ok(/-bg\}/.test(painted), 'the selected row is highlighted, not merely marked');
}
/** A settings row shows what it is set to. */
async function aSettingsRowShowsItsValue() {
    assert_1.default.strictEqual((0, arcade_1.optionText)({ label: 'Skill', value: 'HARD' }, false), '  Skill: HARD  ');
    assert_1.default.strictEqual((0, arcade_1.optionText)({ label: 'Skill', value: 'HARD' }, true), '> Skill: HARD <');
    assert_1.default.strictEqual((0, arcade_1.optionText)('Quit', false), '  Quit  ');
}
/**
 * The selection wraps at both ends, as a cabinet does.
 *
 * Several doors clamped instead, so holding down on the last row felt broken
 * when the row was merely last.
 */
async function theSelectionWrapsAtBothEnds() {
    assert_1.default.strictEqual((0, arcade_1.moveSelection)(0, 4, -1), 3, 'up from the first row reaches the last');
    assert_1.default.strictEqual((0, arcade_1.moveSelection)(3, 4, +1), 0, 'down from the last row returns to the first');
    assert_1.default.strictEqual((0, arcade_1.moveSelection)(1, 4, +1), 2);
    assert_1.default.strictEqual((0, arcade_1.moveSelection)(0, 0, +1), 0, 'an empty menu cannot move anywhere');
}
/** Arkanoid's brick strip is NOT inherited by every door. */
async function noDoorInheritsArkanoidsBricks() {
    const lines = (0, arcade_1.arcadeMenu)({ title: ['X'], options: ['A'], selection: 0, width: 20 });
    const accented = (0, arcade_1.arcadeMenu)({
        title: ['X'], options: ['A'], selection: 0, width: 20, accent: ['{red-bg}  {/}'],
    });
    assert_1.default.ok(accented.length > lines.length, 'a door that wants an accent supplies its own');
    assert_1.default.ok(!lines.some(l => /-bg\}\s+\{\//.test(l) && !/> A </.test(l)), 'the default menu draws no decorative block strip');
}
//# sourceMappingURL=menu.test.js.map