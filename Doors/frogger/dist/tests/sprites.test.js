"use strict";
/**
 * The sprite sheet: valid to the engine, and editable in SPRITED.
 *
 * Two different bars, and the second is the strict one. A sprite only has
 * to parse to be DRAWN, but the studio's pixel mode refuses any frame whose
 * cells are not pure half-blocks - so a sprite authored with arbitrary
 * characters would render fine and then be uneditable, which is the sort of
 * thing nobody notices until they try to fix a sprite and cannot.
 *
 * The colours come from Doors/frogger/reference/frogger-sprites.png, the
 * arcade rip, sampled rather than eyeballed.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.everySpriteFileParses = everySpriteFileParses;
exports.everySpriteIsAWholeNumberOfCells = everySpriteIsAWholeNumberOfCells;
exports.sceneryIsOneRowTallAndEverythingElseIsTwo = sceneryIsOneRowTallAndEverythingElseIsTwo;
exports.everyFrameIsEditableInTheStudio = everyFrameIsEditableInTheStudio;
exports.theGameplaySpritesExist = theGameplaySpritesExist;
exports.spriteWidthsMatchTheObjectsTheyDraw = spriteWidthsMatchTheObjectsTheyDraw;
const assert_1 = __importDefault(require("assert"));
const fs = __importStar(require("fs"));
const path_1 = require("path");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const constants_1 = require("../game/constants");
const SPRITE_DIR = (0, path_1.join)(__dirname, '..', 'sprites');
function load() {
    return fs.readdirSync(SPRITE_DIR)
        .filter((f) => f.endsWith('.sprite.json'))
        .sort()
        .map((file) => ({
        file,
        sprite: (0, cell_art_1.parseSprite)(JSON.parse(fs.readFileSync((0, path_1.join)(SPRITE_DIR, file), 'utf8')), file),
    }));
}
/** Every file in sprites/ is a sprite the engine accepts. */
async function everySpriteFileParses() {
    const all = load();
    assert_1.default.ok(all.length > 0, 'there are sprites to load');
    for (const { file, sprite } of all) {
        assert_1.default.ok(sprite.name, `${file} has a name`);
        assert_1.default.ok(Object.keys(sprite.animations).length > 0, `${file} has an animation`);
    }
}
/**
 * Every sprite is a whole number of grid cells wide and exactly one tall.
 *
 * A sprite half a cell wide would sit between columns and no amount of
 * careful drawing would make it land right.
 */
async function everySpriteIsAWholeNumberOfCells() {
    for (const { file, sprite } of load()) {
        assert_1.default.strictEqual(sprite.cellW % constants_1.CELL_WIDTH, 0, `${file} is ${sprite.cellW} chars wide, not a multiple of ${constants_1.CELL_WIDTH}`);
    }
}
/**
 * A sprite is as tall as the lane it lives in.
 *
 * The moving lanes are two rows and the standing ground - the start bank,
 * the median, the home row - is one. A two-row sprite in a one-row lane
 * does not get clipped, it BLEEDS: the home row's frames were drawing their
 * bottom halves into the top water lane, which looked like debris floating
 * in the river. Caught by rendering a board and reading it, which is the
 * only way this kind of fault shows itself.
 */
async function sceneryIsOneRowTallAndEverythingElseIsTwo() {
    const oneRow = new Set(['home', 'bank', 'frog-sit']);
    for (const { file, sprite } of load()) {
        const expected = oneRow.has(sprite.name) ? 1 : constants_1.CELL_HEIGHT;
        assert_1.default.strictEqual(sprite.cellH, expected, `${file} is ${sprite.cellH} rows tall; it lives in a ${expected}-row lane`);
    }
}
/**
 * Every frame opens in SPRITED's pixel mode.
 *
 * `decompilePixels` returning null is exactly the check the studio's editor
 * makes before it will let you paint pixels, so this is the same gate the
 * user meets, not an approximation of it.
 */
async function everyFrameIsEditableInTheStudio() {
    for (const { file, sprite } of load()) {
        for (const [anim, animation] of Object.entries(sprite.animations)) {
            animation.frames.forEach((frame, i) => {
                assert_1.default.ok((0, cell_art_1.decompilePixels)(frame) !== null, `${file} ${anim} frame ${i} is not pure half-blocks, so SPRITED cannot edit it`);
            });
        }
    }
}
/** The sprites the game needs, with the animations it asks them for. */
async function theGameplaySpritesExist() {
    const byName = new Map(load().map(({ sprite }) => [sprite.name, sprite]));
    const frog = byName.get('frog');
    assert_1.default.ok(frog, 'there is a frog');
    for (const anim of ['idle', 'hop-up', 'hop-down', 'hop-left', 'hop-right',
        'death-splat', 'death-drown', 'home']) {
        assert_1.default.ok(frog.animations[anim], `the frog can ${anim}`);
    }
    const turtle = byName.get('turtle');
    assert_1.default.ok(turtle, 'there are turtles');
    for (const anim of ['up', 'sinking', 'under']) {
        assert_1.default.ok(turtle.animations[anim], `a turtle can be ${anim}`);
    }
    for (const name of ['car', 'truck', 'log-short', 'log-medium', 'log-long',
        'crocodile', 'snake', 'home', 'bank']) {
        assert_1.default.ok(byName.get(name), `there is a ${name} sprite`);
    }
}
/**
 * A sprite is as wide as the object the rules move.
 *
 * The widths in OBJECT_WIDTHS are what collision and lane packing use; a
 * sprite drawn wider than its object would let the frog stand on painted
 * water, which is the worst class of bug this door can have.
 */
async function spriteWidthsMatchTheObjectsTheyDraw() {
    const byName = new Map(load().map(({ sprite }) => [sprite.name, sprite]));
    const expect = [
        ['truck', constants_1.OBJECT_WIDTHS.truck],
        ['log-short', constants_1.OBJECT_WIDTHS.shortLog],
        ['log-medium', constants_1.OBJECT_WIDTHS.mediumLog],
        ['log-long', constants_1.OBJECT_WIDTHS.longLog],
        ['turtle', constants_1.OBJECT_WIDTHS.turtle],
        ['crocodile', constants_1.OBJECT_WIDTHS.crocodile],
        ['car', constants_1.OBJECT_WIDTHS.car],
        ['snake', constants_1.OBJECT_WIDTHS.snake],
    ];
    for (const [name, cells] of expect) {
        const sprite = byName.get(name);
        assert_1.default.ok(sprite, `there is a ${name} sprite`);
        assert_1.default.strictEqual(sprite.cellW, cells * constants_1.CELL_WIDTH, `${name} is ${sprite.cellW} chars for an object ${cells} cells wide`);
    }
}
//# sourceMappingURL=sprites.test.js.map