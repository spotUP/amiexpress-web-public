"use strict";
/**
 * Nothing in a road sprite may be drawn in the road's own colour.
 *
 * The sysop, 2026-09-15: "frogger has sprites with black pixels that are not
 * visible on black backgrounds. the cars wheels etc."
 *
 * Every vehicle is drawn as half-blocks - the body is the background of a
 * `▀`/`▄` cell and the wheels are the FOREGROUND of the other half. Those
 * wheels were colour 0, which is exactly the colour of the road behind them,
 * so each wheel read as a hole punched through the car rather than a wheel.
 * They are blue now.
 *
 * The rule is stated as a property rather than as four expected values,
 * because the next sprite someone draws by hand will reach for black again.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.noRoadSpriteDrawsInBlack = noRoadSpriteDrawsInBlack;
exports.theRoadStillShowsThroughTheOtherHalf = theRoadStillShowsThroughTheOtherHalf;
exports.everyCellStillHasItsGlyph = everyCellStillHasItsGlyph;
const assert_1 = __importDefault(require("assert"));
const fs_1 = require("fs");
const path_1 = require("path");
/** ANSI black: the road, the night sky, and the terminal's own ground. */
const BLACK = 0;
/** The sprites that appear over the ROAD, where the background is black. */
const ROAD_SPRITES = ['car', 'car-red', 'racecar', 'truck'];
function cellsOf(name) {
    const path = (0, path_1.join)(__dirname, '..', 'sprites', `${name}.sprite.json`);
    const sprite = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
    const cells = [];
    for (const animation of Object.values(sprite.animations)) {
        for (const frame of animation.frames) {
            for (const row of frame) {
                for (const cell of row)
                    cells.push(cell);
            }
        }
    }
    return cells;
}
/** A vehicle's own pixels are visible against the road. */
async function noRoadSpriteDrawsInBlack() {
    for (const name of ROAD_SPRITES) {
        const drawnInBlack = cellsOf(name).filter((cell) => cell !== null && cell[1] === BLACK);
        assert_1.default.deepStrictEqual(drawnInBlack, [], `${name} draws ${drawnInBlack.length} cell(s) in the road's own colour`);
    }
}
/**
 * The transparent half is still transparent.
 *
 * A vehicle is a half-block: one half is the body, the other half must let the
 * road through. Recolouring the wheels must not have filled that in - a car
 * with a solid rectangle behind it is a worse bug than an invisible wheel.
 */
async function theRoadStillShowsThroughTheOtherHalf() {
    for (const name of ROAD_SPRITES) {
        const transparent = cellsOf(name).filter((cell) => cell !== null && cell[2] === BLACK);
        assert_1.default.ok(transparent.length > 0, `${name} has no cell left with the road as its background`);
    }
}
/** Every cell still carries a glyph, so the recolour edited colours only. */
async function everyCellStillHasItsGlyph() {
    for (const name of ROAD_SPRITES) {
        for (const cell of cellsOf(name)) {
            if (cell === null)
                continue;
            assert_1.default.strictEqual(typeof cell[0], 'string', `${name} has a cell with no glyph`);
            assert_1.default.ok(cell[0].length > 0, `${name} has an empty glyph`);
        }
    }
}
//# sourceMappingURL=sprite-colours.test.js.map